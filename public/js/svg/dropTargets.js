import { normalizeKey } from '../utils/normalize.js';
import { isMatch, getIslandGroup } from '../game/matching.js';
import { addSvgLabel } from './svgLabels.js';
import { flashNotification } from '../ui/notifications.js';
import { incrementScore, isGroupLabeled, markGroupLabeled } from '../game/gameState.js';
import { markItemPlaced } from '../ui/lists.js';

// Style every matched shape for a successful drop, and label the area once.
function highlightMatch(svg, el, placedName, group) {
  let matchedElements;
  if (group) {
    const groupKeys = new Set(group.map(normalizeKey));
    matchedElements = Array.from(svg.querySelectorAll('[data-name]')).filter((node) => groupKeys.has(normalizeKey(node.getAttribute('data-name'))));
  } else {
    matchedElements = [el];
  }

  matchedElements.forEach((node) => {
    node.classList.add('matched');
    if (group) {
      node.classList.add('island-outline');
    } else {
      node.style.fill = '#6fcd8a';
      node.style.stroke = '#006400';
      node.style.transition = 'fill 200ms ease, stroke 200ms ease';
    }
  });

  // add a single text label for the matched area (if not already added)
  try {
    const svgRoot = (el.ownerSVGElement) ? el.ownerSVGElement : el.closest('svg');
    const groupKey = group ? normalizeKey(placedName) : null;
    const alreadyLabeled = group ? isGroupLabeled(groupKey) : el.getAttribute('data-labeled');
    if (svgRoot && !alreadyLabeled) {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      matchedElements.forEach((node) => {
        const b = node.getBBox();
        minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
        maxx = Math.max(maxx, b.x + b.width); maxy = Math.max(maxy, b.y + b.height);
      });
      const cx = (minx + maxx) / 2;
      let ly = (miny + maxy) / 2;
      if (group) {
        // place the label outside the island's bounding box: above it,
        // unless that would fall off the top of the map, then below
        const margin = 4;
        const vb = svg.viewBox && svg.viewBox.baseVal;
        const vbMinY = vb ? vb.y : 0;
        ly = (miny - margin > vbMinY) ? (miny - margin) : (maxy + margin);
      }
      addSvgLabel(svgRoot, cx, ly, placedName);
      if (group) markGroupLabeled(groupKey);
      else el.setAttribute('data-labeled', 'true');
    }
  } catch (e) { console.warn('Could not place label on SVG element', e); }
}

export function setupSvgDropTargets(svg) {
  const shapeTargets = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
  shapeTargets.forEach((el) => {
    const nameAttr = el.getAttribute('data-name') || el.id || el.getAttribute('name') || el.getAttribute('inkscape:label');
    if (!nameAttr) return;
    el.classList.add('svg-drop-target');
    el.style.cursor = 'pointer';
    el.addEventListener('dragover', (e) => { e.preventDefault(); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      let placedName, kind;
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        placedName = data.name; kind = data.kind;
      } catch (err) {
        placedName = e.dataTransfer.getData('text/plain'); kind = null;
      }
      const targetName = el.getAttribute('data-name') || nameAttr;
      const ok = isMatch(placedName, targetName, kind);
      if (ok) {
        // if the dropped item is an island whose territory is split across
        // several municipalities, highlight the outline of every shape of
        // that island instead of filling just the one the user dropped on
        const group = getIslandGroup(placedName, kind);
        highlightMatch(svg, el, placedName, group);
        markItemPlaced(placedName, kind);
        incrementScore();
        flashNotification('¡Correcto!');
      } else {
        el.classList.add('incorrect');
        setTimeout(() => el.classList.remove('incorrect'), 600);
        flashNotification('Incorrecto');
      }
    });
  });
}
