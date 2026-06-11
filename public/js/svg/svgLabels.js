import { islandOf } from '../data/islandGroups.js';
import { updateViewBox } from './viewport.js';

const NORMAL = 9;   // font size (viewBox units) for municipality labels
const TITLE = 15;   // font size for island titles
const CHAR_W = 0.55; // approx glyph width as a fraction of font size

// Create and append a text label to the SVG at the given position.
export function addSvgLabel(svgRoot, x, y, text, anchor, fontSize) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('text-anchor', anchor || 'middle');
  el.setAttribute('dominant-baseline', 'middle');
  el.classList.add('svg-label');
  // inline style beats the stylesheet's font-size so callers can scale labels
  if (fontSize) el.style.fontSize = fontSize + 'px';
  el.textContent = text;
  svgRoot.appendChild(el);
  return el;
}

// Make sure the SVG has an arrowhead marker definition for leader lines.
export function ensureArrowMarker(svg) {
  if (svg.querySelector('#leader-arrow')) return;
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'leader-arrow');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
  path.setAttribute('fill', '#555');
  marker.appendChild(path);
  defs.appendChild(marker);
}

const labelWidth = (name, size) => name.length * CHAR_W * size;

// Map-style label layout. Each point is {name, cx, cy, w, h, isTitle}.
// Labels are grouped by island. A label that fits inside its own shape is
// drawn centered there with no leader line; labels that don't fit are pushed
// out to the left/right edge of their island, stacked without overlap and
// connected with a short arrow. Island titles go above the island. The SVG
// viewBox is expanded to fit everything.
export function placeLabelsAround(svg, points) {
  if (points.length === 0) return;
  ensureArrowMarker(svg);

  const vb0 = svg.viewBox.baseVal;
  let exMinX = vb0.x, exMinY = vb0.y, exMaxX = vb0.x + vb0.width, exMaxY = vb0.y + vb0.height;
  const include = (x, y) => {
    exMinX = Math.min(exMinX, x); exMinY = Math.min(exMinY, y);
    exMaxX = Math.max(exMaxX, x); exMaxY = Math.max(exMaxY, y);
  };

  // group points by the island their shape belongs to (small islets each get
  // their own singleton group keyed by name)
  const groups = {};
  points.forEach((p) => { const g = islandOf(p.name); (groups[g] = groups[g] || []).push(p); });

  Object.values(groups).forEach((list) => {
    // island extent from its member shapes
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    list.forEach((p) => {
      minx = Math.min(minx, p.cx - p.w / 2); maxx = Math.max(maxx, p.cx + p.w / 2);
      miny = Math.min(miny, p.cy - p.h / 2); maxy = Math.max(maxy, p.cy + p.h / 2);
    });
    const cX = (minx + maxx) / 2;

    const inside = [], titles = [], sides = [];
    list.forEach((p) => {
      if (p.isTitle) { titles.push(p); return; }
      const fits = labelWidth(p.name, NORMAL) <= p.w * 0.95 && NORMAL <= p.h * 0.95;
      (fits ? inside : sides).push(p);
    });

    // labels that fit: centered inside the shape, no leader line
    inside.forEach((p) => {
      addSvgLabel(svg, p.cx, p.cy, p.name, 'middle', NORMAL);
      const hw = labelWidth(p.name, NORMAL) / 2;
      include(p.cx - hw, p.cy); include(p.cx + hw, p.cy);
    });

    // labels that don't fit: out to the nearest side, decluttered vertically
    const gap = NORMAL * 1.3;
    const leftList = sides.filter((p) => p.cx < cX).sort((a, b) => a.cy - b.cy);
    const rightList = sides.filter((p) => p.cx >= cX).sort((a, b) => a.cy - b.cy);

    function layoutSide(arr, laneX, anchor) {
      if (arr.length === 0) return;
      // push down to remove overlaps, then recenter the column on the island
      let prev = -Infinity;
      arr.forEach((p) => { let y = p.cy; if (y < prev + gap) y = prev + gap; prev = y; p._y = y; });
      const curMid = (arr[0]._y + arr[arr.length - 1]._y) / 2;
      const shift = (miny + maxy) / 2 - curMid;
      arr.forEach((p) => p._y += shift);

      arr.forEach((p) => {
        addSvgLabel(svg, laneX, p._y, p.name, anchor, NORMAL);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p.cx); line.setAttribute('y1', p.cy);
        line.setAttribute('x2', laneX + (anchor === 'end' ? 3 : -3));
        line.setAttribute('y2', p._y);
        line.classList.add('leader-line');
        line.setAttribute('marker-end', 'url(#leader-arrow)');
        svg.appendChild(line);
        const tw = labelWidth(p.name, NORMAL);
        if (anchor === 'end') include(laneX - tw, p._y); else include(laneX + tw, p._y);
      });
    }
    layoutSide(leftList, minx - 8, 'end');
    layoutSide(rightList, maxx + 8, 'start');

    // island title above the island
    titles.forEach((p) => {
      const ty = miny - TITLE;
      addSvgLabel(svg, cX, ty, p.name, 'middle', TITLE);
      include(cX, ty - TITLE);
    });
  });

  const m = 6;
  const newX = exMinX - m, newY = exMinY - m;
  const newW = (exMaxX - exMinX) + 2 * m, newH = (exMaxY - exMinY) + 2 * m;
  updateViewBox(newX, newY, newW, newH);
}
