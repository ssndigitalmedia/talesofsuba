import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cdk from 'aws-cdk-lib/core';


export class TalesofsubaInfraCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    ////..................SQS QUEUES................./////////
    const project = 'TalesOfSuba-';

    ////..................SQS QUEUES................./////////

    // SQS DLQ
    const queueDlq = new sqs.Queue(this, `${project}DLQ`, {
      visibilityTimeout: Duration.seconds(300),

    });
    
    // SQS BufferingQueue
    const bufferingQueue = new sqs.Queue(this, `${project}bufferingQueue`, {
      visibilityTimeout: Duration.seconds(300),  
      deadLetterQueue: {
        queue : queueDlq,
        maxReceiveCount: 1,
      },
    });

    ////..................LOG Group................/////////
    const logGroup = new logs.LogGroup(this, `${project}Loggroup`, {
      retention: logs.RetentionDays.ONE_WEEK, // Set retention period for log events
    });

    ////..................DynamoDB................/////////
    const table = new dynamodb.Table(this, `${project}event-table`, {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: `${project}EventTable`
    });

    ////..................Roles................/////////

    const SqsHandlerLambdaExecutionRole = new iam.Role(this, `${project}SqsHandlerLambdaExecutionRole`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: `${project}SqsHandlerLambdaExecutionRole`,
    });

    SqsHandlerLambdaExecutionRole.attachInlinePolicy(new iam.Policy(this, `${project}SqsHandlerInlinePolicy`, {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'dynamodb:List*',
            'dynamodb:DescribeReservedCapacity*',
            'dynamodb:DescribeLimits',
            'dynamodb:DescribeTimeToLive',
            'dynamodb:Get*',
            'dynamodb:PutItem',
          ],
          resources: [table.tableArn],
        }),
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'sqs:ReceiveMessage',
            'sqs:DeleteMessage',
            'sqs:GetQueueAttributes',
          ],
          resources: [bufferingQueue.queueArn],
        }),
        new iam.PolicyStatement({
          actions: [
            'sqs:SendMessage',
          ],
          resources: [queueDlq.queueArn],
        }),
      ],
    }));

    const ApiGwToSqsRole = new iam.Role(this, `${project}ApiGwV2ToSqsRole`, {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      roleName: `${project}ApiGwV2ToSqsRole`,
    });


    
    ApiGwToSqsRole.addManagedPolicy(iam.ManagedPolicy.fromManagedPolicyArn(
      this, 'ApiGwPushCwPolicy',
      'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'
    ));
    
    ApiGwToSqsRole.attachInlinePolicy(new iam.Policy(this, `${project}ApiGwV2ToSqsInlinePolicy`, {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'sqs:SendMessage',
            'sqs:ReceiveMessage',
            'sqs:PurgeQueue',
            'sqs:DeleteMessage',
          ],
          resources: [bufferingQueue.queueArn],
        }),
      ],
    }));

    ////..................api Gateway................/////////

    const api = new apigwv2.CfnApi(this, `${project}HttpToSqs-API`, {
      corsConfiguration: {
        allowCredentials: false,
        allowHeaders: ["*"],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowOrigins: ["*"],
        maxAge: 43200,
      },
      name: 'HttpToSqs',
      protocolType: 'HTTP',
    });

    const stage = new apigwv2.CfnStage(this, `${project}HttpToSqsStage`, {
      apiId: api.ref,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: logGroup.logGroupArn,
        format: '{ "requestId":"$context.requestId", "ip": "$context.identity.sourceIp", "requestTime":"$context.requestTime", "httpMethod":"$context.httpMethod","routeKey":"$context.routeKey", "status":"$context.status","protocol":"$context.protocol", "responseLength":"$context.responseLength" }',
      },
    });

    const httpApiIntegSqsSendMessage = new apigwv2.CfnIntegration(this, `${project}httpApiIntegSqsSendMessage`, {
      apiId: api.ref,
      integrationType: 'AWS_PROXY',
      integrationSubtype: 'SQS-SendMessage',
      payloadFormatVersion: '1.0',
      requestParameters: {
        'QueueUrl': bufferingQueue.queueUrl,
        'MessageBody': '$request.body',
      },
      credentialsArn: ApiGwToSqsRole.roleArn,
    });

    const HttpApiRoute = new apigwv2.CfnRoute(this, `${project}HttpApiRouteSqsSendMsg`, {
      apiId: api.ref,
      routeKey: 'POST /gallery',
      target: `integrations/${httpApiIntegSqsSendMessage.ref}`,
    });

     ////..................Lambda Function................/////////

     //Lambda - SqsHandlerFunction

     const SqsHandlerFunction = new lambda.Function(this, `${project}sqshandler`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'sqshandler.handler',
      functionName: `${project}sqshandler`,
      role: SqsHandlerLambdaExecutionRole,
      environment : {
        table: table.tableName,
      }
      })

      // Associate the Lambda function with a CloudWatch Logs log group
    const lambdaLogGroup = new logs.LogGroup(this, 'MyLambdaLogGroup', {
      logGroupName: '/aws/lambda/' + SqsHandlerFunction.functionName,
      retention: logs.RetentionDays.ONE_WEEK, // Set the desired retention period
    });

     //Add SQS as event source to trigger Lambda
     SqsHandlerFunction.addEventSource(new eventsources.SqsEventSource(bufferingQueue))
     
     ////..................Outputs................/////////
     new cdk.CfnOutput(this, `${project}HttpApiEndpoint`, {
      description: "API Endpoint",
      value: api.attrApiEndpoint,
    });
    
  }
}
