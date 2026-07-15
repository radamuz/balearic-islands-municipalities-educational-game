#!/usr/bin/env node
//
// One-off setup for a fresh DynamoDB table:
//   1. uploads the committed mapping.json as the live mapping
//   2. creates (or updates) an admin user for the settings wheel
//
// Needs the AWS env vars from scripts/setup-aws.sh, either exported or in .env:
//   node scripts/seed.js
//
// Safe to re-run: both writes are idempotent PutItems.

require('dotenv').config();

const fs = require('fs');
const readline = require('readline');
const { Writable } = require('stream');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { MAPPING_PATH } = require('../src/config/paths');
const { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS } = require('../src/config/dynamo');
const { saveMapping } = require('../src/services/mappingService');
const { putAdmin } = require('../src/services/authService');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

// Same as ask(), but keeps the typed characters off the screen.
function askHidden(question) {
  return new Promise((resolve) => {
    let muted = false;
    const mutedOut = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: mutedOut, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

async function seedMapping() {
  if (!fs.existsSync(MAPPING_PATH)) {
    console.log('  mapping.json not found, skipping.');
    return;
  }
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  const count = Object.keys(mapping).length;
  if (!count) {
    console.log('  mapping.json is empty, skipping.');
    return;
  }

  const existing = await getDocClient().send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: KEYS.MAPPING, sk: 'CURRENT' },
  }));
  const existingCount = existing.Item && existing.Item.mapping
    ? Object.keys(existing.Item.mapping).length
    : 0;

  if (existingCount) {
    console.log(`  Table already holds a mapping with ${existingCount} shapes.`);
    const answer = await ask(`  Overwrite it with the ${count} shapes from mapping.json? [y/N] `);
    if (!/^y(es)?$/i.test(answer)) {
      console.log('  Left as is.');
      return;
    }
  }

  await saveMapping(mapping);
  console.log(`  Uploaded ${count} shape assignments.`);
}

async function seedAdmin() {
  const username = await ask('  Admin username: ');
  if (!username) {
    console.log('  No username given, skipping admin creation.');
    return;
  }
  const password = await askHidden('  Admin password: ');
  if (password.length < 8) {
    console.error('  Password must be at least 8 characters. Skipping.');
    return;
  }
  const confirm = await askHidden('  Repeat password: ');
  if (password !== confirm) {
    console.error('  Passwords do not match. Skipping.');
    return;
  }
  await putAdmin(username, password);
  console.log(`  Admin '${username.toLowerCase()}' ready.`);
}

async function main() {
  if (!isDynamoEnabled()) {
    console.error('error: AWS credentials not found.');
    console.error('       Run scripts/setup-aws.sh first and export the vars (or put them in .env).');
    process.exit(1);
  }

  console.log(`Table: ${TABLE_NAME} (${process.env.AWS_REGION || 'eu-west-1'})\n`);
  console.log('Mapping:');
  await seedMapping();
  console.log('\nAdmin user:');
  await seedAdmin();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
