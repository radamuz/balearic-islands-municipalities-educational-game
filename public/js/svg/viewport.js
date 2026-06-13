// SVG viewBox-based zoom & pan. Panning is computed from raw pixel deltas using
// the screen-CTM captured at drag start (not re-projected every move) so it
// tracks the cursor 1:1 and stays smooth. Other modules subscribe to viewBox
// changes (onViewBoxChange) to keep zoom-aware overlays like labels in sync.

let vb = { x: 0, y: 0, w: 0, h: 0 };
let initial = { x: 0, y: 0, w: 0, h: 0 };
let svgEl = null;
let containerEl = null;

const minScale = 0.5;
const maxScale = 14;

const changeSubs = [];
export function onViewBoxChange(cb) { changeSubs.push(cb); }

// Current rendered px-per-viewBox-unit (accounts for letterboxing).
export function getScale() {
  const ctm = svgEl && svgEl.getScreenCTM();
  if (ctm && ctm.a) return ctm.a;
  if (containerEl) return containerEl.clientWidth / vb.w;
  return 1;
}

export function getViewBox() { return { ...vb }; }

let rafPending = false;
function applyViewBox() {
  rafPending = false;
  svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  changeSubs.forEach((cb) => cb(vb));
}

function setViewBox(x, y, w, h) {
  vb = { x, y, w, h };
  if (!rafPending) { rafPending = true; requestAnimationFrame(applyViewBox); }
}

function clampScale(scale) {
  return Math.max(minScale, Math.min(maxScale, scale));
}

function clientToSvgPoint(clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  return pt.matrixTransform(ctm.inverse());
}

function zoomAround(svgPoint, factor) {
  const curScale = initial.w / vb.w;
  const newScale = clampScale(curScale * factor);
  const newW = initial.w / newScale;
  const newH = initial.h / newScale;
  const newX = svgPoint.x - (svgPoint.x - vb.x) * (newW / vb.w);
  const newY = svgPoint.y - (svgPoint.y - vb.y) * (newH / vb.h);
  setViewBox(newX, newY, newW, newH);
}

// Zoom by `factor` (>1 in, <1 out), centered on the container.
export function zoomBy(factor) {
  const rect = containerEl.getBoundingClientRect();
  zoomAround(clientToSvgPoint(rect.left + rect.width / 2, rect.top + rect.height / 2), factor);
}

export function resetZoom() {
  setViewBox(initial.x, initial.y, initial.w, initial.h);
}

// Expand the canvas (e.g. to fit solution labels) and make it the new reset box.
export function updateViewBox(x, y, w, h) {
  initial = { x, y, w, h };
  setViewBox(x, y, w, h);
}

export function setupZoomPan(container, svg, onTap) {
  svgEl = svg;
  containerEl = container;

  const vbAttr = svg.getAttribute('viewBox');
  if (vbAttr) {
    const p = vbAttr.split(/\s+/).map(Number);
    if (p.length === 4) vb = { x: p[0], y: p[1], w: p[2], h: p[3] };
  } else {
    const bb = svg.getBBox();
    vb = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }
  initial = { ...vb };

  container.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const svgP = clientToSvgPoint(ev.clientX, ev.clientY);
    zoomAround(svgP, ev.deltaY > 0 ? 1 / 1.15 : 1.15);
  }, { passive: false });

  // --- smooth pointer panning -------------------------------------------
  let isPanning = false, startVb = null, downPoint = null, ctmScale = { a: 1, d: 1 };
  container.addEventListener('pointerdown', (ev) => {
    const onSvg = (ev.target instanceof Element) && ev.target.closest && ev.target.closest('svg');
    if (ev.pointerType === 'mouse') {
      const isLeft = ev.button === 0;
      const isMiddleOrRight = ev.button === 1 || ev.button === 2;
      if (!(isMiddleOrRight || (isLeft && onSvg))) return;
    }
    isPanning = true;
    startVb = { ...vb };
    downPoint = { x: ev.clientX, y: ev.clientY };
    const ctm = svgEl.getScreenCTM();
    ctmScale = { a: (ctm && ctm.a) || 1, d: (ctm && ctm.d) || 1 };
    container.classList.add('panning');
    try { container.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  container.addEventListener('pointermove', (ev) => {
    if (!isPanning) return;
    const dx = (ev.clientX - downPoint.x) / ctmScale.a;
    const dy = (ev.clientY - downPoint.y) / ctmScale.d;
    setViewBox(startVb.x - dx, startVb.y - dy, startVb.w, startVb.h);
  });
  function endPan(ev) {
    if (!isPanning) return;
    isPanning = false;
    container.classList.remove('panning');
    try { container.releasePointerCapture(ev.pointerId); } catch (e) {}
    const moved = Math.hypot(ev.clientX - downPoint.x, ev.clientY - downPoint.y);
    if (moved < 4 && onTap) onTap(ev);
  }
  container.addEventListener('pointerup', endPan);
  container.addEventListener('pointercancel', () => { isPanning = false; container.classList.remove('panning'); });

  // --- touch pinch -------------------------------------------------------
  let ongoing = [];
  const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  container.addEventListener('touchstart', (ev) => {
    if (ev.touches.length === 2) ongoing = [ev.touches[0], ev.touches[1]];
  }, { passive: false });
  container.addEventListener('touchmove', (ev) => {
    if (ev.touches.length === 2 && ongoing.length === 2) {
      ev.preventDefault();
      const t1 = ev.touches[0], t2 = ev.touches[1];
      const factor = dist(t1, t2) / dist(ongoing[0], ongoing[1]);
      const cx = (t1.clientX + t2.clientX) / 2, cy = (t1.clientY + t2.clientY) / 2;
      zoomAround(clientToSvgPoint(cx, cy), factor);
      ongoing = [t1, t2];
    }
  }, { passive: false });
  container.addEventListener('touchend', () => { ongoing = []; });
  container.addEventListener('touchcancel', () => { ongoing = []; });

  container.addEventListener('dblclick', () => resetZoom());
}
