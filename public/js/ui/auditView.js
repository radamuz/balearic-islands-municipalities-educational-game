// Auditoria d'accessos — visor detallat i bonic del registre d'accessos.
//
// Pensa en cinc dimensions per a cada accés:
//   • Qui      — IP, usuari admin, sessió, cookies presents
//   • Com      — mètode, HTTP, dispositiu, SO, navegador, idioma, DNT
//   • Quan     — data/hora, temps de resposta
//   • Per què  — ruta, query, kind (api/page/static), intent (fetch/xhr/navigate)
//   • A través de on — origin, host, referer, protocol, proxy chain, IP real
//
// Tot es renderitza amb CSS (sense llibreries de gràfics) per mantenir l'app
// lliure de dependències i coherent amb el tema fosc.

import { loadAccessLog } from '../api/client.js';
import { flashNotification } from './notifications.js';

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return d.toLocaleString('ca-ES');
}
function fmtTimeShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit' });
}
function relTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'ara';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `fa ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `fa ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `fa ${h} h`;
  const d = Math.floor(h / 24);
  return `fa ${d} d`;
}

// --- Agregacions ----------------------------------------------------------
function countBy(entries, keyFn) {
  const m = new Map();
  for (const e of entries) {
    const k = keyFn(e) || 'Desconegut';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function topN(list, n) { return list.slice(0, n); }

// Histograma temporal: per hora si tot és recent (<48h), per dia altrament.
function timeHistogram(entries) {
  if (!entries.length) return { buckets: [], unit: 'h' };
  const newest = Math.max(...entries.map((e) => new Date(e.time).getTime()));
  const span = newest - Math.min(...entries.map((e) => new Date(e.time).getTime()));
  const byHour = span < 48 * 3600 * 1000;
  const unit = byHour ? 'h' : 'd';
  const buckets = new Map();
  const bucketKey = (t) => {
    const d = new Date(t);
    if (byHour) {
      d.setMinutes(0, 0, 0);
      return d.getTime();
    }
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  for (const e of entries) {
    const k = bucketKey(e.time);
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  // Omple els forats entre min i max perquè el gràfic no tingui salts buits.
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const filled = [];
  if (keys.length) {
    const step = byHour ? 3600 * 1000 : 24 * 3600 * 1000;
    for (let t = keys[0]; t <= keys[keys.length - 1]; t += step) {
      filled.push({ ts: t, value: buckets.get(t) || 0 });
    }
  }
  return { buckets: filled, unit };
}

function statusBuckets(entries) {
  const m = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, '—': 0 };
  for (const e of entries) {
    const s = Number(e.status) || 0;
    if (s >= 200 && s < 300) m['2xx']++;
    else if (s >= 300 && s < 400) m['3xx']++;
    else if (s >= 400 && s < 500) m['4xx']++;
    else if (s >= 500) m['5xx']++;
    else m['—']++;
  }
  return Object.entries(m).map(([label, value]) => ({ label, value }));
}

// --- Render de gràfics (CSS pur) -----------------------------------------
function barRow(label, value, max, color) {
  const pct = max ? Math.max(2, (value / max) * 100) : 0;
  return `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%;${color ? `background:${color}` : ''}"></span></span>
      <span class="bar-value">${value}</span>
    </div>`;
}

function barChart(title, icon, data, opts = {}) {
  const { max = 8, colorFor } = opts;
  if (!data.length) return `<section class="chart-card"><h3>${icon} ${escapeHtml(title)}</h3><p class="empty">Sense dades.</p></section>`;
  const top = topN(data, max);
  const m = Math.max(...top.map((d) => d.value));
  const rows = top.map((d) => barRow(d.label, d.value, m, colorFor ? colorFor(d.label) : '')).join('');
  return `<section class="chart-card"><h3>${icon} ${escapeHtml(title)}</h3><div class="bar-list">${rows}</div></section>`;
}

function statusColor(label) {
  if (label === '2xx') return 'linear-gradient(90deg,var(--green),#2ee6d6)';
  if (label === '3xx') return 'linear-gradient(90deg,var(--accent),var(--accent-2))';
  if (label === '4xx') return 'linear-gradient(90deg,var(--gold),#ff9d4d)';
  if (label === '5xx') return 'linear-gradient(90deg,var(--red),#ff2d5c)';
  return 'rgba(255,255,255,.2)';
}

function timelineChart(entries) {
  const { buckets, unit } = timeHistogram(entries);
  if (!buckets.length) return `<section class="chart-card chart-card-wide"><h3>🕒 Accessos al llarg del temps</h3><p class="empty">Sense dades.</p></section>`;
  const max = Math.max(...buckets.map((b) => b.value));
  const bars = buckets.map((b) => {
    const pct = max ? (b.value / max) * 100 : 0;
    const label = unit === 'h' ? fmtTimeShort(b.ts) : fmtDateShort(b.ts);
    return `<div class="tl-col" title="${escapeHtml(new Date(b.ts).toLocaleString('ca-ES'))} — ${b.value} accessos">
      <span class="tl-bar" style="height:${pct}%"></span>
      <span class="tl-label">${label}</span>
    </div>`;
  }).join('');
  return `<section class="chart-card chart-card-wide">
    <h3>🕒 Accessos al llarg del temps <small>(${unit === 'h' ? 'per hora' : 'per dia'})</small></h3>
    <div class="timeline">${bars}</div>
  </section>`;
}

// --- KPIs ----------------------------------------------------------------
function kpi(label, value, sub, icon) {
  return `<div class="kpi"><span class="kpi-icon">${icon}</span><span class="kpi-val">${escapeHtml(value)}</span><span class="kpi-label">${escapeHtml(label)}</span>${sub ? `<span class="kpi-sub">${escapeHtml(sub)}</span>` : ''}</div>`;
}

function kpis(entries) {
  const ips = new Set(entries.map((e) => e.ip).filter(Boolean));
  const devices = new Set(entries.map((e) => e.deviceType).filter(Boolean));
  const newest = entries.reduce((a, e) => (e.time && (!a || e.time > a) ? e.time : a), null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = entries.filter((e) => new Date(e.time) >= today).length;
  const mobile = entries.filter((e) => e.deviceType === 'Mòbil').length;
  const mobilePct = entries.length ? Math.round((mobile / entries.length) * 100) : 0;
  const avgMs = entries.length
    ? Math.round(entries.reduce((a, e) => a + (Number(e.responseTimeMs) || 0), 0) / entries.length)
    : 0;
  return [
    kpi('Accessos totals', entries.length.toLocaleString('ca-ES'), '', '📊'),
    kpi('IP úniques', ips.size.toLocaleString('ca-ES'), '', '🌐'),
    kpi('Avui', todayCount.toLocaleString('ca-ES'), '', '📅'),
    kpi('Mòbil', `${mobilePct}%`, `${mobile} accessos`, '📱'),
    kpi('Darrer accés', relTime(newest), newest ? fmtTime(newest) : '', '🕐'),
    kpi('Temps mig', `${avgMs} ms`, 'resposta', '⚡'),
  ].join('');
}

// --- Taula + drawer de detall --------------------------------------------
const TABLE_COLS = [
  { key: 'time', label: 'Quan', render: (e) => fmtTime(e.time) },
  { key: 'ip', label: 'Qui (IP)', render: (e) => escapeHtml(e.ip || '—') },
  { key: 'admin', label: 'Admin', render: (e) => e.admin ? `<span class="tag tag-accent">${escapeHtml(e.username || '✓')}</span>` : '<span class="tag tag-muted">no</span>' },
  { key: 'deviceType', label: 'Dispositiu', render: (e) => escapeHtml(e.deviceType || '—') + (e.device ? ` <span class="dim">· ${escapeHtml(e.device)}</span>` : '') },
  { key: 'os', label: 'SO', render: (e) => escapeHtml(e.os || '—') },
  { key: 'browser', label: 'Navegador', render: (e) => escapeHtml(e.browser || '—') },
  { key: 'status', label: 'Estat', render: (e) => statusTag(e.status) },
  { key: 'path', label: 'Per què (petició)', render: (e) => `<span class="al-method">${escapeHtml(e.method)}</span> <span class="al-path">${escapeHtml(e.path || '')}</span>` },
  { key: 'origin', label: 'A través de', render: (e) => escapeHtml(e.origin || e.referer || e.host || '—') },
];

function statusTag(s) {
  const n = Number(s) || 0;
  if (!n) return '<span class="tag tag-muted">—</span>';
  const cls = n < 300 ? 'tag-green' : n < 400 ? 'tag-accent' : n < 500 ? 'tag-gold' : 'tag-red';
  return `<span class="tag ${cls}">${n}</span>`;
}

function tableRows(entries) {
  if (!entries.length) return `<tr><td colspan="${TABLE_COLS.length}" class="empty">Cap accés registrat.</td></tr>`;
  return entries.map((e, i) => {
    const cells = TABLE_COLS.map((c) => `<td>${c.render(e)}</td>`).join('');
    return `<tr data-idx="${i}">${cells}</tr>`;
  }).join('');
}

function detailField(label, value) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
  const v = Array.isArray(value) ? value.join(', ') : value;
  return `<div class="df"><span class="df-k">${escapeHtml(label)}</span><span class="df-v">${escapeHtml(v)}</span></div>`;
}
function detailGroup(title, icon, fields) {
  const inner = fields.filter(Boolean).join('');
  if (!inner) return '';
  return `<div class="dg"><h4>${icon} ${escapeHtml(title)}</h4>${inner}</div>`;
}

function detailPanel(e) {
  const sec = (label, val) => detailField(label, val);
  const who = detailGroup('Qui', '👤', [
    sec('IP', e.ip),
    sec('Usuari admin', e.admin ? (e.username || '✓') : 'no'),
    sec('Sessió admin', e.admin ? 'sí' : ''),
    sec('Cookies', e.cookieNames),
  ]);
  const how = detailGroup('Com', '🖥️', [
    sec('Mètode', e.method),
    sec('HTTP', e.httpVersion),
    sec('Tipus de dispositiu', e.deviceType),
    sec('Dispositiu', e.device),
    sec('Sistema operatiu', e.os),
    sec('Navegador', e.browser),
    sec('Idioma preferit', e.language),
    sec('Accept-Language', e.acceptLanguage),
    sec('Accept', e.accept),
    sec('DNT', e.dnt),
    sec('User-Agent', e.userAgent),
  ]);
  const when = detailGroup('Quan', '🕐', [
    sec('Data/hora', fmtTime(e.time)),
    sec('Temps de resposta', e.responseTimeMs != null ? `${e.responseTimeMs} ms` : ''),
  ]);
  const why = detailGroup('Per què', '🎯', [
    sec('Ruta', e.path),
    sec('Query', e.query && Object.keys(e.query).length ? JSON.stringify(e.query) : ''),
    sec('Classificació', e.kind),
    sec('És fetch', e.fetch ? 'sí' : 'no'),
    sec('És XHR', e.xhr ? 'sí' : 'no'),
    sec('Sec-Fetch-Site', e.secFetchSite),
    sec('Sec-Fetch-Mode', e.secFetchMode),
    sec('Sec-Fetch-Dest', e.secFetchDest),
    sec('Sec-Fetch-User', e.secFetchUser),
    sec('Content-Type (petició)', e.contentType),
    sec('Content-Length (petició)', e.contentLength),
  ]);
  const where = detailGroup('A través de on', '🛰️', [
    sec('Origin', e.origin),
    sec('Host', e.host),
    sec('Referer', e.referer),
    sec('Protocol', e.protocol),
    sec('Secure (TLS)', e.secure ? 'sí' : 'no'),
    sec('X-Forwarded-For', e.xForwardedFor),
    sec('X-Forwarded-Proto', e.xForwardedProto),
    sec('X-Forwarded-Host', e.xForwardedHost),
    sec('X-Real-IP', e.xRealIp),
    sec('CF-Connecting-IP', e.cfConnectingIp),
  ]);
  const resp = detailGroup('Resposta', '↩️', [
    sec('Estat', e.status || ''),
    sec('Mida de resposta', e.responseSize ? `${e.responseSize} bytes` : ''),
  ]);
  return `<div class="detail-panel">${who}${how}${when}${why}${where}${resp}</div>`;
}

// --- Filtres -------------------------------------------------------------
function applyFilter(entries, term) {
  const t = String(term || '').toLowerCase().trim();
  if (!t) return entries;
  return entries.filter((e) =>
    [e.ip, e.username, e.method, e.path, e.deviceType, e.device, e.os, e.browser,
      e.language, e.host, e.origin, e.referer, e.kind, e.status, e.userAgent,
      e.secFetchSite, e.secFetchMode, e.secFetchDest, e.xForwardedFor]
      .some((v) => String(v == null ? '' : v).toLowerCase().includes(t)));
}

// --- Vista principal -----------------------------------------------------
export async function showAuditView() {
  const overlay = document.getElementById('audit-overlay');
  const body = document.getElementById('audit-body');
  show(overlay);

  let all = [];
  let filtered = [];
  let selectedIdx = -1;

  function renderDetail() {
    const pane = body.querySelector('#audit-detail');
    if (!pane) return;
    if (selectedIdx < 0 || !filtered[selectedIdx]) {
      pane.innerHTML = `<div class="detail-empty"><p class="empty">Selecciona un accés de la taula per veure'n el detall complet.</p></div>`;
      return;
    }
    pane.innerHTML = detailPanel(filtered[selectedIdx]);
  }

  function renderTable() {
    const tbody = body.querySelector('#audit-tbody');
    if (tbody) tbody.innerHTML = tableRows(filtered);
    const count = body.querySelector('#audit-count');
    if (count) count.textContent = `${filtered.length.toLocaleString('ca-ES')} de ${all.length.toLocaleString('ca-ES')} accessos`;
    // (Re)vincula clics de fila
    tbody?.querySelectorAll('tr[data-idx]').forEach((tr) => {
      tr.onclick = () => {
        selectedIdx = Number(tr.dataset.idx);
        tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('selected'));
        tr.classList.add('selected');
        renderDetail();
      };
    });
  }

  function renderDashboard() {
    const byDevice = countBy(filtered, (e) => e.deviceType);
    const byOS = countBy(filtered, (e) => e.os);
    const byBrowser = countBy(filtered, (e) => {
      const b = String(e.browser || '');
      return b.split(' ')[0] || 'Desconegut';
    });
    const byKind = countBy(filtered, (e) => e.kind);
    const byPath = countBy(filtered, (e) => `${e.method || ''} ${e.path || ''}`);
    const byOrigin = countBy(filtered, (e) => e.origin || e.referer || e.host || '(directe)');
    const byIp = countBy(filtered, (e) => e.ip || '—');

    const kpiWrap = body.querySelector('#audit-kpis');
    if (kpiWrap) kpiWrap.innerHTML = kpis(filtered);
    const charts = body.querySelector('#audit-charts');
    if (charts) charts.innerHTML =
      timelineChart(filtered) +
      barChart('Per tipus de dispositiu', '📱', byDevice) +
      barChart('Per sistema operatiu', '💻', byOS) +
      barChart('Per navegador', '🌐', byBrowser) +
      barChart('Per classificació', '🗂️', byKind) +
      barChart('Per codi d\'estat', '🏷️', statusBuckets(filtered), { colorFor: statusColor }) +
      barChart('Rutes més accedides', '🛤️', byPath, { max: 10 }) +
      barChart('Orígens / referers', '🔗', byOrigin, { max: 8 }) +
      barChart('IP amb més accés', '🌐', byIp, { max: 8 });
  }

  async function load() {
    const loading = body.querySelector('#audit-count');
    if (loading) loading.textContent = 'Carregant…';
    all = await loadAccessLog(2000);
    filtered = all;
    selectedIdx = -1;
    renderDashboard();
    renderTable();
    renderDetail();
  }

  body.innerHTML = `
    <h2>📊 Auditoria d'accessos</h2>
    <p class="audit-sub">Qui, com, quan, per què i a través de on està accedint a l'app.</p>
    <div class="tool-actions">
      <button id="audit-refresh" class="btn-secondary">↻ Actualitzar</button>
      <button id="audit-export" class="btn-secondary">⬇️ Descarregar JSON</button>
      <button id="audit-close" class="btn-secondary">✕ Tancar</button>
    </div>
    <input id="audit-search" type="search" class="tool-search" placeholder="Filtrar per IP, ruta, dispositiu, navegador, estat, origen…" autocomplete="off" />
    <p class="tool-count" id="audit-count"></p>
    <div id="audit-kpis" class="kpi-row"></div>
    <div id="audit-charts" class="charts-grid"></div>
    <div class="audit-split">
      <div class="audit-table-side">
        <div class="tool-table-wrap access-log-wrap">
          <table class="score-table access-log-table audit-table">
            <thead><tr>${TABLE_COLS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
            <tbody id="audit-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="audit-detail-side" id="audit-detail"></div>
    </div>`;

  body.querySelector('#audit-search').addEventListener('input', (ev) => {
    filtered = applyFilter(all, ev.target.value);
    selectedIdx = -1;
    renderDashboard();
    renderTable();
    renderDetail();
  });
  body.querySelector('#audit-refresh').onclick = () => { load(); flashNotification('Actualitzat'); };
  body.querySelector('#audit-export').onclick = () => {
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'auditoria-accessos.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  body.querySelector('#audit-close').onclick = () => hide(overlay);

  await load();
}
