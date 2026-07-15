const express = require('express');
const { getLog, replaceLog } = require('../services/accessLogService');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// The whole access log is admin-only: it holds visitors' IPs and user agents.
router.use(requireAdmin);

// GET /api/access-log?limit=N -> recent access entries, newest first
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10);
    res.json(await getLog(Number.isFinite(limit) && limit > 0 ? limit : undefined));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read access log' });
  }
});

// GET /api/access-log/export -> full access log as a downloadable JSON file
router.get('/export', async (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="access-log.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(await getLog(), null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to export access log' });
  }
});

// POST /api/access-log/import -> replace the whole access log with the payload
router.post('/import', async (req, res) => {
  try {
    const log = await replaceLog(req.body);
    res.json({ ok: true, count: log.length });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to import access log' });
  }
});

module.exports = router;
