// Thin fetch wrappers around the backend API.
//
// Admin-only endpoints authenticate with a session cookie, so they must pass
// `credentials: 'include'` — fetch omits cookies otherwise.

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
    credentials: 'include',
    body: JSON.stringify(mapping),
  });
}

// --- Admin session ---------------------------------------------------------

// Returns { admin: true, username } when a valid session cookie is present.
export async function fetchSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    return res.json();
  } catch (e) {
    return { admin: false };
  }
}

// Returns { ok: true } on success, or { error } with the reason.
export async function login(username, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  } catch (e) {
    return { error: 'No s\'ha pogut connectar' };
  }
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (e) {
    // Nothing to do — the cookie expires on its own.
  }
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
    credentials: 'include',
    body: JSON.stringify(scores),
  });
  return res.json();
}

// Load the full access log (newest first). Pass a limit to cap the rows.
export async function loadAccessLog(limit) {
  try {
    const res = await fetch('/api/access-log' + (limit ? `?limit=${limit}` : ''), {
      credentials: 'include',
    });
    if (!res.ok) return [];
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
    credentials: 'include',
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
