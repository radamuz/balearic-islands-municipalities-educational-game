const express = require('express');
const { getMapping, saveMapping } = require('../services/mappingService');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// GET /api/mapping -> saved shape-index -> name mapping (or {} if none saved)
router.get('/', async (req, res) => {
  try {
    res.json(await getMapping());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read mapping' });
  }
});

// GET /api/mapping/export -> the live mapping as a downloadable JSON file.
// Lets an admin pull assignments edited in production back into the repo, so
// the committed mapping.json (the read fallback) doesn't drift out of date.
router.get('/export', requireAdmin, async (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="mapping.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(await getMapping(), null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to export mapping' });
  }
});

// POST /api/mapping -> persist the shape-index -> name mapping (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    await saveMapping(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[mapping] save failed:', err.message);
    res.status(500).json({ error: 'Failed to save mapping' });
  }
});

module.exports = router;
