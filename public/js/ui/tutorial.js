// Tutorial guiat de primera partida: una mà animada guia el jugador a
// col·locar Palma (obrir el panell en mòbil → clic a "Palma" → clic al mapa).
// Només es mostra la primera vegada; es pot ometre.

import { normalizeKey } from '../utils/normalize.js';
import { flashNotification } from './notifications.js';

const DONE_KEY = 'balears-arcade-tutorial-done';
const TARGET_KEY = 'palma';

let hand = null;
let bubble = null;
let trackHandle = null;
let observers = [];
let finished = false;

function isMobile() {
  return window.matchMedia('(max-width:880px)').matches;
}

function buildHand() {
  hand = document.createElement('div');
  hand.id = 'tutorial-hand';
  hand.innerHTML = '<span class="tutorial-finger">👆</span>';
  bubble = document.createElement('div');
  bubble.id = 'tutorial-bubble';
  bubble.innerHTML = '<span class="tutorial-text"></span><button type="button" class="tutorial-skip">Ometre</button>';
  bubble.querySelector('.tutorial-skip').addEventListener('click', () => endTutorial(false));
  document.body.appendChild(hand);
  document.body.appendChild(bubble);
}

// Segueix l'element objectiu encara que el mapa es mogui o es faci zoom.
function pointAt(el, text) {
  if (trackHandle) clearInterval(trackHandle);
  bubble.querySelector('.tutorial-text').textContent = text;
  const place = () => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const below = r.bottom + 90 < window.innerHeight;
    hand.querySelector('.tutorial-finger').textContent = below ? '👆' : '👇';
    hand.style.left = `${cx}px`;
    hand.style.top = below ? `${r.bottom + 4}px` : `${r.top - 52}px`;
    const bw = bubble.offsetWidth || 220;
    bubble.style.left = `${Math.min(Math.max(8, cx - bw / 2), window.innerWidth - bw - 8)}px`;
    bubble.style.top = below ? `${r.bottom + 58}px` : `${Math.max(8, r.top - 110)}px`;
  };
  place();
  trackHandle = setInterval(place, 200);
}

function observeClass(el, className, cb) {
  const obs = new MutationObserver(() => {
    if (el.classList.contains(className)) { obs.disconnect(); cb(); }
  });
  obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  observers.push(obs);
}

function findMapShape() {
  const svg = document.querySelector('#map-container svg');
  if (!svg) return null;
  for (const el of svg.querySelectorAll('[data-name]')) {
    if (normalizeKey(el.getAttribute('data-name')) === TARGET_KEY) return el;
  }
  return null;
}

function endTutorial(success) {
  if (finished) return;
  finished = true;
  localStorage.setItem(DONE_KEY, '1');
  if (trackHandle) clearInterval(trackHandle);
  observers.forEach((o) => o.disconnect());
  observers = [];
  const shape = findMapShape();
  if (shape) shape.classList.remove('tutorial-pulse');
  if (hand) hand.remove();
  if (bubble) bubble.remove();
  if (success) flashNotification('Molt bé! Ja saps jugar 🎉');
}

// Pas 3: assenyalar el lloc de Palma al mapa fins que quedi col·locada.
function stepMap(item) {
  const shape = findMapShape();
  if (!shape) { endTutorial(false); return; }
  shape.classList.add('tutorial-pulse');
  pointAt(shape, 'Ara fes clic al seu lloc al mapa');
}

// Pas 2: assenyalar "Palma" a la llista fins que es seleccioni (o es col·loqui
// directament arrossegant-la).
function stepPickPalma() {
  const item = document.querySelector(`.item[data-key="${TARGET_KEY}"]`);
  if (!item) { endTutorial(false); return; }
  item.scrollIntoView({ block: 'center' });
  pointAt(item, 'Fes clic a «Palma»');
  observeClass(item, 'selected', () => stepMap(item));
  observeClass(item, 'placed', () => endTutorial(true));
}

// Pas 1 (només mòbil): obrir el panell de noms amb la hamburguesa.
function stepOpenPanel() {
  const toggle = document.getElementById('toggle-lists-mobile');
  const panel = document.getElementById('lists-panel');
  if (!toggle || !panel) { stepPickPalma(); return; }
  pointAt(toggle, 'Toca aquí per veure els noms');
  observeClass(panel, 'open', () => stepPickPalma());
}

export function maybeStartTutorial() {
  if (localStorage.getItem(DONE_KEY)) return;
  buildHand();
  if (isMobile()) stepOpenPanel();
  else stepPickPalma();
}
