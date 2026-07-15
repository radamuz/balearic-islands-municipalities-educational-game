// The shape-index -> name mapping lives in DynamoDB as a single document item,
// mirroring how the app already treats it: the editor saves the whole thing.
//
// Reads fall back to the mapping.json committed in the repo whenever DynamoDB
// is unavailable or empty, so the map always renders — a failed AWS call should
// never leave players with an unlabelled map.

const fs = require('fs');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { MAPPING_PATH } = require('../config/paths');
const { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS } = require('../config/dynamo');

const MAPPING_KEY = { pk: KEYS.MAPPING, sk: 'CURRENT' };

function readMappingFile() {
  if (!fs.existsSync(MAPPING_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

async function getMapping() {
  if (!isDynamoEnabled()) return readMappingFile();
  try {
    const res = await getDocClient().send(new GetCommand({
      TableName: TABLE_NAME,
      Key: MAPPING_KEY,
    }));
    const mapping = res.Item && res.Item.mapping;
    if (mapping && Object.keys(mapping).length > 0) return mapping;
    // Table not seeded yet — serve the repo copy rather than an empty map.
    return readMappingFile();
  } catch (err) {
    console.error('[mapping] DynamoDB read failed, falling back to file:', err.message);
    return readMappingFile();
  }
}

async function saveMapping(mapping) {
  if (!isDynamoEnabled()) {
    // Local dev with no AWS attached: keep the previous on-disk behaviour so
    // the mapping editor stays usable.
    fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), 'utf8');
    return;
  }
  await getDocClient().send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { ...MAPPING_KEY, mapping, updatedAt: new Date().toISOString() },
  }));
}

module.exports = { getMapping, saveMapping };
