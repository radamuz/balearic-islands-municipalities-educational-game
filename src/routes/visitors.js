const express = require('express');
const {
  VISITOR_COOKIE,
  upsertVisitor,
  listVisitors,
  renameVisitor,
  deleteVisitor,
} = require('../services/visitorService');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// Cookie per al visitant: 1 any, SameSite=Lax, no HttpOnly (el frontend no la
// llegeix, però així és inspeccionable). Marca cada petició posterior amb el
// visitorId perquè l'access-log el pugui estampar.
function visitorCookieOptions() {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

// POST /api/visitors — públic. El frontend hi puja la seva empremta.
router.post('/', async (req, res) => {
  try {
    const { visitorId, confidence, components } = req.body || {};
    if (!visitorId || typeof visitorId !== 'string') {
      return res.status(400).json({ error: 'visitorId requerit' });
    }
    const ua = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.ip || '').replace(/^::ffff:/, '');
    const origin = req.headers['origin'] || req.headers['referer'] || '';

    // Componentes poden ser grans; limita'l abans de guardar.
    const trimmedComponents = components && typeof components === 'object'
      ? Object.fromEntries(Object.entries(components).slice(0, 60))
      : null;

    const visitor = await upsertVisitor({
      visitorId: String(visitorId).slice(0, 64),
      confidence,
      components: trimmedComponents,
      userAgent: ua,
      ip,
      origin,
    });

    res.cookie(VISITOR_COOKIE, String(visitorId).slice(0, 64), visitorCookieOptions());
    res.json({ ok: true, name: visitor?.name || null, bot: visitor ? !visitor.human : null });
  } catch (err) {
    console.error('[visitors] POST failed:', err.message);
    res.status(500).json({ error: 'No s\'ha pogut registrar el visitant' });
  }
});

// GET /api/visitors — admin. Llista de visitants.
router.get('/', requireAdmin, async (req, res) => {
  try {
    res.json(await listVisitors());
  } catch (err) {
    res.status(500).json({ error: 'No s\'ha pogut llegir els visitants' });
  }
});

// PATCH /api/visitors/:id — admin. Renombra un visitant.
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    const v = await renameVisitor(req.params.id, name);
    if (!v) return res.status(404).json({ error: 'Visitant no trobat' });
    res.json(v);
  } catch (err) {
    res.status(500).json({ error: 'No s\'ha pogut renombrar' });
  }
});

// DELETE /api/visitors/:id — admin. Esborra un visitant.
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const ok = await deleteVisitor(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Visitant no trobat' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No s\'ha pogut esborrar' });
  }
});

module.exports = router;
