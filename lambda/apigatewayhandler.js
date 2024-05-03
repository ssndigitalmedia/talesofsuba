//const aws = require('aws-sdk');

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const tableName = process.env.table;

// initialise dynamoDB client
exports.handler = async function (event, context) {
  let body;
  let statusCode = 200;
  console.log("tablename", tableName);
  const headers = {
    "Content-Type": "application/json",
  };
  try {
    console.log(event);
    console.log("Event Route Key: ", event.resource);
    if (event?.Records !== undefined && event?.Records[0]?.eventSource === "aws:sqs") {
      console.log("Incoming message body from SQS : ", event);
      const { Records } = event;
      const requestJSON = JSON.parse(Records[0].body);
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: requestJSON,
        })
      );
      console.log("SQS request Successfully written to DynamoDB");
    } else {
      switch (event.resource) {
        case "/itemsbytype/{id}":
          body = await dynamo.send(new ScanCommand({ TableName: tableName, FilterExpression: "contains(#columnname, :value)", ExpressionAttributeNames: { "#columnname": "type" }, ExpressionAttributeValues: { ":value": event.pathParameters.id } }));
          body = body.Items;
          break;
        case "/items/{id}":
          body = await dynamo.send(new ScanCommand({ TableName: tableName, FilterExpression: "contains(#columnname, :value)", ExpressionAttributeNames: { "#columnname": "slug" }, ExpressionAttributeValues: { ":value": event.pathParameters.id } }));
          body = body.Items;
          break;
        case "/items/{column}/{value}":
          body = await dynamo.send(new ScanCommand({ TableName: tableName, FilterExpression: "contains(#columnname, :value)", ExpressionAttributeNames: { "#columnname": event.pathParameters.column }, ExpressionAttributeValues: { ":value": event.pathParameters.value } }));
          body = body.Items;
          break;
        case "/userid/{id}":
          body = await dynamo.send(new ScanCommand({ TableName: tableName, FilterExpression: "contains(#columnname, :value)", ExpressionAttributeNames: { "#columnname": "userid" }, ExpressionAttributeValues: { ":value": event.pathParameters.id } }));
          body = body.Items;
          break;
        case "/itemupdate":
          const requestJSON = JSON.parse(event.body);
          console.log("Incoming message body from API Gateway for update : ", requestJSON);
          body = await dynamo.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                id: requestJSON.id,
              },
              UpdateExpression: "set description = :description",
              ExpressionAttributeValues: {
                ":description": requestJSON.description,
              },
              ReturnValues: "ALL_NEW",
            })
          );
          body = body.Items;
          console.log("DD sucessfully updated : ", requestJSON);
          break;
        case "/getsecrets":
          const secret_name = "prod/s3/ap-south";
          const responseobj = {};
          // const secretData = await GetSecretValueCommand({
          //   SecretId: secret_name,
          // }).promise();

          const client = new SecretsManagerClient();
          const secretData = await client.send(
            new GetSecretValueCommand({
              SecretId: secret_name,
            })
          );

          const replaced = secretData.SecretString.replace(/['"{}]/g, "");
          const result = replaced.split(",");
          await Promise.all(
            result.map((item) => {
              const splitted = item.split(":");
              responseobj[splitted[0]] = splitted[1];
            })
          );
          console.log("secretData retrived sucessfully");
          body = responseobj;
          break;

        default:
          throw new Error(`Unsupported route: "${event.routeKey}"`);
      }
    }
  } catch (err) {
    console.log("Lamba error", err.message);
    statusCode = 400;
    body = err.message;
  } finally {
    console.log("Lamba response", body);
    statusCode = 200;
    body = JSON.stringify(body);
  }
  return {
    statusCode,
    body,
    headers,
  };
};
