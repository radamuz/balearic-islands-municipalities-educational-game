import { normalizeKey } from '../utils/normalize.js';
import { ISLAND_GROUPS } from '../data/islandGroups.js';
import { placeLabelsAround } from './svgLabels.js';
import { flashNotification } from '../ui/notifications.js';
import { isGroupLabeled, markGroupLabeled, setScore } from '../game/gameState.js';

// Reveal the full solution: highlight every mapped shape with its name,
// plus an extra outside label for islands whose territory spans several
// municipalities (Mallorca, Menorca, Eivissa).
export function showSolution(svg) {
  const mappedShapes = Array.from(svg.querySelectorAll('[data-name]'));
  const points = [];

  mappedShapes.forEach((el) => {
    el.classList.add('matched');
    el.style.fill = '#6fcd8a';
    el.style.stroke = '#006400';
    el.style.transition = 'fill 200ms ease, stroke 200ms ease';
    if (!el.getAttribute('data-labeled')) {
      const b = el.getBBox();
      points.push({ name: el.getAttribute('data-name'), cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height });
      el.setAttribute('data-labeled', 'true');
    }
  });

  // island-wide titles (Mallorca, Menorca, Eivissa span several shapes)
  Object.keys(ISLAND_GROUPS).forEach((islandName) => {
    const groupKey = normalizeKey(islandName);
    if (isGroupLabeled(groupKey)) return;
    const groupKeys = new Set(ISLAND_GROUPS[islandName].map(normalizeKey));
    const elements = mappedShapes.filter((el) => groupKeys.has(normalizeKey(el.getAttribute('data-name'))));
    if (elements.length <= 1) return; // single-shape islands already have their own label
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    elements.forEach((node) => {
      const b = node.getBBox();
      minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
      maxx = Math.max(maxx, b.x + b.width); maxy = Math.max(maxy, b.y + b.height);
    });
    points.push({ name: islandName, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny, isTitle: true });
    markGroupLabeled(groupKey);
  });

  placeLabelsAround(svg, points);

  document.querySelectorAll('.item').forEach((it) => {
    it.classList.add('placed');
    it.draggable = false;
  });
  setScore(document.querySelectorAll('.item').length);
  flashNotification('Solución mostrada');
}
