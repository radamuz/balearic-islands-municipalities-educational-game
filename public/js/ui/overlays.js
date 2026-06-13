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
  if (!scores.length) return '<p class="empty">Aún no hay puntuaciones. ¡Sé el primero!</p>';
  const rows = scores.map((s, i) => `
    <tr class="${i === highlightIndex ? 'you' : ''}">
      <td class="rank">${medal(i + 1)}</td>
      <td class="who">${escapeHtml(s.name)}</td>
      <td class="pts">${Number(s.points).toLocaleString('es-ES')}</td>
      <td class="tm">${formatTime(s.timeMs)}</td>
      <td class="acc">${s.correct}/${s.total}</td>
    </tr>`).join('');
  return `<table class="score-table">
    <thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Tiempo</th><th>Aciertos</th></tr></thead>
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
    <h2>¡Mapa completado! 🏝️</h2>
    <div class="result-grid">
      <div class="result-stat"><span class="big">${snapshot.score.toLocaleString('es-ES')}</span><label>Puntos</label></div>
      <div class="result-stat"><span class="big">${formatTime(snapshot.elapsed)}</span><label>Tiempo</label></div>
      <div class="result-stat"><span class="big">${snapshot.correct}/${snapshot.total}</span><label>Aciertos</label></div>
      <div class="result-stat"><span class="big">x${snapshot.maxCombo}</span><label>Combo máx.</label></div>
      <div class="result-stat"><span class="big">${snapshot.mistakes}</span><label>Fallos</label></div>
      <div class="result-stat"><span class="big">+${snapshot.timeBonus.toLocaleString('es-ES')}</span><label>Bonus tiempo</label></div>
    </div>
    <div class="name-entry">
      <label for="player-name">Introduce tu nombre</label>
      <div class="name-row">
        <input id="player-name" maxlength="12" placeholder="AAA" value="${escapeHtml(lastName)}" autocomplete="off" />
        <button id="submit-score" class="btn-primary">Guardar</button>
      </div>
    </div>
    <div id="finish-board"></div>
    <div class="finish-actions">
      <button id="play-again" class="btn-secondary">Jugar de nuevo</button>
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
    const name = (input.value || 'ANÓNIMO').trim();
    localStorage.setItem(LAST_NAME_KEY, name);
    submitted = true;
    submitBtn.disabled = true;
    input.disabled = true;
    submitBtn.textContent = 'Guardando…';
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
    board.innerHTML = `<h3>Clasificación${res && res.rank ? ` — ¡puesto #${res.rank}!` : ''}</h3>${scoreRows(scores, idx)}`;
    submitBtn.textContent = '✓ Guardado';
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
  body.innerHTML = '<h2>🏆 Clasificación</h2><p class="empty">Cargando…</p>';
  show(overlay);
  const scores = await loadScores(20);
  body.innerHTML = `<h2>🏆 Clasificación</h2>${scoreRows(scores)}
    <div class="finish-actions"><button id="lb-close" class="btn-secondary">Cerrar</button></div>`;
  body.querySelector('#lb-close').onclick = () => hide(overlay);
}
