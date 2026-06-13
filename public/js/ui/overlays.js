// Arcade overlays: title screen, game-over (name entry + result) and the
// standalone leaderboard. They render into fixed containers in index.html.

import { loadScores, submitScore } from '../api/client.js';
import { formatTime } from '../game/scoring.js';

const LAST_NAME_KEY = 'balears-arcade-name';

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function medal(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
}

function scoreRows(scores, highlightIndex = -1) {
  if (!scores.length) return '<p class="empty">Encara no hi ha puntuacions. ¡Sigues el primer!</p>';
  const rows = scores.map((s, i) => `
    <tr class="${i === highlightIndex ? 'you' : ''}">
      <td class="rank">${medal(i + 1)}</td>
      <td class="who">${escapeHtml(s.name)}</td>
      <td class="pts">${Number(s.points).toLocaleString('ca-ES')}</td>
      <td class="tm">${formatTime(s.timeMs)}</td>
      <td class="acc">${s.correct}/${s.total}</td>
    </tr>`).join('');
  return `<table class="score-table">
    <thead><tr><th>#</th><th>Nom</th><th>Punts</th><th>Temps</th><th>Encerts</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Title screen ----------------------------------------------------------
export function showStart(onStart) {
  const overlay = document.getElementById('start-overlay');
  const btn = document.getElementById('start-btn');
  show(overlay);
  btn.onclick = () => { hide(overlay); onStart(); };
}

// --- Game over -------------------------------------------------------------
export function showFinish(snapshot) {
  const overlay = document.getElementById('finish-overlay');
  const body = document.getElementById('finish-body');
  const lastName = localStorage.getItem(LAST_NAME_KEY) || '';

  body.innerHTML = `
    <h2>¡Mapa completat! 🏝️</h2>
    <div class="result-grid">
      <div class="result-stat"><span class="big">${snapshot.score.toLocaleString('ca-ES')}</span><label>Punts</label></div>
      <div class="result-stat"><span class="big">${formatTime(snapshot.elapsed)}</span><label>Temps</label></div>
      <div class="result-stat"><span class="big">${snapshot.correct}/${snapshot.total}</span><label>Encerts</label></div>
      <div class="result-stat"><span class="big">x${snapshot.maxCombo}</span><label>Combo màx.</label></div>
      <div class="result-stat"><span class="big">${snapshot.mistakes}</span><label>Errors</label></div>
      <div class="result-stat"><span class="big">+${snapshot.timeBonus.toLocaleString('ca-ES')}</span><label>Bonus temps</label></div>
    </div>
    <div class="name-entry">
      <label for="player-name">Introdueix el teu nom</label>
      <div class="name-row">
        <input id="player-name" maxlength="12" placeholder="AAA" value="${escapeHtml(lastName)}" autocomplete="off" />
        <button id="submit-score" class="btn-primary">Guardar</button>
      </div>
    </div>
    <div id="finish-board"></div>
    <div class="finish-actions">
      <button id="play-again" class="btn-secondary">Jugar de nou</button>
    </div>`;

  show(overlay);

  const input = body.querySelector('#player-name');
  const submitBtn = body.querySelector('#submit-score');
  const board = body.querySelector('#finish-board');
  input.focus();
  input.select();

  let submitted = false;
  async function doSubmit() {
    if (submitted) return;
    const name = (input.value || 'ANÒNIM').trim();
    localStorage.setItem(LAST_NAME_KEY, name);
    submitted = true;
    submitBtn.disabled = true;
    input.disabled = true;
    submitBtn.textContent = 'Guardant…';
    const res = await submitScore({
      name,
      points: snapshot.score,
      timeMs: snapshot.elapsed,
      correct: snapshot.correct,
      mistakes: snapshot.mistakes,
      total: snapshot.total,
      maxCombo: snapshot.maxCombo,
    });
    const scores = (res && res.scores) || await loadScores(20);
    const idx = res && res.rank ? res.rank - 1 : -1;
    board.innerHTML = `<h3>Classificació${res && res.rank ? ` — ¡lloc #${res.rank}!` : ''}</h3>${scoreRows(scores, idx)}`;
    submitBtn.textContent = '✓ Guardat';
    const youRow = board.querySelector('tr.you');
    if (youRow) youRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  submitBtn.onclick = doSubmit;
  input.onkeydown = (e) => { if (e.key === 'Enter') doSubmit(); };
  body.querySelector('#play-again').onclick = () => location.reload();
}

// --- Standalone leaderboard (toolbar) -------------------------------------
export async function showLeaderboard() {
  const overlay = document.getElementById('leaderboard-overlay');
  const body = document.getElementById('leaderboard-body');
  body.innerHTML = '<h2>🏆 Classificació</h2><p class="empty">Carregant…</p>';
  show(overlay);
  const scores = await loadScores(20);
  body.innerHTML = `<h2>🏆 Classificació</h2>${scoreRows(scores)}
    <div class="finish-actions"><button id="lb-close" class="btn-secondary">Tancar</button></div>`;
  body.querySelector('#lb-close').onclick = () => hide(overlay);
}
