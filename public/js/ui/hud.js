// Live arcade HUD: time, score, combo and progress. Subscribes to the game
// model and reflects each snapshot onto the DOM.

import { onChange } from '../game/gameState.js';
import { formatTime } from '../game/scoring.js';

export function setupHud() {
  const timeEl = document.getElementById('hud-time');
  const scoreEl = document.getElementById('hud-score');
  const comboEl = document.getElementById('hud-combo');
  const progFill = document.getElementById('hud-progress-fill');
  const progText = document.getElementById('hud-progress-text');

  let shownScore = 0;

  onChange((s) => {
    timeEl.textContent = formatTime(s.elapsed);

    // ease the score toward its target so it counts up rather than jumping
    if (s.score !== shownScore) {
      shownScore += Math.ceil((s.score - shownScore) / 3) || (s.score - shownScore);
      if (Math.abs(s.score - shownScore) <= 1) shownScore = s.score;
      scoreEl.textContent = shownScore.toLocaleString('es-ES');
      scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
    }

    if (s.combo >= 2) {
      comboEl.textContent = `x${s.combo}`;
      comboEl.classList.add('active');
    } else {
      comboEl.classList.remove('active');
    }

    const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    progFill.style.width = pct + '%';
    progText.textContent = `${s.correct} / ${s.total}`;
  });
}
