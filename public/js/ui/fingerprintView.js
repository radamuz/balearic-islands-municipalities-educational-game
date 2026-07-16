// Visor de FingerprintJS — calcula i mostra de forma bonica l'empremta del
// navegador actual (visitorId + tots els components que la composen).
//
// FingerprintJS v4 (BSL 1.1) va vendada a /js/vendor/fingerprintjs.esm.js.
// Tot és client-side: cap dada s'envia al servidor des d'aquesta vista.

import FingerprintJS from '../vendor/fingerprintjs.esm.js';
import { flashNotification } from './notifications.js';

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Color(s) derivats del visitorId per a la "swatch" visual de l'empremta.
function swatchColors(visitorId) {
  const hex = String(visitorId || '0000000000000000').replace(/[^0-9a-f]/gi, '');
  const c1 = (hex.slice(0, 6) || '2ee6d6').padEnd(6, '0');
  const c2 = (hex.slice(6, 12) || '7c5cff').padEnd(6, '0');
  return [`#${c1}`, `#${c2}`];
}

function prettyValue(v) {
  if (v == null) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
}
function isObjectVal(v) {
  return v != null && (typeof v === 'object' || Array.isArray(v));
}

// Grups de components per a un render organitzat en lloc d'un dump pla.
const GROUPS = [
  { title: 'Navegador', icon: '🌐', keys: ['userAgent', 'vendor', 'vendorFlavors', 'platform', 'osCpu', 'plugins', 'pdfFontsEnabled', 'cookiesEnabled'] },
  { title: 'Pantalla i color', icon: '🖥️', keys: ['screenResolution', 'availableScreenResolution', 'screenFrame', 'colorDepth', 'colorGamut', 'colors', 'hdr', 'invertedColors', 'forcedColors', 'monochrome', 'contrast', 'reducedMotion'] },
  { title: 'Maquinari', icon: '⚙️', keys: ['hardwareConcurrency', 'deviceMemory', 'architecture', 'cpuClass'] },
  { title: 'Canvas', icon: '🎨', keys: ['canvas'] },
  { title: 'WebGL', icon: '🔮', keys: ['webglVendor', 'webglRenderer', 'glslVersion', 'webglBasics', 'webglExtensions'] },
  { title: 'Àudio', icon: '🔊', keys: ['audio', 'audioSampleRate'] },
  { title: 'Tipografies', icon: '🔤', keys: ['fonts', 'fontPreferences'] },
  { title: 'Hora i idioma', icon: '🕰️', keys: ['timezone', 'timezoneOffset', 'languages'] },
  { title: 'Emmagatzematge', icon: '💾', keys: ['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'addBehavior'] },
  { title: 'Math', icon: '🧮', keys: ['math'] },
  { title: 'Pagament / privadesa', icon: '💳', keys: ['applePay', 'privateClickMeasurement', 'domBlockers', 'globalScope'] },
];

function renderComponent(key, value) {
  const obj = isObjectVal(value);
  const valStr = prettyValue(value);
  if (obj) {
    return `<div class="fp-comp fp-comp-obj">
      <span class="fp-ck">${escapeHtml(key)}</span>
      <pre class="fp-cv-pre">${escapeHtml(valStr)}</pre>
    </div>`;
  }
  return `<div class="fp-comp">
    <span class="fp-ck">${escapeHtml(key)}</span>
    <span class="fp-cv">${escapeHtml(valStr)}</span>
  </div>`;
}

function renderGroup(group, components) {
  const seen = new Set();
  const items = group.keys
    .filter((k) => components[k] !== undefined)
    .map((k) => { seen.add(k); return renderComponent(k, components[k]); })
    .join('');
  if (!items) return '';
  return `<section class="fp-group">
    <h4>${group.icon} ${escapeHtml(group.title)}</h4>
    <div class="fp-group-body">${items}</div>
  </section>`;
}

function renderAltres(components, knownKeys) {
  const items = Object.entries(components)
    .filter(([k]) => !knownKeys.has(k))
    .map(([k, v]) => renderComponent(k, v))
    .join('');
  if (!items) return '';
  return `<section class="fp-group"><h4>📦 Altres</h4><div class="fp-group-body">${items}</div></section>`;
}

function confidenceLabel(score) {
  if (score >= 0.99) return 'Molt alta';
  if (score >= 0.9) return 'Alta';
  if (score >= 0.5) return 'Mitjana';
  return 'Baixa';
}

async function compute() {
  const fp = await FingerprintJS.load();
  return fp.get();
}

export async function showFingerprintView() {
  const overlay = document.getElementById('fingerprint-overlay');
  const body = document.getElementById('fingerprint-body');
  show(overlay);

  body.innerHTML = `
    <h2>🖐️ Empremta del navegador</h2>
    <p class="fp-sub">Identificador únic del visitant calculat amb FingerprintJS v4 a partir de canvas, WebGL, fonts, àudio, maquinari i més.</p>
    <div class="tool-actions">
      <button id="fp-recalc" class="btn-secondary">↻ Recalcular</button>
      <button id="fp-copy" class="btn-secondary">⧉ Copiar ID</button>
      <button id="fp-close" class="btn-secondary">✕ Tancar</button>
    </div>
    <div id="fp-content"><p class="empty">Calculant empremta…</p></div>`;

  body.querySelector('#fp-close').onclick = () => hide(overlay);
  body.querySelector('#fp-recalc').onclick = () => render();
  body.querySelector('#fp-copy').onclick = () => {
    const id = body.querySelector('#fp-visitorid')?.textContent || '';
    if (!id) return;
    navigator.clipboard?.writeText(id).then(
      () => flashNotification('ID copiat'),
      () => flashNotification('No s\'ha pogut copiar'),
    );
  };

  async function render() {
    const content = body.querySelector('#fp-content');
    content.innerHTML = '<p class="empty">Calculant empremta…</p>';
    try {
      const result = await compute();
      const { visitorId, confidence, components } = result;
      const score = confidence ? Number(confidence.score) : 1;
      const [c1, c2] = swatchColors(visitorId);
      const known = new Set(GROUPS.flatMap((g) => g.keys));
      const groupsHtml = GROUPS.map((g) => renderGroup(g, components)).filter(Boolean).join('');
      const altres = renderAltres(components, known);
      const generatedAt = new Date().toLocaleString('ca-ES');

      content.innerHTML = `
        <section class="fp-hero" style="--fp-c1:${c1};--fp-c2:${c2}">
          <div class="fp-swatch" aria-hidden="true"></div>
          <div class="fp-hero-main">
            <span class="fp-hero-label">Visitor ID</span>
            <code id="fp-visitorid" class="fp-visitorid">${escapeHtml(visitorId)}</code>
            <span class="fp-hero-meta">Generat: ${escapeHtml(generatedAt)}</span>
          </div>
          <div class="fp-confidence">
            <span class="fp-conf-ring" style="--p:${Math.round(score * 100)}"><span class="fp-conf-pct">${Math.round(score * 100)}%</span></span>
            <span class="fp-conf-label">${escapeHtml(confidenceLabel(score))}</span>
            ${confidence?.comment ? `<span class="fp-conf-comment">${escapeHtml(confidence.comment)}</span>` : ''}
          </div>
        </section>
        <div class="fp-groups">${groupsHtml}${altres}</div>`;
    } catch (err) {
      content.innerHTML = `<p class="empty">No s'ha pogut calcular l'empremta: ${escapeHtml(err.message || err)}</p>`;
    }
  }

  await render();
}
