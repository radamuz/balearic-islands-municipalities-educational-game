// Access log, stored in DynamoDB as one item per request.
//
// Entries carry a `ttl` epoch and DynamoDB expires them after 90 days: these
// rows hold IPs and user agents, i.e. personal data we shouldn't keep forever.
//
// ⚠️ SENSITIVE: by request, this also dumps full cookie values (including the
// admin session token), the Authorization header, and every raw request header.
// Anyone with read access to this DynamoDB table can impersonate any logged-in
// admin until that session token expires (8h). Rotate SESSION_SECRET to revoke
// all logged tokens if the table is ever exposed. Disable by unsetting
// ACCESS_LOG_SENSITIVE.

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
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  if (req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']).trim();
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Primary Accept-Language tag plus the full header (truncated) — tells us the
// user's preferred locale(s), useful to know "who" in aggregate.
function languages(req) {
  const full = (req.headers['accept-language'] || '').slice(0, 120);
  const primary = full.split(',')[0].split(';')[0].trim();
  return { primary, full };
}

// Classify the request so the dashboard can split API vs page vs asset traffic
// without re-deriving it client-side.
function classify(path) {
  if (!path) return 'other';
  if (path.startsWith('/api/')) return 'api';
  if (/\.(js|css|svg|png|jpe?g|gif|ico|woff2?|ttf|map|json|txt)$/i.test(path)) return 'static';
  if (path === '/' || path === '/index.html') return 'page';
  return 'other';
}

// Query string as a stable object with oversized values trimmed, so a huge
// payload can't blow up the DynamoDB item.
function safeQuery(req) {
  const q = req.query || {};
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    const s = String(v == null ? '' : v);
    out[k] = s.length > 200 ? s.slice(0, 200) + '…' : s;
  }
  return out;
}

// Cookie *names* only — never values. Lets the dashboard show whether a session
// was already present on the incoming request.
function cookieNames(req) {
  const c = req.cookies && typeof req.cookies === 'object' ? req.cookies : {};
  return Object.keys(c);
}

// Full cookie map (name → value) for the sensitive dump. This records session
// tokens and any other cookie values — see the warning in the module header.
function cookieMap(req) {
  const c = req.cookies && typeof req.cookies === 'object' ? req.cookies : {};
  const out = {};
  for (const [k, v] of Object.entries(c)) out[k] = String(v).slice(0, 1000);
  return out;
}

// Every request header, values truncated so a pathological header can't blow up
// the DynamoDB item. This is the full sensitive dump — it includes `cookie`,
// `authorization`, etc. in their raw form.
function safeHeaders(req) {
  const out = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    out[k] = String(v == null ? '' : v).slice(0, 1000);
  }
  return out;
}

// Best-effort admin identity for the "who" dimension. Resolved lazily so this
// module stays decoupled from authService (and never throws if auth is unset).
function adminIdentity(req) {
  try {
    const { SESSION_COOKIE, verifyToken } = require('../services/authService');
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    const username = verifyToken(token);
    return username ? { admin: true, username } : { admin: false, username: null };
  } catch (e) {
    return { admin: false, username: null };
  }
}

// Sec-Fetch-* metadata — the modern signal for "why / through where": site
// (cross-site/same-origin/none), mode (cors/no-cors/navigate), dest (document/
// script/style/image/empty…), user. Absent on non-secure or old clients.
function secFetch(req) {
  const h = req.headers;
  return {
    site: h['sec-fetch-site'] || '',
    mode: h['sec-fetch-mode'] || '',
    dest: h['sec-fetch-dest'] || '',
    user: h['sec-fetch-user'] || '',
  };
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

// Record one access with the maximum detail viable for a web request.
//
// Fire-and-forget by design: the Put is not awaited and any failure is
// swallowed — logging must never break or delay a request. The write is deferred
// to `res` "finish" so we can include the response status, duration and size.
function logRequest(req, res) {
  if (!isDynamoEnabled()) return;
  const sensitive = process.env.ACCESS_LOG_SENSITIVE !== '0';
  try {
    const start = Date.now();
    const ua = req.headers['user-agent'] || '';
    const h = req.headers;
    const langs = languages(req);
    const identity = adminIdentity(req);
    const fullUrl = req.originalUrl || req.url || '';
    const pathOnly = req.path || fullUrl.split('?')[0] || '';
    const sec = secFetch(req);
    const xff = h['x-forwarded-for'] ? String(h['x-forwarded-for']) : '';
    const proto = h['x-forwarded-proto'] || (req.secure ? 'https' : 'http');

    // Built once, augmented with response fields on finish.
    const baseEntry = {
      time: new Date(start).toISOString(),
      // — Who —
      ip: clientIp(req),
      ...identity,
      cookieNames: cookieNames(req),
      // — How (client) —
      method: req.method,
      httpVersion: req.httpVersion || '',
      ...parseUserAgent(ua),
      language: langs.primary,
      acceptLanguage: langs.full,
      accept: (h['accept'] || '').slice(0, 200),
      dnt: h['dnt'] || '',
      // — When — (time, plus duration filled on finish)
      // — Why / intent —
      path: pathOnly,
      query: safeQuery(req),
      kind: classify(pathOnly),
      fetch: Boolean(h['x-requested-with'] || sec.mode === 'cors' || sec.mode === 'no-cors'),
      xhr: h['x-requested-with'] === 'XMLHttpRequest',
      secFetchSite: sec.site,
      secFetchMode: sec.mode,
      secFetchDest: sec.dest,
      secFetchUser: sec.user,
      // — Through where (origin / host / proxy chain) —
      host: h['host'] || '',
      origin: h['origin'] || '',
      referer: h['referer'] || h['referrer'] || '',
      protocol: proto,
      secure: Boolean(req.secure),
      xForwardedFor: xff,
      xForwardedProto: h['x-forwarded-proto'] || '',
      xForwardedHost: h['x-forwarded-host'] || '',
      xRealIp: h['x-real-ip'] || '',
      cfConnectingIp: h['cf-connecting-ip'] || '',
      // — Request body hints —
      contentType: (h['content-type'] || '').slice(0, 120),
      contentLength: h['content-length'] || '',
      // — Raw UA for forensics —
      userAgent: ua,
      // — Sensible (cookies, auth, totes les capçaleres) — només si activat —
      ...(sensitive ? {
        cookies: cookieMap(req),
        authorization: (h['authorization'] || '').slice(0, 1000),
        headers: safeHeaders(req),
      } : {}),
    };

    const finish = () => {
      try {
        const now = Date.now();
        const entry = {
          ...baseEntry,
          status: res.statusCode || 0,
          responseTimeMs: now - start,
          responseSize: res.get('content-length') || (res.socket && res.socket.bytesWritten ? String(res.socket.bytesWritten) : ''),
          ...(sensitive && typeof res.getHeaders === 'function' ? { resHeaders: res.getHeaders() } : {}),
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
    };

    // "finish" fires after headers + body are sent; "close" covers aborted
    // responses where "finish" may not. Listen once, whichever comes first.
    let done = false;
    const once = (fn) => () => { if (!done) { done = true; fn(); } };
    if (res && typeof res.on === 'function') {
      res.on('finish', once(finish));
      res.on('close', once(finish));
    } else {
      finish();
    }
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
