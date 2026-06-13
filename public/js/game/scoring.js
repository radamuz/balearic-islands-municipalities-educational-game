// Pure arcade scoring formulas. The running game model (gameState) calls these;
// keeping them isolated makes the rules easy to tweak and reason about.

export const BASE_POINTS = 100;        // points for a correct placement
export const MISTAKE_PENALTY = 40;     // points lost on a wrong drop
export const MAX_COMBO_BONUS = 1.0;    // combo multiplier caps at x2 (1 + 1.0)
export const SPEED_WINDOW_MS = 4000;   // place within this for a speed bonus
export const SPEED_BONUS = 60;         // extra points for a fast placement
export const TARGET_TIME_MS = 300000;  // finishing under this earns a time bonus
export const TIME_BONUS_RATE = 0.05;   // points per remaining millisecond

// Combo multiplier grows 0.05 per consecutive hit, capped at x2.
export function comboMultiplier(combo) {
  return 1 + Math.min(combo * 0.05, MAX_COMBO_BONUS);
}

// Points awarded for a single correct placement.
export function pointsForHit(combo, sinceLastMs) {
  const speed = sinceLastMs > 0 && sinceLastMs <= SPEED_WINDOW_MS ? SPEED_BONUS : 0;
  return Math.round((BASE_POINTS + speed) * comboMultiplier(combo));
}

// One-off bonus for finishing the whole map quickly.
export function timeBonus(elapsedMs) {
  return Math.max(0, Math.round((TARGET_TIME_MS - elapsedMs) * TIME_BONUS_RATE));
}

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
