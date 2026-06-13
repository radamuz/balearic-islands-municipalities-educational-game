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
