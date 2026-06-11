const express = require('express');
const { getMapping, saveMapping } = require('../services/mappingService');

const router = express.Router();

// GET /api/mapping -> saved shape-index -> name mapping (or {} if none saved)
router.get('/', (req, res) => {
  try {
    res.json(getMapping());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read mapping' });
  }
});

// POST /api/mapping -> persist the shape-index -> name mapping
router.post('/', (req, res) => {
  try {
    saveMapping(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save mapping' });
  }
});

module.exports = router;
