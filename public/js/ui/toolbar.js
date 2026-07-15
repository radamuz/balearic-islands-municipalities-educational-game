import { zoomBy, resetZoom } from '../svg/viewport.js';
import { saveMapping } from '../api/client.js';
import { getAllMapping } from '../svg/mappingState.js';
import { showSolution } from '../svg/solution.js';
import { showLeaderboard } from './overlays.js';
import { showLeaderboardTool, showAccessLogTool, downloadMappingFile } from './dataTools.js';
import { initFlags } from './flags.js';
import { initAdminAuth } from './adminAuth.js';
import { flashNotification } from './notifications.js';

function closeListsPanel() {
  const panel = document.getElementById('lists-panel');
  panel.classList.remove('open');
}

function openListsPanel() {
  const panel = document.getElementById('lists-panel');
  panel.classList.add('open');
}

export function setupToolbar() {
  const container = document.getElementById('map-container');
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

  on('zoom-in', 'click', () => zoomBy(1.25));
  on('zoom-out', 'click', () => zoomBy(1 / 1.25));
  on('zoom-reset', 'click', () => resetZoom());
  on('leaderboard-btn', 'click', () => showLeaderboard());

  // Toggle lists panel on mobile
  const toggleBtn = document.getElementById('toggle-lists-mobile');
  const closeBtn = document.getElementById('close-lists-panel');
  const panel = document.getElementById('lists-panel');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.toggle('open');
    });
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeListsPanel();
    });
  }

  // Cerrar panel al tocar el área del mapa en móvil
  const mapArea = document.getElementById('map-area');
  if (mapArea) {
    mapArea.addEventListener('click', (e) => {
      const panel = document.getElementById('lists-panel');
      if (panel && panel.classList.contains('open') && e.target !== panel && !panel.contains(e.target)) {
        closeListsPanel();
      }
    });
  }

  let mappingMode = false;
  on('edit-mapping', 'click', () => {
    const editBtn = document.getElementById('edit-mapping');
    mappingMode = !mappingMode;
    editBtn.classList.toggle('active', mappingMode);
    container.classList.toggle('mapping-mode', mappingMode);
    const svg = container.querySelector('svg');
    if (svg) svg.querySelectorAll('[data-shape-index]').forEach((el) => el.classList.toggle('mapping-highlight', mappingMode));
  });

  on('save-mapping', 'click', async () => {
    const res = await saveMapping(getAllMapping());
    if (res.ok) flashNotification('Assignació guardada');
    else if (res.status === 401) flashNotification('Sessió caducada, torna a entrar');
    else flashNotification('Error al guardar');
  });

  on('download-mapping', 'click', () => downloadMappingFile());

  on('show-solution', 'click', () => {
    const svg = container.querySelector('svg');
    if (!svg) return;
    showSolution(svg);
    const b = document.getElementById('show-solution');
    if (b) b.disabled = true;
  });

  on('manage-leaderboard', 'click', () => showLeaderboardTool());
  on('manage-accesslog', 'click', () => showAccessLogTool());

  initFlags();
  initAdminAuth();
}
