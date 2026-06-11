const express = require('express');
const { readDatasources } = require('../services/datasourceService');

const router = express.Router();

// GET /api/datasources -> { "filename.txt": ["line1", "line2", ...], ... }
router.get('/', (req, res) => {
  try {
    res.json(readDatasources());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read datasource directory' });
  }
});

module.exports = router;
