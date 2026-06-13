// Zoom-aware label layer. Every label keeps a constant on-screen size; on each
// zoom change we re-decide whether each name fits *inside* its own shape (the
// preferred, most readable placement) or must be pushed just outside it with a
// short leader arrow. Panning is ignored (labels live in SVG coordinates and
// move with the map), so re-layout only happens when the scale changes.

import { onViewBoxChange, getScale } from './viewport.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CHAR_W = 0.56;          // approx glyph width as a fraction of font size
const MUNI_PX = 13;           // target on-screen size for municipality labels
const TITLE_PX = 22;          // target on-screen size for island titles
const PAD = 4;                // gap (svg units) between shape and outside label

let svgEl = null;
let layer = null;
const labels = [];            // { name, kind:'muni'|'title', cx, cy, w, h }
let lastScale = 0;

function ensureArrowMarker(svg) {
  if (svg.querySelector('#leader-arrow')) return;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(SVGNS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
  const marker = document.createElementNS(SVGNS, 'marker');
  marker.setAttribute('id', 'leader-arrow');
  marker.setAttribute('markerWidth', '7'); marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '5'); marker.setAttribute('refY', '3'); marker.setAttribute('orient', 'auto');
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
  path.setAttribute('class', 'leader-arrow-head');
  marker.appendChild(path); defs.appendChild(marker);
}

export function setupLabelLayer(svg) {
  svgEl = svg;
  ensureArrowMarker(svg);
  layer = document.createElementNS(SVGNS, 'g');
  layer.setAttribute('class', 'label-layer');
  svg.appendChild(layer);
  onViewBoxChange(() => {
    const s = getScale();
    if (Math.abs(s - lastScale) / (lastScale || 1) > 0.02) render();
  });
}

// Register a label anchored to a shape's bounding box (svg coords).
export function addLabel(name, bbox, kind = 'muni') {
  labels.push({ name, kind, cx: bbox.cx, cy: bbox.cy, w: bbox.w, h: bbox.h });
  render();
}

// Register many labels at once, re-rendering only after the whole batch.
export function addLabels(list) {
  list.forEach(({ name, bbox, kind }) => labels.push({ name, kind: kind || 'muni', cx: bbox.cx, cy: bbox.cy, w: bbox.w, h: bbox.h }));
  render();
}

export function clearLabels() {
  labels.length = 0;
  if (layer) layer.innerHTML = '';
}

const textWidth = (name, font) => name.length * CHAR_W * font;
const overlaps = (a, b) => !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);

function drawText(x, y, name, anchor, font, cls) {
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('text-anchor', anchor);
  t.setAttribute('dominant-baseline', 'middle');
  t.setAttribute('class', cls);
  t.style.fontSize = font + 'px';
  t.style.strokeWidth = (font * 0.16) + 'px'; // halo scales with the label
  t.textContent = name;
  layer.appendChild(t);
}

function drawLeader(x1, y1, x2, y2) {
  const l = document.createElementNS(SVGNS, 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('class', 'leader-line');
  l.setAttribute('marker-end', 'url(#leader-arrow)');
  layer.appendChild(l);
}

function render() {
  if (!layer) return;
  lastScale = getScale();
  layer.innerHTML = '';
  const muniFont = MUNI_PX / lastScale;
  const titleFont = TITLE_PX / lastScale;
  const placed = []; // collision rects, plus shape rects so leaders dodge shapes

  // reserve the shapes themselves so outside labels don't land on a neighbour
  labels.forEach((p) => placed.push({ x1: p.cx - p.w / 2, y1: p.cy - p.h / 2, x2: p.cx + p.w / 2, y2: p.cy + p.h / 2, soft: true }));

  // titles first (highest priority), then by area so big shapes claim space
  const order = [...labels].sort((a, b) => {
    if ((a.kind === 'title') !== (b.kind === 'title')) return a.kind === 'title' ? -1 : 1;
    return b.w * b.h - a.w * a.h;
  });

  order.forEach((p) => {
    const isTitle = p.kind === 'title';
    const font = isTitle ? titleFont : muniFont;
    const tw = textWidth(p.name, font);
    const th = font;

    if (isTitle) {
      // island name: centered just above the island, nudged up to stay clear
      let ty = p.cy - p.h / 2 - th * 0.7;
      const trect = (yy) => ({ x1: p.cx - tw / 2, y1: yy - th / 2, x2: p.cx + tw / 2, y2: yy + th / 2 });
      let t = 0;
      while (t < 30 && placed.some((r) => !r.soft && overlaps(trect(ty), r))) { ty -= th * 1.1; t += 1; }
      drawText(p.cx, ty, p.name, 'middle', font, 'svg-label title');
      placed.push(trect(ty));
      return;
    }

    const fitsInside = tw <= p.w * 0.92 && th <= p.h * 0.92;
    if (fitsInside) {
      drawText(p.cx, p.cy, p.name, 'middle', font, 'svg-label inside');
      placed.push({ x1: p.cx - tw / 2, y1: p.cy - th / 2, x2: p.cx + tw / 2, y2: p.cy + th / 2 });
      return;
    }

    // Outside placement with leader. Prefer the side with more breathing room.
    const vb = svgEl.viewBox.baseVal;
    const roomRight = (vb.x + vb.width) - (p.cx + p.w / 2);
    const toRight = roomRight >= tw + PAD * 2 || roomRight >= (p.cx - p.w / 2) - vb.x;
    const anchor = toRight ? 'start' : 'end';
    const lx = toRight ? p.cx + p.w / 2 + PAD : p.cx - p.w / 2 - PAD;
    let ly = p.cy;

    // nudge vertically until it clears already-placed (hard) rects
    const rectAt = (yy) => toRight
      ? { x1: lx, y1: yy - th / 2, x2: lx + tw, y2: yy + th / 2 }
      : { x1: lx - tw, y1: yy - th / 2, x2: lx, y2: yy + th / 2 };
    let tries = 0;
    while (tries < 40 && placed.some((r) => !r.soft && overlaps(rectAt(ly), r))) {
      ly += th * 1.1; tries += 1;
    }

    drawText(lx, ly, p.name, anchor, font, 'svg-label outside');
    drawLeader(p.cx, p.cy, lx + (toRight ? -PAD / 2 : PAD / 2), ly);
    placed.push(rectAt(ly));
  });
}
