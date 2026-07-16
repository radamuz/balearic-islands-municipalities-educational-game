// Visitants identificats per empremta (FingerprintJS).
//
// Cada visitant es guarda com a item pk=VISITOR, sk=<visitorId>. L'empremta la
// calcula el navegador (FingerprintJS) i l'envia amb POST /api/visitors; aquí
// fem upsert: si no existeix, li assignem un nom mallorquí determinista; si
// existeix, actualitzem lastSeen, visitCount i fusionem IPs/origins.
//
// La classificació humà/bot es fa per heurística sobre l'User-Agent i, si n'hi
// ha, senyals del fingerprint (HeadlessChrome, etc.).

const { GetCommand, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS } = require('../config/dynamo');
const { parseUserAgent } = require('./accessLogService');

const VISITOR_COOKIE = 'balears_visitor';
const MAX_VISITORS = 2000;
const MERGE_CAP = 20; // màx IPs/origins guardats per visitant

// Noms mallorquins per assignar als visitants. La tria és determinista per hash
// del visitorId, de manera que el mateix ID sempre obté el mateix nom encara que
// es regeneri l'item.
const MALLORQUIN_NAMES = [
  'Biel', 'Pau', 'Tomeu', 'Miquel', 'Joan', 'Antoni', 'Pere', 'Llorenç',
  'Mateu', 'Bernat', 'Xim', 'Miquel Àngel', 'Catalina', 'Margalida', 'Antònia',
  'Maria', 'Aina', 'Bàrbara', 'Joana', 'Francina', 'Esperança', 'Conxita',
  'Xesca', 'Neus', 'Tòfol', 'Xavier', 'Rafel', 'Andreu', 'Salvador', 'Marga',
  'Coloma', 'Damià', 'Eulàlia', 'Felix', 'Gabriel', 'Hilari', 'Isabel', 'Jaume',
  'Kika', 'Lluc', 'Magdalena', 'Nadal', 'Oriol', 'Primitiva', 'Quico', 'Roser',
  'Sebastià', 'Ticià', 'Úrsula', 'Vicenç', 'Xenia', 'Yolanda', 'Zelmira',
];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mallorquinNameFor(visitorId) {
  const idx = hashStr(String(visitorId || '')) % MALLORQUIN_NAMES.length;
  return MALLORQUIN_NAMES[idx];
}

// Nom llegible generat automàticament quan s'esgoten els noms mallorquins.
// Format "Amic 1234" — determinista per visitorId perquè sigui estable.
function autoReadableName(visitorId) {
  return 'Amic ' + (1000 + (hashStr(String(visitorId || '')) % 9000));
}

// Conjunt de noms ja en ús (per evitar col·lisions). Escaneja només quan es
// crea un visitant nou, així no carrega les escriptures recurrents.
async function usedNames() {
  const used = new Set();
  if (!isDynamoEnabled()) return used;
  try {
    let startKey;
    do {
      const res = await getDocClient().send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': KEYS.VISITOR },
        ProjectionExpression: '#n',
        ExpressionAttributeNames: { '#n': 'name' },
        ExclusiveStartKey: startKey,
      }));
      for (const it of (res.Items || [])) if (it.name) used.add(it.name);
      startKey = res.LastEvaluatedKey;
    } while (startKey);
  } catch (err) {
    console.error('[visitors] usedNames failed:', err.message);
  }
  return used;
}

// Tria un nom per a un visitant nou: el mallorquí determinista si està lliure,
// un altre mallorquí lliure si el primer està agafat, o un nom llegible auto
// si tots els mallorquins estan esgotats.
async function pickUniqueName(visitorId) {
  const used = await usedNames();
  const base = mallorquinNameFor(visitorId);
  if (!used.has(base)) return base;
  for (const n of MALLORQUIN_NAMES) if (!used.has(n)) return n;
  let name = autoReadableName(visitorId);
  // Molt improbable, però si el nom auto també col·lisiona, append un sufix.
  let i = 2;
  while (used.has(name)) name = `${autoReadableName(visitorId)}·${i++}`;
  return name;
}

// --- Classificació humà / bot -------------------------------------------
const BOT_UA = /bot|crawl|spid|slurp|baidu|bing|yandex|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram|headless|phantom|selenium|puppeteer|wget|curl|python-requests|python\/|scrapy|httpclient|go-http-client|googlebot|adsbot|pagefetch|preview|skype|discord|slackbot|applebot|bytespider|semrush|ahrefsbot|mj12bot|dotbot|petalbot|crawler|fetcher|archive/i;

function classifyBot(ua, components) {
  const s = String(ua || '');
  if (!s.trim()) return { bot: true, reason: 'Sense User-Agent' };
  if (/HeadlessChrome/i.test(s)) return { bot: true, reason: 'HeadlessChrome' };
  if (BOT_UA.test(s)) return { bot: true, reason: 'UA de bot/crawler' };
  // Sospita per fingerprint: plugins buit + llenguatges buit + vendor buit sol
  // no és definitiu, però combinat amb poca confiança ho marquem.
  if (components && typeof components === 'object') {
    const langs = components.languages;
    if (Array.isArray(langs) && !langs.length && /Mozilla/.test(s) && !/Chrome|Firefox|Safari|Edg|Opera/.test(s)) {
      return { bot: true, reason: 'Fingerprint anòmal' };
    }
  }
  return { bot: false, reason: '' };
}

// --- IP -----------------------------------------------------------------
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  if (req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']).trim();
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Afegeix un valor a un array limitat, sense duplicats.
function pushCapped(arr, value, cap) {
  if (!value) return arr || [];
  const a = (arr || []).filter((x) => x !== value);
  a.unshift(value);
  return a.slice(0, cap);
}

// --- Upsert -------------------------------------------------------------
// Cridat pel POST /api/visitors. Fire-and-forget des de la ruta (no fa falta
// await), però retornem la promesa per qui vulgui esperar-la.
async function upsertVisitor({ visitorId, confidence, components, userAgent, ip, origin }) {
  if (!isDynamoEnabled() || !visitorId) return null;
  const client = getDocClient();
  const ua = String(userAgent || '');
  const { os, browser, deviceType, device } = parseUserAgent(ua);
  const { bot, reason } = classifyBot(ua, components);
  const now = new Date().toISOString();

  try {
    const existing = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: KEYS.VISITOR, sk: String(visitorId) },
    }));

    if (existing.Item) {
      const item = existing.Item;
      const updated = {
        ...item,
        lastSeen: now,
        visitCount: (item.visitCount || 0) + 1,
        lastIp: ip || item.lastIp,
        ips: pushCapped(item.ips, ip, MERGE_CAP),
        origins: pushCapped(item.origins, origin, MERGE_CAP),
        // No sobreescriure el nom ni la classificació si ja existeixen, però
        // actualitza senyals frescos.
        confidence: confidence != null ? Number(confidence) : item.confidence,
      };
      await client.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      return toVisitor(updated);
    }

    const item = {
      pk: KEYS.VISITOR,
      sk: String(visitorId),
      visitorId: String(visitorId),
      name: await pickUniqueName(visitorId),
      firstSeen: now,
      lastSeen: now,
      visitCount: 1,
      human: !bot,
      botReason: reason,
      confidence: confidence != null ? Number(confidence) : null,
      userAgent: ua.slice(0, 500),
      os, browser, deviceType, device,
      lastIp: ip || '',
      ips: ip ? [ip] : [],
      origins: origin ? [origin] : [],
      components: components || null,
    };
    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    return toVisitor(item);
  } catch (err) {
    console.error('[visitors] upsert failed:', err.message);
    return null;
  }
}

function toVisitor(item) {
  const { pk, sk, components, ...v } = item;
  return v;
}

// --- Llista / detall / esborra / renombra -------------------------------
async function listVisitors() {
  if (!isDynamoEnabled()) return [];
  try {
    const res = await getDocClient().send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': KEYS.VISITOR },
      Limit: MAX_VISITORS,
    }));
    return (res.Items || []).map(toVisitor).sort((a, b) =>
      new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  } catch (err) {
    console.error('[visitors] list failed:', err.message);
    return [];
  }
}

async function renameVisitor(visitorId, name) {
  if (!isDynamoEnabled() || !visitorId) return null;
  const client = getDocClient();
  const res = await client.send(new GetCommand({
    TableName: TABLE_NAME, Key: { pk: KEYS.VISITOR, sk: String(visitorId) },
  }));
  if (!res.Item) return null;
  const updated = { ...res.Item, name: String(name).trim().slice(0, 40) || res.Item.name };
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
  return toVisitor(updated);
}

async function deleteVisitor(visitorId) {
  if (!isDynamoEnabled() || !visitorId) return false;
  await getDocClient().send(new DeleteCommand({
    TableName: TABLE_NAME, Key: { pk: KEYS.VISITOR, sk: String(visitorId) },
  }));
  return true;
}

module.exports = {
  VISITOR_COOKIE,
  upsertVisitor,
  listVisitors,
  renameVisitor,
  deleteVisitor,
  mallorquinNameFor,
  classifyBot,
};
