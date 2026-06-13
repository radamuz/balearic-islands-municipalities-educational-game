const express = require('express');
const { getScores, addScore, replaceScores } = require('../services/scoresService');

const router = express.Router();

// GET /api/scores/export -> full leaderboard as a downloadable JSON file
router.get('/export', (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(getScores(), null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to export scores' });
  }
});

// POST /api/scores/import -> replace the whole leaderboard with the payload
router.post('/import', (req, res) => {
  try {
    const scores = replaceScores(req.body);
    res.json({ ok: true, count: scores.length, scores: scores.slice(0, 100) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to import scores' });
  }
});

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
