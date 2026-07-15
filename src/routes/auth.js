const express = require('express');
const {
  SESSION_COOKIE,
  createToken,
  verifyToken,
  verifyCredentials,
  cookieOptions,
} = require('../services/authService');

const router = express.Router();

// POST /api/auth/login { username, password } -> sets the session cookie
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const ok = await verifyCredentials(username, password);
    // Deliberately vague: don't reveal whether the user exists.
    if (!ok) return res.status(401).json({ error: 'Usuari o contrasenya incorrectes' });
    res.cookie(SESSION_COOKIE, createToken(String(username).toLowerCase()), cookieOptions());
    res.json({ ok: true, username: String(username).toLowerCase() });
  } catch (err) {
    console.error('[auth] login failed:', err.message);
    res.status(500).json({ error: 'Error en iniciar sessió' });
  }
});

// POST /api/auth/logout -> clears the session cookie
router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

// GET /api/auth/me -> { admin: true, username } when signed in, else { admin: false }
router.get('/me', (req, res) => {
  try {
    const username = verifyToken(req.cookies && req.cookies[SESSION_COOKIE]);
    if (!username) return res.json({ admin: false });
    res.json({ admin: true, username });
  } catch (err) {
    res.json({ admin: false });
  }
});

module.exports = router;
