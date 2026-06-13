import { zoomBy, resetZoom } from '../svg/viewport.js';
import { saveMapping } from '../api/client.js';
import { getAllMapping } from '../svg/mappingState.js';
import { showSolution } from '../svg/solution.js';
import { showLeaderboard } from './overlays.js';
import { flashNotification } from './notifications.js';

export function setupToolbar() {
  const container = document.getElementById('map-container');
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

  on('zoom-in', 'click', () => zoomBy(1.25));
  on('zoom-out', 'click', () => zoomBy(1 / 1.25));
  on('zoom-reset', 'click', () => resetZoom());
  on('leaderboard-btn', 'click', () => showLeaderboard());

  on('toggle-lists-mobile', 'click', () => {
    document.getElementById('lists-panel').classList.toggle('open');
  });

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
    flashNotification(res.ok ? 'Mapeo guardado' : 'Error al guardar');
  });

  on('show-solution', 'click', () => {
    const svg = container.querySelector('svg');
    if (!svg) return;
    showSolution(svg);
    const b = document.getElementById('show-solution');
    if (b) b.disabled = true;
  });
}
