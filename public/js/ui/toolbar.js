import { zoomBy, resetZoom } from '../svg/viewport.js';
import { saveMapping } from '../api/client.js';
import { getAllMapping } from '../svg/mappingState.js';
import { showSolution } from '../svg/solution.js';
import { showLeaderboard } from './overlays.js';
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

  on('toggle-lists-mobile', 'click', () => {
    const panel = document.getElementById('lists-panel');
    if (panel.classList.contains('open')) {
      closeListsPanel();
    } else {
      openListsPanel();
    }
  });

  on('close-lists-panel', 'click', closeListsPanel);

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
    flashNotification(res.ok ? 'Assignació guardada' : 'Error al guardar');
  });

  on('show-solution', 'click', () => {
    const svg = container.querySelector('svg');
    if (!svg) return;
    showSolution(svg);
    const b = document.getElementById('show-solution');
    if (b) b.disabled = true;
  });
}
