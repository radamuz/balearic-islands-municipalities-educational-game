// Admin authentication.
//
// Admin users live in DynamoDB (pk=ADMIN, sk=<username>) with a bcrypt hash.
// A successful login returns a signed, stateless session token kept in an
// HttpOnly cookie — no server-side session store, which suits Vercel's
// stateless lambdas.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { getDocClient, isDynamoEnabled, TABLE_NAME, KEYS } = require('../config/dynamo');

const SESSION_COOKIE = 'balears_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

// Token format: <username>.<expiryMs>.<hmac>
function createToken(username) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${Buffer.from(username).toString('base64url')}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the username for a valid, unexpired token, or null.
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedUser, expires, mac] = parts;
  const payload = `${encodedUser}.${expires}`;

  const expected = sign(payload);
  // Constant-time compare so a wrong signature can't be guessed by timing.
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (macBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(macBuf, expectedBuf)) return null;

  if (!Number(expires) || Date.now() > Number(expires)) return null;
  return Buffer.from(encodedUser, 'base64url').toString('utf8');
}

// Validate credentials against the admin record in DynamoDB.
async function verifyCredentials(username, password) {
  if (!username || !password) return false;
  if (!isDynamoEnabled()) return false;
  try {
    const res = await getDocClient().send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: KEYS.ADMIN, sk: String(username).toLowerCase() },
    }));
    if (!res.Item || !res.Item.passwordHash) return false;
    return bcrypt.compare(password, res.Item.passwordHash);
  } catch (err) {
    console.error('[auth] DynamoDB read failed:', err.message);
    return false;
  }
}

// Create or update an admin user (used by scripts/seed.js).
async function putAdmin(username, password) {
  const passwordHash = await bcrypt.hash(password, 12);
  await getDocClient().send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: KEYS.ADMIN,
      sk: String(username).toLowerCase(),
      username: String(username).toLowerCase(),
      passwordHash,
      updatedAt: new Date().toISOString(),
    },
  }));
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

module.exports = {
  SESSION_COOKIE,
  createToken,
  verifyToken,
  verifyCredentials,
  putAdmin,
  cookieOptions,
};
