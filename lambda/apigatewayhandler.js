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
