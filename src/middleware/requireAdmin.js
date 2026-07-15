const { SESSION_COOKIE, verifyToken } = require('../services/authService');

// Gate for admin-only endpoints. The settings wheel hides these in the UI, but
// that's cosmetic — this is what actually stops an unauthenticated caller from
// overwriting the mapping or reading the access log.
function requireAdmin(req, res, next) {
  try {
    const username = verifyToken(req.cookies && req.cookies[SESSION_COOKIE]);
    if (!username) return res.status(401).json({ error: 'No autoritzat' });
    req.admin = username;
    return next();
  } catch (err) {
    // Thrown when SESSION_SECRET is missing: fail closed rather than open.
    return res.status(401).json({ error: 'No autoritzat' });
  }
}

module.exports = { requireAdmin };
