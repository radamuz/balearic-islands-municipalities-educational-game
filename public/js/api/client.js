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
