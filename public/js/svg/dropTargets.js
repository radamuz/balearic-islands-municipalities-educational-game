import { normalizeKey } from '../utils/normalize.js';
import { isMatch, getIslandGroup } from '../game/matching.js';
import { addLabel } from './labelLayer.js';
import { flashNotification, popFeedback } from '../ui/notifications.js';
import { registerHit, registerMistake, isGroupLabeled, markGroupLabeled, isPlaying } from '../game/gameState.js';
import { markItemPlaced } from '../ui/lists.js';

function unionBBox(elements) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  elements.forEach((node) => {
    const b = node.getBBox();
    minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
    maxx = Math.max(maxx, b.x + b.width); maxy = Math.max(maxy, b.y + b.height);
  });
  return { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny };
}

// Visually resolve a correct drop. Municipality drops paint the single shape
// green; island drops outline every shape of that island. A shape can carry
// both states at once (e.g. island placed first, then its municipality) — CSS
// ordering makes the municipality green win, which fixes the old bug where the
// island fill (!important) hid a correctly-placed municipality.
function highlightMatch(svg, el, placedName, group) {
  if (group) {
    const groupKeys = new Set(group.map(normalizeKey));
    const members = Array.from(svg.querySelectorAll('[data-name]'))
      .filter((n) => groupKeys.has(normalizeKey(n.getAttribute('data-name'))));
    members.forEach((n) => n.classList.add('island-correct'));
    const groupKey = normalizeKey(placedName);
    if (members.length && !isGroupLabeled(groupKey)) {
      addLabel(placedName, unionBBox(members), 'title');
      markGroupLabeled(groupKey);
    }
  } else {
    el.classList.add('muni-correct');
    if (!el.getAttribute('data-labeled')) {
      const b = el.getBBox();
      addLabel(placedName, { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height }, 'muni');
      el.setAttribute('data-labeled', 'true');
    }
  }
}

function handleDrop(svg, el, fallbackName, e) {
  e.preventDefault();
  if (!isPlaying()) return;
  let placedName, kind;
  try {
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    placedName = data.name; kind = data.kind;
  } catch (err) {
    placedName = e.dataTransfer.getData('text/plain'); kind = null;
  }
  const targetName = el.getAttribute('data-name') || fallbackName;
  if (isMatch(placedName, targetName, kind)) {
    const group = getIslandGroup(placedName, kind);
    highlightMatch(svg, el, placedName, group);
    markItemPlaced(placedName, kind);
    const { points, combo } = registerHit();
    popFeedback(e.clientX, e.clientY, `+${points}`, combo >= 3 ? `COMBO x${combo}` : '');
  } else {
    el.classList.add('incorrect');
    setTimeout(() => el.classList.remove('incorrect'), 500);
    registerMistake();
    popFeedback(e.clientX, e.clientY, '✗', '', true);
  }
}

export function setupSvgDropTargets(svg) {
  const shapeTargets = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
  shapeTargets.forEach((el) => {
    const nameAttr = el.getAttribute('data-name') || el.id || el.getAttribute('name') || el.getAttribute('inkscape:label');
    if (!nameAttr) return;
    el.classList.add('svg-drop-target');
    el.addEventListener('dragover', (e) => { e.preventDefault(); });
    el.addEventListener('drop', (e) => handleDrop(svg, el, nameAttr, e));
  });
}
