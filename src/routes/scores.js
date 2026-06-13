const express = require('express');
const { getScores, addScore } = require('../services/scoresService');

const router = express.Router();

// GET /api/scores?limit=N -> top scores, best first
router.get('/', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    res.json(getScores().slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read scores' });
  }
});

// POST /api/scores -> record a finished run, returns { rank, scores }
router.post('/', (req, res) => {
  try {
    const result = addScore(req.body || {});
    res.json({ ok: true, rank: result.rank, entry: result.entry, scores: result.scores.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save score' });
  }
});

module.exports = router;
