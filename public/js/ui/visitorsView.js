// Panel de Visitants — qui està accedint, identificat per empremta.
//
// Creua la llista de visitants (fingerprint) amb el log d'accessos per mostrar:
//  • KPIs: totals, humans vs bots, nous vs recurrents, darrer visitant
//  • Gràfic de nous vs recurrents per dia
//  • Taula de visitants amb nom mallorquí, humà/bot, dispositiu, #peticions…
//  • Drawer de detall amb components, peticions recents, renombrar/esborrar
//
// Cada visitant té un visitorId (FingerprintJS) → és la "mateixa persona" si
// el mateix ID apareix amb diferents IPs/origins.

import { loadVisitors, loadAccessLog, renameVisitor, deleteVisitor } from '../api/client.js';
import { flashNotification } from './notifications.js';

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? escapeHtml(iso) : d.toLocaleString('ca-ES');
}
function fmtDate(iso) {
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
  return `fa ${Math.floor(h / 24)} d`;
}
function shortId(id) { return String(id || '').slice(0, 8); }

function countBy(entries, keyFn) {
  const m = new Map();
  for (const e of entries) {
    const k = keyFn(e) || 'Desconegut';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// --- KPIs ----------------------------------------------------------------
function kpi(label, value, sub, icon) {
  return `<div class="kpi"><span class="kpi-icon">${icon}</span><span class="kpi-val">${escapeHtml(value)}</span><span class="kpi-label">${escapeHtml(label)}</span>${sub ? `<span class="kpi-sub">${escapeHtml(sub)}</span>` : ''}</div>`;
}

// --- Gràfic nous vs recurrents per dia -----------------------------------
function newReturningChart(visitors, log) {
  // Mapa visitorId → data (YYYY-MM-DD) del firstSeen.
  const firstDay = new Map();
  for (const v of visitors) {
    if (v.visitorId && v.firstSeen) firstDay.set(v.visitorId, dayKey(v.firstSeen));
  }
  // Per cada dia present al log, quins visitorIds hi són actius.
  const byDay = new Map();
  for (const e of log) {
    if (!e.visitorId) continue;
    const d = dayKey(e.time);
    if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, new Set());
    byDay.get(d).add(e.visitorId);
  }
  // També els visitants sense log però amb firstSeen.
  for (const v of visitors) {
    const d = dayKey(v.firstSeen);
    if (d && !byDay.has(d)) byDay.set(d, new Set());
    if (d && v.visitorId) byDay.get(d).add(v.visitorId);
  }
  const days = [...byDay.keys()].sort();
  if (!days.length) return `<section class="chart-card chart-card-wide"><h3>📈 Nous vs recurrents per dia</h3><p class="empty">Sense dades.</p></section>`;
  const points = days.map((d) => {
    const active = byDay.get(d);
    let neu = 0, ret = 0;
    for (const vid of active) {
      const fd = firstDay.get(vid);
      if (fd === d) neu++;
      else ret++;
    }
    return { d, neu, ret };
  });
  const max = Math.max(...points.map((p) => p.neu + p.ret), 1);
  const cols = points.map((p) => {
    const neuH = (p.neu / max) * 100;
    const retH = (p.ret / max) * 100;
    return `<div class="vr-col" title="${escapeHtml(p.d)} — ${p.neu} nous, ${p.ret} recurrents">
      <span class="vr-bar-neu" style="height:${neuH}%"></span>
      <span class="vr-bar-ret" style="height:${retH}%"></span>
      <span class="tl-label">${fmtDate(p.d)}</span>
    </div>`;
  }).join('');
  return `<section class="chart-card chart-card-wide">
    <h3>📈 Nous vs recurrents per dia <small><span class="dot dot-neu"></span> nous <span class="dot dot-ret"></span> recurrents</small></h3>
    <div class="timeline vr-timeline">${cols}</div>
  </section>`;
}
function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// --- Taula ---------------------------------------------------------------
function humanTag(v) {
  return v.human === false
    ? `<span class="tag tag-red" title="${escapeHtml(v.botReason || '')}">🤖 Bot</span>`
    : `<span class="tag tag-green">👤 Humà</span>`;
}

function tableRows(visitors, stats) {
  if (!visitors.length) return `<tr><td colspan="9" class="empty">Cap visitant registrat encara.</td></tr>`;
  return visitors.map((v, i) => {
    const s = stats[v.visitorId] || { requests: 0 };
    const ips = (v.ips || []).length || (v.lastIp ? 1 : 0);
    const origins = (v.origins || []).length;
    const samePerson = (ips > 1 || origins > 1)
      ? `<span class="tag tag-accent" title="Mateixa persona, diversos dispositius/origins">🔁 ${ips + origins}</span>`
      : '';
    return `<tr data-idx="${i}">
      <td class="who">${escapeHtml(v.name || '—')}</td>
      <td><code class="vid">${escapeHtml(shortId(v.visitorId))}</code></td>
      <td>${humanTag(v)}</td>
      <td>${escapeHtml(v.deviceType || '—')}</td>
      <td>${escapeHtml(v.os || '—')}</td>
      <td>${escapeHtml(String(v.browser || '—').split(' ')[0])}</td>
      <td class="pts">${s.requests}</td>
      <td>${ips}${origins ? ` <span class="dim">· ${origins}or</span>` : ''} ${samePerson}</td>
      <td class="tm">${escapeHtml(relTime(v.lastSeen))}</td>
    </tr>`;
  }).join('');
}

// --- Drawer de detall ----------------------------------------------------
function prettyObject(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (e) { return String(obj); }
}

function detailPanel(v, logEntries) {
  const reqs = logEntries.slice(0, 30);
  const reqRows = reqs.length ? reqs.map((e) => `
    <tr><td class="tm">${escapeHtml(fmtTime(e.time))}</td><td>${escapeHtml(e.method)}</td>
    <td class="al-path">${escapeHtml(e.path || '')}</td><td>${escapeHtml(e.status || '—')}</td>
    <td>${escapeHtml(e.ip || '—')}</td></tr>`).join('')
    : `<tr><td colspan="5" class="empty">Sense peticions registrades.</td></tr>`;

  const compBlock = v.components
    ? `<div class="fp-group"><h4>🧬 Components de l'empremta</h4><pre class="fp-cv-pre" style="max-height:280px">${escapeHtml(prettyObject(v.components))}</pre></div>`
    : '';

  return `
    <div class="vd-head">
      <div>
        <h3 class="vd-name" id="vd-name">${escapeHtml(v.name || '—')}</h3>
        <code class="vid vid-full">${escapeHtml(v.visitorId || '')}</code>
      </div>
      ${humanTag(v)}
    </div>
    <div class="vd-rename">
      <input id="vd-rename-input" type="text" class="tool-search" value="${escapeHtml(v.name || '')}" placeholder="Nom mallorquí…" />
      <button id="vd-rename-btn" class="btn-secondary">Desar nom</button>
      <button id="vd-delete-btn" class="btn-secondary btn-danger">Esborrar</button>
    </div>
    <div class="vd-grid">
      <div class="df"><span class="df-k">Primera vegada</span><span class="df-v">${escapeHtml(fmtTime(v.firstSeen))}</span></div>
      <div class="df"><span class="df-k">Darrera vegada</span><span class="df-v">${escapeHtml(fmtTime(v.lastSeen))} (${escapeHtml(relTime(v.lastSeen))})</span></div>
      <div class="df"><span class="df-k">Visites</span><span class="df-v">${v.visitCount || 0}</span></div>
      <div class="df"><span class="df-k">Confiança</span><span class="df-v">${v.confidence != null ? `${Math.round(v.confidence * 100)}%` : '—'}</span></div>
      <div class="df"><span class="df-k">Dispositiu</span><span class="df-v">${escapeHtml(v.deviceType || '—')}${v.device ? ' · ' + escapeHtml(v.device) : ''}</span></div>
      <div class="df"><span class="df-k">SO</span><span class="df-v">${escapeHtml(v.os || '—')}</span></div>
      <div class="df"><span class="df-k">Navegador</span><span class="df-v">${escapeHtml(v.browser || '—')}</span></div>
      <div class="df"><span class="df-k">User-Agent</span><span class="df-v">${escapeHtml(v.userAgent || '—')}</span></div>
      <div class="df"><span class="df-k">IP(s)</span><span class="df-v">${escapeHtml((v.ips || []).join(', ') || v.lastIp || '—')}</span></div>
      <div class="df"><span class="df-k">Origen(s)</span><span class="df-v">${escapeHtml((v.origins || []).join(', ') || '—')}</span></div>
      ${v.botReason ? `<div class="df"><span class="df-k">Motiu bot</span><span class="df-v">${escapeHtml(v.botReason)}</span></div>` : ''}
    </div>
    ${compBlock}
    <div class="fp-group">
      <h4>📜 Peticions recents (${reqs.length}${logEntries.length > 30 ? ' de ' + logEntries.length : ''})</h4>
      <div class="tool-table-wrap access-log-wrap">
        <table class="score-table access-log-table"><tbody>${reqRows}</tbody></table>
      </div>
    </div>`;
}

// --- Vista principal -----------------------------------------------------
export async function showVisitorsView() {
  const overlay = document.getElementById('visitors-overlay');
  const body = document.getElementById('visitors-body');
  show(overlay);

  let visitors = [];
  let log = [];
  let selectedIdx = -1;

  function computeStats() {
    const stats = {};
    for (const e of log) {
      if (!e.visitorId) continue;
      if (!stats[e.visitorId]) stats[e.visitorId] = { requests: 0, entries: [] };
      stats[e.visitorId].requests++;
      stats[e.visitorId].entries.push(e);
    }
    return stats;
  }

  function renderKpis(stats) {
    const humans = visitors.filter((v) => v.human !== false).length;
    const bots = visitors.length - humans;
    const today = dayKey(new Date().toISOString());
    const newToday = visitors.filter((v) => dayKey(v.firstSeen) === today).length;
    const activeToday = visitors.filter((v) => dayKey(v.lastSeen) === today).length;
    const newest = visitors[0];
    const wrap = body.querySelector('#vis-kpis');
    if (!wrap) return;
    wrap.innerHTML =
      kpi('Visitants', visitors.length, '', '👥') +
      kpi('Humans', humans, `${Math.round(visitors.length ? humans / visitors.length * 100 : 0)}%`, '👤') +
      kpi('Bots', bots, `${Math.round(visitors.length ? bots / visitors.length * 100 : 0)}%`, '🤖') +
      kpi('Nous avui', newToday, '', '✨') +
      kpi('Actius avui', activeToday, '', '📅') +
      kpi('Darrer visitant', newest ? relTime(newest.lastSeen) : '—', newest ? (newest.name || '') : '', '🕐');
  }

  function renderCharts(stats) {
    const byDevice = countBy(visitors, (v) => v.deviceType);
    const byOS = countBy(visitors, (v) => v.os);
    const byBrowser = countBy(visitors, (v) => String(v.browser || '').split(' ')[0] || '—');
    const hb = [
      { label: 'Humans', value: visitors.filter((v) => v.human !== false).length },
      { label: 'Bots', value: visitors.filter((v) => v.human === false).length },
    ];
    const wrap = body.querySelector('#vis-charts');
    if (!wrap) return;
    wrap.innerHTML =
      newReturningChart(visitors, log) +
      barChart('Humans vs Bots', '🧍', hb, { colorFor: (l) => l === 'Bots' ? 'linear-gradient(90deg,var(--red),#ff2d5c)' : 'linear-gradient(90deg,var(--green),var(--accent))' }) +
      barChart('Per dispositiu', '📱', byDevice) +
      barChart('Per SO', '💻', byOS) +
      barChart('Per navegador', '🌐', byBrowser);
  }

  function renderTable(stats) {
    const tbody = body.querySelector('#vis-tbody');
    if (!tbody) return;
    tbody.innerHTML = tableRows(visitors, stats);
    const count = body.querySelector('#vis-count');
    if (count) count.textContent = `${visitors.length} visitants · ${log.length} peticions`;
    tbody.querySelectorAll('tr[data-idx]').forEach((tr) => {
      tr.onclick = () => {
        selectedIdx = Number(tr.dataset.idx);
        tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('selected'));
        tr.classList.add('selected');
        renderDetail();
      };
    });
  }

  function renderDetail() {
    const pane = body.querySelector('#vis-detail');
    if (!pane) return;
    if (selectedIdx < 0 || !visitors[selectedIdx]) {
      pane.innerHTML = `<div class="detail-empty"><p class="empty">Selecciona un visitant per veure'n el detall.</p></div>`;
      return;
    }
    const v = visitors[selectedIdx];
    const stats = computeStats();
    const entries = (stats[v.visitorId]?.entries || [])
      .slice()
      .sort((a, b) => new Date(b.time) - new Date(a.time));
    pane.innerHTML = detailPanel(v, entries);

    pane.querySelector('#vd-rename-btn').onclick = async () => {
      const name = pane.querySelector('#vd-rename-input').value.trim();
      if (!name) return;
      const res = await renameVisitor(v.visitorId, name);
      if (res && res.name) {
        v.name = res.name;
        flashNotification('Nom desar');
        renderTable(computeStats());
        renderDetail();
      } else {
        flashNotification((res && res.error) || 'Error al desar');
      }
    };
    pane.querySelector('#vd-delete-btn').onclick = async () => {
      if (!confirm(`Esborrar el visitant "${v.name || v.visitorId}"?`)) return;
      const res = await deleteVisitor(v.visitorId);
      if (res && res.ok) {
        visitors.splice(selectedIdx, 1);
        selectedIdx = -1;
        flashNotification('Visitant esborrat');
        renderKpis(computeStats());
        renderCharts(computeStats());
        renderTable(computeStats());
        renderDetail();
      } else {
        flashNotification((res && res.error) || 'Error en esborrar');
      }
    };
  }

  async function load() {
    const c = body.querySelector('#vis-count');
    if (c) c.textContent = 'Carregant…';
    [visitors, log] = await Promise.all([loadVisitors(), loadAccessLog(2000)]);
    visitors.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    selectedIdx = -1;
    const stats = computeStats();
    renderKpis(stats);
    renderCharts(stats);
    renderTable(stats);
    renderDetail();
  }

  body.innerHTML = `
    <h2>👥 Visitants</h2>
    <p class="audit-sub">Qui està jugant, identificat per empremta. Cada ID té un nom mallorquí; es distingeix humans de bots i si és la mateixa persona entre sessions.</p>
    <div class="tool-actions">
      <button id="vis-refresh" class="btn-secondary">↻ Actualitzar</button>
      <button id="vis-close" class="btn-secondary">✕ Tancar</button>
    </div>
    <p class="tool-count" id="vis-count"></p>
    <div id="vis-kpis" class="kpi-row"></div>
    <div id="vis-charts" class="charts-grid"></div>
    <div class="audit-split">
      <div class="audit-table-side">
        <div class="tool-table-wrap access-log-wrap">
          <table class="score-table access-log-table audit-table">
            <thead><tr><th>Nom</th><th>ID</th><th>Tipus</th><th>Dispositiu</th><th>SO</th><th>Naveg.</th><th>#Pet.</th><th>IPs/origins</th><th>Darrera</th></tr></thead>
            <tbody id="vis-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="audit-detail-side" id="vis-detail"></div>
    </div>`;

  body.querySelector('#vis-refresh').onclick = () => load();
  body.querySelector('#vis-close').onclick = () => hide(overlay);

  await load();
}

// --- barChart (idèntic al de l'auditoria, duplicat per desacoplar) --------
function barChart(title, icon, data, opts = {}) {
  const { max = 8, colorFor } = opts;
  if (!data.length) return `<section class="chart-card"><h3>${icon} ${escapeHtml(title)}</h3><p class="empty">Sense dades.</p></section>`;
  const top = data.slice(0, max);
  const m = Math.max(...top.map((d) => d.value));
  const rows = top.map((d) => {
    const pct = m ? Math.max(2, (d.value / m) * 100) : 0;
    const color = colorFor ? colorFor(d.label) : '';
    return `<div class="bar-row">
      <span class="bar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%;${color ? `background:${color}` : ''}"></span></span>
      <span class="bar-value">${d.value}</span>
    </div>`;
  }).join('');
  return `<section class="chart-card"><h3>${icon} ${escapeHtml(title)}</h3><div class="bar-list">${rows}</div></section>`;
}
