//const aws = require('aws-sdk');

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
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
    console.log("Event Route Key: ", event.routeKey);
    if (event?.Records[0]?.eventSource === "aws:sqs") {
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
      switch (event.routeKey) {
        case "DELETE /items/{id}":
          await dynamo.send(
            new DeleteCommand({
              TableName: tableName,
              Key: {
                id: event.pathParameters.id,
              },
            })
          );
          body = `Deleted item ${event.pathParameters.id}`;
          break;
        case "GET /itemsbytype/{id}":
          body = await dynamo.send(new ScanCommand({ TableName: tableName, FilterExpression: "contains(#columnname, :value)", ExpressionAttributeNames: { "#columnname": "type" }, ExpressionAttributeValues: { ":value": event.pathParameters.id } }));
          body = body.Items;
          break;
        case "GET /items/{id}":
          body = await dynamo.send(new ScanCommand({ TableName: tableName, FilterExpression: "contains(#columnname, :value)", ExpressionAttributeNames: { "#columnname": "slug" }, ExpressionAttributeValues: { ":value": event.pathParameters.id } }));
          body = body.Items;
          break;
        // case "PUT /items":
        //
        //   const { Records } = event;
        //   const requestJSON = JSON.parse(Records[0].body);
        //   await dynamo.send(
        //     new PutCommand({
        //       TableName: tableName,
        //       Item: requestJSON,
        //     })
        //   );
        //   body = `Put item ${requestJSON.id}`;
        //   break;
        // case "POST /items":
        //   // from SQS
        //   const { Records1 } = event;
        //   const requestJSON1 = JSON.parse(Records1[0].body);
        //   await dynamo.send(
        //     new UpdateCommand({
        //       TableName: tableName,
        //       Item: requestJSON1,
        //     })
        //   );
        //   body = `Post item ${requestJSON1.id}`;
        //   break;
        default:
          throw new Error(`Unsupported route: "${event.routeKey}"`);
      }
    }
  } catch (err) {
    statusCode = 400;
    body = err.message;
  } finally {
    statusCode = 200;
    body = JSON.stringify(body);
  }
  return {
    statusCode,
    body,
    headers,
  };
};
