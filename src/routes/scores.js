const express = require('express');
const { getScores, addScore, replaceScores } = require('../services/scoresService');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// GET /api/scores/export -> full leaderboard as a downloadable JSON file
router.get('/export', requireAdmin, async (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(await getScores(), null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to export scores' });
  }
});

// POST /api/scores/import -> replace the whole leaderboard (admin only)
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const scores = await replaceScores(req.body);
    res.json({ ok: true, count: scores.length, scores: scores.slice(0, 100) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to import scores' });
  }
});

// GET /api/scores?limit=N -> top scores, best first
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    res.json(await getScores(limit));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read scores' });
  }
});

// POST /api/scores -> record a finished run, returns { rank, scores }.
// Public on purpose: this is how players submit their score when a run ends.
router.post('/', async (req, res) => {
  try {
    const result = await addScore(req.body || {});
    res.json({ ok: true, rank: result.rank, entry: result.entry, scores: result.scores.slice(0, 20) });
  } catch (err) {
    console.error('[scores] save failed:', err.message);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

module.exports = router;
