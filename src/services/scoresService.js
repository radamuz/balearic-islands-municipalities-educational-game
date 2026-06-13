const fs = require('fs');
const { SCORES_PATH } = require('../config/paths');

const MAX_SCORES = 100;

// Read the arcade leaderboard from disk, sorted best-first. Returns [] if none.
function getScores() {
  if (!fs.existsSync(SCORES_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// Sanitize and append a run, keep the table sorted by points (desc) and capped.
function addScore(entry) {
  const scores = getScores();
  const clean = {
    name: String(entry.name || 'ANÓNIMO').trim().slice(0, 12).toUpperCase() || 'ANÓNIMO',
    points: Math.max(0, Math.round(Number(entry.points) || 0)),
    timeMs: Math.max(0, Math.round(Number(entry.timeMs) || 0)),
    correct: Math.max(0, Math.round(Number(entry.correct) || 0)),
    mistakes: Math.max(0, Math.round(Number(entry.mistakes) || 0)),
    total: Math.max(0, Math.round(Number(entry.total) || 0)),
    maxCombo: Math.max(0, Math.round(Number(entry.maxCombo) || 0)),
    date: new Date().toISOString(),
  };
  scores.push(clean);
  scores.sort((a, b) => b.points - a.points || a.timeMs - b.timeMs);
  const trimmed = scores.slice(0, MAX_SCORES);
  fs.writeFileSync(SCORES_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  // rank of the entry we just added (1-based), matching by identity-ish fields
  const rank = trimmed.findIndex((s) => s === clean) + 1;
  return { entry: clean, rank: rank || null, scores: trimmed };
}

module.exports = { getScores, addScore };
