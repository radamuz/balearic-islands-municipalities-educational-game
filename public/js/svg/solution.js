import { normalizeKey } from '../utils/normalize.js';
import { ISLAND_GROUPS } from '../data/islandGroups.js';
import { addLabels } from './labelLayer.js';
import { flashNotification } from '../ui/notifications.js';
import { isGroupLabeled, markGroupLabeled } from '../game/gameState.js';

// Reveal the full solution: paint every mapped shape and label it, plus an
// island title for territories that span several municipalities.
export function showSolution(svg) {
  const mappedShapes = Array.from(svg.querySelectorAll('[data-name]'));
  const pending = [];

  mappedShapes.forEach((el) => {
    el.classList.add('muni-correct');
    if (!el.getAttribute('data-labeled')) {
      const b = el.getBBox();
      pending.push({ name: el.getAttribute('data-name'), bbox: { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height }, kind: 'muni' });
      el.setAttribute('data-labeled', 'true');
    }
  });

  Object.keys(ISLAND_GROUPS).forEach((islandName) => {
    const groupKey = normalizeKey(islandName);
    if (isGroupLabeled(groupKey)) return;
    const groupKeys = new Set(ISLAND_GROUPS[islandName].map(normalizeKey));
    const elements = mappedShapes.filter((el) => groupKeys.has(normalizeKey(el.getAttribute('data-name'))));
    if (elements.length <= 1) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    elements.forEach((node) => {
      const b = node.getBBox();
      minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
      maxx = Math.max(maxx, b.x + b.width); maxy = Math.max(maxy, b.y + b.height);
    });
    pending.push({ name: islandName, bbox: { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny }, kind: 'title' });
    markGroupLabeled(groupKey);
  });

  addLabels(pending);

  document.querySelectorAll('.item').forEach((it) => {
    it.classList.add('placed');
    it.draggable = false;
  });
  flashNotification('Solución mostrada');
}
