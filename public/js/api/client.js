// Thin fetch wrappers around the backend API.

export async function loadDatasources() {
  const res = await fetch('/api/datasources');
  return res.json();
}

export async function loadMapping() {
  const res = await fetch('/api/mapping');
  return res.json();
}

export async function saveMapping(mapping) {
  return fetch('/api/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapping),
  });
}

export async function loadScores(limit = 20) {
  try {
    const res = await fetch(`/api/scores?limit=${limit}`);
    return res.json();
  } catch (e) {
    return [];
  }
}

// Submit a finished run. Returns { ok, rank, scores } or null on failure.
export async function submitScore(entry) {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return res.json();
  } catch (e) {
    return null;
  }
}

// Replace the whole leaderboard with an imported array of entries.
export async function importScores(scores) {
  const res = await fetch('/api/scores/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scores),
  });
  return res.json();
}

// Load the full access log (newest first). Pass a limit to cap the rows.
export async function loadAccessLog(limit) {
  try {
    const res = await fetch('/api/access-log' + (limit ? `?limit=${limit}` : ''));
    return res.json();
  } catch (e) {
    return [];
  }
}

// Replace the whole access log with an imported array of entries.
export async function importAccessLog(entries) {
  const res = await fetch('/api/access-log/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  });
  return res.json();
}

// Load the current feature flags (resolved server-side). Returns {} on failure.
export async function loadFlags() {
  try {
    const res = await fetch('/api/flags');
    return res.json();
  } catch (e) {
    return {};
  }
}
