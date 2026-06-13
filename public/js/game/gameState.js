// Central arcade game model: lifecycle, timer, score, combo and progress.
// UI modules subscribe via onChange / onFinish instead of poking the DOM here.

import { pointsForHit, timeBonus, MISTAKE_PENALTY } from './scoring.js';

const state = {
  status: 'idle',      // 'idle' | 'playing' | 'finished'
  total: 0,            // number of items to place to win
  correct: 0,
  mistakes: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  startTime: 0,
  endTime: 0,
  lastHitTime: 0,
  timeBonusAwarded: 0,
};

const changeSubs = [];
const finishSubs = [];
let tickHandle = null;

function emitChange() { changeSubs.forEach((cb) => cb(getSnapshot())); }

export function onChange(cb) { changeSubs.push(cb); }
export function onFinish(cb) { finishSubs.push(cb); }

export function getSnapshot() {
  return {
    status: state.status,
    total: state.total,
    correct: state.correct,
    mistakes: state.mistakes,
    score: state.score,
    combo: state.combo,
    maxCombo: state.maxCombo,
    elapsed: getElapsed(),
    timeBonus: state.timeBonusAwarded,
  };
}

export function getElapsed() {
  if (state.status === 'idle') return 0;
  const end = state.status === 'finished' ? state.endTime : Date.now();
  return end - state.startTime;
}

export function configure(total) {
  state.total = total;
}

export function start() {
  Object.assign(state, {
    status: 'playing', correct: 0, mistakes: 0, score: 0,
    combo: 0, maxCombo: 0, startTime: Date.now(), endTime: 0,
    lastHitTime: Date.now(), timeBonusAwarded: 0,
  });
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(emitChange, 250); // keeps the on-screen timer ticking
  emitChange();
}

export function isPlaying() { return state.status === 'playing'; }

// Record a correct placement; returns { points, combo } for feedback popups.
export function registerHit() {
  if (state.status !== 'playing') return { points: 0, combo: 0 };
  const now = Date.now();
  const since = now - state.lastHitTime;
  state.lastHitTime = now;
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const pts = pointsForHit(state.combo, since);
  state.score += pts;
  state.correct += 1;
  emitChange();
  if (state.correct >= state.total) finish();
  return { points: pts, combo: state.combo };
}

export function registerMistake() {
  if (state.status !== 'playing') return;
  state.mistakes += 1;
  state.combo = 0;
  state.score = Math.max(0, state.score - MISTAKE_PENALTY);
  emitChange();
}

function finish() {
  state.status = 'finished';
  state.endTime = Date.now();
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  state.timeBonusAwarded = timeBonus(state.endTime - state.startTime);
  state.score += state.timeBonusAwarded;
  emitChange();
  finishSubs.forEach((cb) => cb(getSnapshot()));
}

// ---- solution label bookkeeping (unchanged behaviour) -------------------
const labeledGroups = new Set();
export function isGroupLabeled(key) { return labeledGroups.has(key); }
export function markGroupLabeled(key) { labeledGroups.add(key); }
