import { zoomBy, resetZoom } from '../svg/viewport.js';
import { saveMapping } from '../api/client.js';
import { getAllMapping } from '../svg/mappingState.js';
import { showSolution } from '../svg/solution.js';
import { flashNotification } from './notifications.js';

export function setupToolbar() {
  const container = document.getElementById('map-container');
  const btnIn = document.getElementById('zoom-in');
  const btnOut = document.getElementById('zoom-out');
  const btnReset = document.getElementById('zoom-reset');
  const toggleMobile = document.getElementById('toggle-lists-mobile');
  btnIn && btnIn.addEventListener('click', () => zoomBy(1.2, container));
  btnOut && btnOut.addEventListener('click', () => zoomBy(1 / 1.2, container));
  btnReset && btnReset.addEventListener('click', () => resetZoom());
  toggleMobile && toggleMobile.addEventListener('click', () => {
    const lists = document.getElementById('lists');
    lists.style.display = (lists.style.display === 'none') ? '' : 'none';
  });

  const editBtn = document.getElementById('edit-mapping');
  const saveBtn = document.getElementById('save-mapping');
  let mappingMode = false;
  editBtn && editBtn.addEventListener('click', () => {
    mappingMode = !mappingMode;
    editBtn.textContent = mappingMode ? '🗺️ Mapeo (ON)' : '🗺️ Mapeo';
    container.classList.toggle('mapping-mode', mappingMode);
    // when entering mapping mode, highlight candidates
    const svg = container.querySelector('svg');
    if (svg) {
      svg.querySelectorAll('[data-shape-index]').forEach((el) => {
        el.classList.toggle('mapping-highlight', mappingMode);
      });
    }
  });
  saveBtn && saveBtn.addEventListener('click', async () => {
    const res = await saveMapping(getAllMapping());
    if (res.ok) flashNotification('Mapeo guardado'); else flashNotification('Error al guardar');
  });

  const solutionBtn = document.getElementById('show-solution');
  solutionBtn && solutionBtn.addEventListener('click', () => {
    const svg = container.querySelector('svg');
    if (!svg) return;
    showSolution(svg);
    solutionBtn.disabled = true;
  });
}
