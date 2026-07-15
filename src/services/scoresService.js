// Arcade leaderboard, stored in DynamoDB as one item per run.
//
// One item per run (rather than a single document holding the whole table) is
// deliberate: on Vercel two players finishing at once run in separate lambdas,
// and a read-modify-write of a shared document would silently drop one of them.

const { PutCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS } = require('../config/dynamo');

const MAX_SCORES = 100;

// Sort-key encoding. DynamoDB returns Query results ordered by sort key, so we
// bake the leaderboard's ordering into it and get sorting for free:
//   best-first = points DESC, then timeMs ASC (ties broken by faster run)
// Points are inverted (MAX - points) so ascending sk == descending points, and
// both fields are zero-padded to a fixed width so they compare lexicographically
// the way they would numerically.
const MAX_POINTS = 9_999_999;
const POINTS_WIDTH = 7;
const TIME_WIDTH = 9;

function scoreSortKey(points, timeMs, date) {
  const inverted = String(Math.max(0, MAX_POINTS - points)).padStart(POINTS_WIDTH, '0');
  const time = String(Math.min(timeMs, 10 ** TIME_WIDTH - 1)).padStart(TIME_WIDTH, '0');
  // The date suffix keeps sort keys unique when two runs tie exactly.
  return `${inverted}#${time}#${date}`;
}

// Coerce an arbitrary payload into a well-formed score entry. Unchanged from
// the previous on-disk implementation — the API contract is the same.
function sanitize(entry, keepDate = false) {
  return {
    name: String(entry.name || 'ANÓNIMO').trim().slice(0, 12).toUpperCase() || 'ANÓNIMO',
    points: Math.max(0, Math.round(Number(entry.points) || 0)),
    timeMs: Math.max(0, Math.round(Number(entry.timeMs) || 0)),
    correct: Math.max(0, Math.round(Number(entry.correct) || 0)),
    mistakes: Math.max(0, Math.round(Number(entry.mistakes) || 0)),
    total: Math.max(0, Math.round(Number(entry.total) || 0)),
    maxCombo: Math.max(0, Math.round(Number(entry.maxCombo) || 0)),
    date: keepDate && entry.date ? String(entry.date) : new Date().toISOString(),
  };
}

// Strip the storage keys so callers only ever see the score shape.
function toEntry(item) {
  const { pk, sk, ...entry } = item;
  return entry;
}

// Read the leaderboard, best-first. Returns [] when DynamoDB is unavailable —
// an empty board is better than a 500 on the game's finish screen.
async function getScores(limit = MAX_SCORES) {
  if (!isDynamoEnabled()) return [];
  try {
    const res = await getDocClient().send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': KEYS.SCORE },
      Limit: Math.min(limit, MAX_SCORES),
    }));
    return (res.Items || []).map(toEntry);
  } catch (err) {
    console.error('[scores] DynamoDB read failed:', err.message);
    return [];
  }
}

// Record a finished run. Returns the entry plus its rank on the board.
async function addScore(entry) {
  const clean = sanitize(entry);
  if (!isDynamoEnabled()) {
    return { entry: clean, rank: null, scores: [] };
  }
  try {
    await getDocClient().send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: KEYS.SCORE,
        sk: scoreSortKey(clean.points, clean.timeMs, clean.date),
        ...clean,
      },
    }));
    // Re-read to resolve the rank against everyone else's runs.
    const scores = await getScores();
    const rank = scores.findIndex((s) => s.date === clean.date && s.name === clean.name) + 1;
    return { entry: clean, rank: rank || null, scores };
  } catch (err) {
    // Degrade instead of 500ing: the player just finished a run and should still
    // see their result, even if we couldn't record it.
    console.error('[scores] DynamoDB write failed:', err.message);
    return { entry: clean, rank: null, scores: [] };
  }
}

// Delete every score item, in batches of 25 (the BatchWrite limit).
async function clearScores() {
  const client = getDocClient();
  let startKey;
  do {
    const res = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': KEYS.SCORE },
      ProjectionExpression: 'pk, sk',
      ExclusiveStartKey: startKey,
    }));
    const items = res.Items || [];
    for (let i = 0; i < items.length; i += 25) {
      await client.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: items.slice(i, i + 25).map((it) => ({
            DeleteRequest: { Key: { pk: it.pk, sk: it.sk } },
          })),
        },
      }));
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);
}

// Replace the whole leaderboard with an imported array (admin import tool).
async function replaceScores(entries) {
  if (!Array.isArray(entries)) throw new Error('Scores payload must be an array');
  const clean = entries
    .map((e) => sanitize(e, true))
    .sort((a, b) => b.points - a.points || a.timeMs - b.timeMs)
    .slice(0, MAX_SCORES);

  if (!isDynamoEnabled()) return clean;

  await clearScores();
  const client = getDocClient();
  for (let i = 0; i < clean.length; i += 25) {
    await client.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: clean.slice(i, i + 25).map((entry) => ({
          PutRequest: {
            Item: {
              pk: KEYS.SCORE,
              sk: scoreSortKey(entry.points, entry.timeMs, entry.date),
              ...entry,
            },
          },
        })),
      },
    }));
  }
  return clean;
}

module.exports = { getScores, addScore, replaceScores };
