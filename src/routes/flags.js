const express = require('express');
const { getFlags } = require('../services/flagsService');

const router = express.Router();

// GET /api/flags -> feature flags resolved from the server environment
router.get('/', (req, res) => {
  try {
    res.json(getFlags());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read flags' });
  }
});

module.exports = router;
