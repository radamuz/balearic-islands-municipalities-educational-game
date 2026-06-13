// Management overlays available from the toolbar "Eines" dropdown:
//  - Leaderboard: view / download / import (replaces the current one).
//  - Access log: interactive, filterable view / download / import (replaces it).

import { loadScores, importScores, loadAccessLog, importAccessLog } from '../api/client.js';
import { formatTime } from '../game/scoring.js';
import { flashNotification } from './notifications.js';

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Trigger a client-side download of a pretty-printed JSON file.
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a file picker and parse the chosen file as JSON.
function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch (e) {
          flashNotification('El fitxer no és un JSON vàlid');
          resolve(null);
        }
      };
      reader.onerror = () => { flashNotification('Error llegint el fitxer'); resolve(null); };
      reader.readAsText(file);
    };
    input.click();
  });
}

// --- Leaderboard management ------------------------------------------------
function leaderboardTable(scores) {
  if (!scores.length) return '<p class="empty">No hi ha puntuacions.</p>';
  const rows = scores.map((s, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="who">${escapeHtml(s.name)}</td>
      <td class="pts">${Number(s.points || 0).toLocaleString('ca-ES')}</td>
      <td class="tm">${formatTime(s.timeMs || 0)}</td>
      <td class="acc">${escapeHtml(s.correct)}/${escapeHtml(s.total)}</td>
      <td class="tm">${s.date ? escapeHtml(new Date(s.date).toLocaleString('ca-ES')) : ''}</td>
    </tr>`).join('');
  return `<table class="score-table">
    <thead><tr><th>#</th><th>Nom</th><th>Punts</th><th>Temps</th><th>Encerts</th><th>Data</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

export async function showLeaderboardTool() {
  const overlay = document.getElementById('leaderboard-tool-overlay');
  const body = document.getElementById('leaderboard-tool-body');
  show(overlay);

  async function render() {
    const scores = await loadScores(100);
    body.innerHTML = `
      <h2>🏅 Gestió de la classificació</h2>
      <div class="tool-actions">
        <button id="lbt-download" class="btn-secondary">⬇️ Descarregar</button>
        <button id="lbt-import" class="btn-secondary">⬆️ Importar (reemplaça)</button>
      </div>
      <p class="tool-count">${scores.length} entrades</p>
      <div class="tool-table-wrap">${leaderboardTable(scores)}</div>
      <div class="finish-actions"><button id="lbt-close" class="btn-secondary">Tancar</button></div>`;

    body.querySelector('#lbt-download').onclick = () => downloadJson('leaderboard.json', scores);
    body.querySelector('#lbt-import').onclick = async () => {
      const data = await pickJsonFile();
      if (!data) return;
      if (!Array.isArray(data)) { flashNotification('S\'esperava una llista d\'entrades'); return; }
      const res = await importScores(data);
      if (res && res.ok) {
        flashNotification(`Classificació reemplaçada (${res.count} entrades)`);
        render();
      } else {
        flashNotification((res && res.error) || 'Error en importar');
      }
    };
    body.querySelector('#lbt-close').onclick = () => hide(overlay);
  }

  body.innerHTML = '<h2>🏅 Gestió de la classificació</h2><p class="empty">Carregant…</p>';
  render();
}

// --- Access log management -------------------------------------------------
function accessLogRows(entries) {
  if (!entries.length) return '<tr><td colspan="6" class="empty">Cap accés registrat.</td></tr>';
  return entries.map((e) => `
    <tr>
      <td class="tm">${e.time ? escapeHtml(new Date(e.time).toLocaleString('ca-ES')) : ''}</td>
      <td>${escapeHtml(e.ip)}</td>
      <td>${escapeHtml(e.deviceType)}${e.device ? ' · ' + escapeHtml(e.device) : ''}</td>
      <td>${escapeHtml(e.os)}</td>
      <td>${escapeHtml(e.browser)}</td>
      <td class="al-path"><span class="al-method">${escapeHtml(e.method)}</span> ${escapeHtml(e.path)}</td>
    </tr>`).join('');
}

export async function showAccessLogTool() {
  const overlay = document.getElementById('accesslog-overlay');
  const body = document.getElementById('accesslog-body');
  show(overlay);

  let entries = [];

  function applyFilter(term) {
    const t = String(term || '').toLowerCase().trim();
    const filtered = !t ? entries : entries.filter((e) =>
      [e.ip, e.deviceType, e.device, e.os, e.browser, e.path, e.method, e.language, e.userAgent]
        .some((v) => String(v || '').toLowerCase().includes(t)));
    const tbody = body.querySelector('#al-tbody');
    if (tbody) tbody.innerHTML = accessLogRows(filtered);
    const count = body.querySelector('#al-count');
    if (count) count.textContent = `${filtered.length} de ${entries.length} accessos`;
  }

  async function render() {
    entries = await loadAccessLog();
    body.innerHTML = `
      <h2>📡 Registre d'accessos</h2>
      <div class="tool-actions">
        <button id="al-download" class="btn-secondary">⬇️ Descarregar</button>
        <button id="al-import" class="btn-secondary">⬆️ Importar (reemplaça)</button>
        <button id="al-refresh" class="btn-secondary">↻ Actualitzar</button>
      </div>
      <input id="al-search" type="search" class="tool-search" placeholder="Filtrar per IP, dispositiu, navegador, ruta…" autocomplete="off" />
      <p class="tool-count" id="al-count"></p>
      <div class="tool-table-wrap access-log-wrap">
        <table class="score-table access-log-table">
          <thead><tr><th>Data/hora</th><th>IP</th><th>Dispositiu</th><th>SO</th><th>Navegador</th><th>Petició</th></tr></thead>
          <tbody id="al-tbody"></tbody>
        </table>
      </div>
      <div class="finish-actions"><button id="al-close" class="btn-secondary">Tancar</button></div>`;

    applyFilter('');

    body.querySelector('#al-search').addEventListener('input', (ev) => applyFilter(ev.target.value));
    body.querySelector('#al-download').onclick = () => downloadJson('access-log.json', entries);
    body.querySelector('#al-refresh').onclick = () => render();
    body.querySelector('#al-import').onclick = async () => {
      const data = await pickJsonFile();
      if (!data) return;
      if (!Array.isArray(data)) { flashNotification('S\'esperava una llista d\'entrades'); return; }
      const res = await importAccessLog(data);
      if (res && res.ok) {
        flashNotification(`Registre reemplaçat (${res.count} accessos)`);
        render();
      } else {
        flashNotification((res && res.error) || 'Error en importar');
      }
    };
    body.querySelector('#al-close').onclick = () => hide(overlay);
  }

  body.innerHTML = '<h2>📡 Registre d\'accessos</h2><p class="empty">Carregant…</p>';
  render();
}
