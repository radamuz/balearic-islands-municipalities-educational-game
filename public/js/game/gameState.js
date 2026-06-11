// Tracks per-session game progress: which island groups already have a
// solution label, and the running "correct matches" score.

const labeledGroups = new Set();

export function isGroupLabeled(key) {
  return labeledGroups.has(key);
}

export function markGroupLabeled(key) {
  labeledGroups.add(key);
}

export function incrementScore() {
  const el = document.getElementById('correct');
  el.textContent = String(parseInt(el.textContent || '0', 10) + 1);
}

export function setScore(n) {
  document.getElementById('correct').textContent = String(n);
}
