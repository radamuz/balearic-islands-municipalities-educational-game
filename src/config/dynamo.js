// Shared DynamoDB document client.
//
// Everything lives in one table (single-table design), keyed by pk/sk where the
// pk prefix discriminates the entity: MAPPING / SCORE / ACCESS / ADMIN.
//
// When the AWS env vars are absent (typical local dev) `isDynamoEnabled()`
// returns false and callers fall back to their on-disk behaviour, so the app
// still runs with no AWS account attached.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'balears-app';
const REGION = process.env.AWS_REGION || 'eu-west-1';

// Key prefixes, kept here so services can't drift apart on naming.
const KEYS = {
  MAPPING: 'MAPPING',
  SCORE: 'SCORE',
  ACCESS: 'ACCESS',
  ADMIN: 'ADMIN',
  VISITOR: 'VISITOR',
};

let docClient = null;

// True when credentials are configured. On Vercel these come from the env vars
// printed by scripts/setup-aws.sh.
function isDynamoEnabled() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

// Lazily built so importing this module never throws in a credential-less env.
function getDocClient() {
  if (!docClient) {
    const config = { region: REGION };
    // Point at DynamoDB Local for testing; unset in production.
    if (process.env.DYNAMODB_ENDPOINT) config.endpoint = process.env.DYNAMODB_ENDPOINT;
    const base = new DynamoDBClient(config);
    docClient = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

module.exports = { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS };
