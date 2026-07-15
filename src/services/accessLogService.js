// Access log, stored in DynamoDB as one item per request.
//
// Entries carry a `ttl` epoch and DynamoDB expires them after 90 days: these
// rows hold IPs and user agents, i.e. personal data we shouldn't keep forever.

const { PutCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS } = require('../config/dynamo');

const MAX_ENTRIES = 5000;
const RETENTION_DAYS = 90;

// --- User-Agent parsing (lightweight, dependency-free) ---------------------
function parseUserAgent(ua) {
  const s = String(ua || '');

  // Operating system
  let os = 'Desconegut';
  if (/Windows NT 10/.test(s)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(s)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(s)) os = 'Windows 7';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/iPhone/.test(s)) os = 'iOS (iPhone)';
  else if (/iPad/.test(s)) os = 'iPadOS';
  else if (/Android[ /]?([\d.]+)?/.test(s)) os = 'Android' + (RegExp.$1 ? ' ' + RegExp.$1 : '');
  else if (/Mac OS X ([\d_]+)/.test(s)) os = 'macOS ' + RegExp.$1.replace(/_/g, '.');
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';

  // Browser (order matters: more specific first)
  let browser = 'Desconegut';
  if (/Edg(?:e|A|iOS)?\/([\d.]+)/.test(s)) browser = 'Edge ' + RegExp.$1;
  else if (/OPR\/([\d.]+)/.test(s) || /Opera\/([\d.]+)/.test(s)) browser = 'Opera ' + RegExp.$1;
  else if (/SamsungBrowser\/([\d.]+)/.test(s)) browser = 'Samsung Internet ' + RegExp.$1;
  else if (/Firefox\/([\d.]+)/.test(s)) browser = 'Firefox ' + RegExp.$1;
  else if (/Chrome\/([\d.]+)/.test(s)) browser = 'Chrome ' + RegExp.$1;
  else if (/Version\/([\d.]+).*Safari/.test(s)) browser = 'Safari ' + RegExp.$1;
  else if (/Safari\/([\d.]+)/.test(s)) browser = 'Safari';

  // Device type
  let deviceType = 'Escriptori';
  if (/iPad|Tablet/.test(s)) deviceType = 'Tauleta';
  else if (/Mobi|iPhone|Android.*Mobile/.test(s)) deviceType = 'Mòbil';
  else if (/Android/.test(s)) deviceType = 'Tauleta';

  // Vendor / model hint
  let device = '';
  if (/iPhone/.test(s)) device = 'iPhone';
  else if (/iPad/.test(s)) device = 'iPad';
  else if (/\((?:Linux; )?Android[^;]*;\s*([^;)]+?)(?:\sBuild|;|\))/.test(s)) device = RegExp.$1.trim();

  return { os, browser, deviceType, device };
}

// Best-effort real client IP, honoring common reverse-proxy headers.
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Sort key: newest-first. Timestamps are inverted against a far-future epoch so
// ascending sort-key order (what Query returns) is descending time order. The
// random suffix keeps concurrent requests in the same millisecond distinct.
const FUTURE_EPOCH_MS = 4_102_444_800_000; // 2100-01-01
const TIME_WIDTH = 13;

function accessSortKey(timeMs) {
  const inverted = String(Math.max(0, FUTURE_EPOCH_MS - timeMs)).padStart(TIME_WIDTH, '0');
  return `${inverted}#${Math.random().toString(36).slice(2, 8)}`;
}

// Strip the storage attributes so callers see only the log-entry shape.
function toEntry(item) {
  const { pk, sk, ttl, ...entry } = item;
  return entry;
}

// Read the access log, newest-first. Returns [] when unavailable.
async function getLog(limit = MAX_ENTRIES) {
  if (!isDynamoEnabled()) return [];
  try {
    const res = await getDocClient().send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': KEYS.ACCESS },
      Limit: Math.min(limit, MAX_ENTRIES),
    }));
    return (res.Items || []).map(toEntry);
  } catch (err) {
    console.error('[access-log] DynamoDB read failed:', err.message);
    return [];
  }
}

// Record one access. Fire-and-forget by design: callers don't await it, and any
// failure is swallowed — logging must never break or delay a request.
function logRequest(req) {
  if (!isDynamoEnabled()) return;
  try {
    const ua = req.headers['user-agent'] || '';
    const now = Date.now();
    const entry = {
      time: new Date(now).toISOString(),
      ip: clientIp(req),
      method: req.method,
      path: req.originalUrl || req.url,
      ...parseUserAgent(ua),
      language: (req.headers['accept-language'] || '').split(',')[0] || '',
      referer: req.headers['referer'] || req.headers['referrer'] || '',
      userAgent: ua,
    };
    getDocClient().send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: KEYS.ACCESS,
        sk: accessSortKey(now),
        ttl: Math.floor(now / 1000) + RETENTION_DAYS * 24 * 60 * 60,
        ...entry,
      },
    })).catch(() => {});
  } catch (e) {
    // Never let logging break a request.
  }
}

// Delete every access-log item, in batches of 25 (the BatchWrite limit).
async function clearLog() {
  const client = getDocClient();
  let startKey;
  do {
    const res = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': KEYS.ACCESS },
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

// Replace the whole access log with an imported array (admin import tool).
async function replaceLog(entries) {
  if (!Array.isArray(entries)) throw new Error('Access log payload must be an array');
  const trimmed = entries.slice(0, MAX_ENTRIES);
  if (!isDynamoEnabled()) return trimmed;

  await clearLog();
  const client = getDocClient();
  for (let i = 0; i < trimmed.length; i += 25) {
    await client.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: trimmed.slice(i, i + 25).map((entry) => {
          const timeMs = Date.parse(entry.time) || Date.now();
          return {
            PutRequest: {
              Item: {
                pk: KEYS.ACCESS,
                sk: accessSortKey(timeMs),
                ttl: Math.floor(timeMs / 1000) + RETENTION_DAYS * 24 * 60 * 60,
                ...entry,
              },
            },
          };
        }),
      },
    }));
  }
  return trimmed;
}

module.exports = { getLog, logRequest, replaceLog, parseUserAgent };
