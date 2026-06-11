// SVG viewBox-based zoom & pan. Other modules call zoomBy/resetZoom/updateViewBox
// directly once setupZoomPan has run for the current map SVG.

let vb = { x: 0, y: 0, w: 0, h: 0 };
let initial = { x: 0, y: 0, w: 0, h: 0 };
let svgEl = null;

const minScale = 0.2;
const maxScale = 8;

function setViewBox(x, y, w, h) {
  vb = { x, y, w, h };
  svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
}

function clampScale(scale) {
  return Math.max(minScale, Math.min(maxScale, scale));
}

function clientToSvgPoint(clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const inv = ctm.inverse();
  const p = pt.matrixTransform(inv);
  return { x: p.x, y: p.y };
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

// Zoom by `factor` (>1 zooms in, <1 zooms out), centered on the container.
export function zoomBy(factor, container) {
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  zoomAround(clientToSvgPoint(cx, cy), factor);
}

export function resetZoom() {
  setViewBox(initial.x, initial.y, initial.w, initial.h);
}

// Expand the canvas (e.g. to fit solution labels) and make that the new "reset" viewBox.
export function updateViewBox(x, y, w, h) {
  initial = { x, y, w, h };
  setViewBox(x, y, w, h);
}

// Use SVG viewBox for crisp zooming and panning (vector-scaled).
export function setupZoomPan(container, svg, onTap) {
  svgEl = svg;

  const vbAttr = svg.getAttribute('viewBox');
  if (vbAttr) {
    const parts = vbAttr.split(/\s+/).map(Number);
    if (parts.length === 4) vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  } else {
    vb = {
      x: 0, y: 0,
      w: (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) ? svg.viewBox.baseVal.width : svg.clientWidth,
      h: (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height) ? svg.viewBox.baseVal.height : svg.clientHeight,
    };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }
  initial = { ...vb };

  // wheel zoom centered on cursor
  container.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const svgP = clientToSvgPoint(ev.clientX, ev.clientY);
    const delta = ev.deltaY > 0 ? 1 / 1.12 : 1.12;
    zoomAround(svgP, delta);
  }, { passive: false });

  // panning via pointer drag (left-button) or middle/right
  let isPanning = false; let panStart = null; let startVb = null; let downPoint = null;
  container.addEventListener('pointerdown', (ev) => {
    const clickedOnSvg = (ev.target instanceof Element) && (ev.target.closest && ev.target.closest('svg'));
    if (ev.pointerType === 'mouse') {
      const isLeft = ev.button === 0;
      const isMiddleOrRight = ev.button === 1 || ev.button === 2;
      if (!(isMiddleOrRight || (isLeft && clickedOnSvg))) return;
    }
    isPanning = true;
    panStart = clientToSvgPoint(ev.clientX, ev.clientY);
    startVb = { ...vb };
    downPoint = { x: ev.clientX, y: ev.clientY };
    try { container.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  container.addEventListener('pointermove', (ev) => {
    if (!isPanning) return;
    const cur = clientToSvgPoint(ev.clientX, ev.clientY);
    const dx = cur.x - panStart.x; const dy = cur.y - panStart.y;
    setViewBox(startVb.x - dx, startVb.y - dy, startVb.w, startVb.h);
  });
  container.addEventListener('pointerup', (ev) => {
    if (!isPanning) return;
    isPanning = false;
    try { container.releasePointerCapture(ev.pointerId); } catch (e) {}
    // pointer capture re-targets pointer events to the container, so a plain
    // 'click' on the SVG shape underneath never fires. Detect a tap (no
    // meaningful movement) here and let the caller resolve the shape under it.
    const moved = Math.hypot(ev.clientX - downPoint.x, ev.clientY - downPoint.y);
    if (moved < 4 && onTap) onTap(ev);
  });
  container.addEventListener('pointercancel', () => { isPanning = false; });

  // touch pinch handling
  let ongoingTouches = [];
  function getDistance(t1, t2) {
    const dx = t2.clientX - t1.clientX; const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }
  container.addEventListener('touchstart', (ev) => {
    if (ev.touches.length === 2) { ongoingTouches = [ev.touches[0], ev.touches[1]]; }
  }, { passive: false });
  container.addEventListener('touchmove', (ev) => {
    if (ev.touches.length === 2 && ongoingTouches.length === 2) {
      ev.preventDefault();
      const t1 = ev.touches[0], t2 = ev.touches[1];
      const prevDist = getDistance(ongoingTouches[0], ongoingTouches[1]);
      const newDist = getDistance(t1, t2);
      const factor = newDist / prevDist;
      const cx = (t1.clientX + t2.clientX) / 2; const cy = (t1.clientY + t2.clientY) / 2;
      zoomAround(clientToSvgPoint(cx, cy), factor);
      ongoingTouches = [t1, t2];
    }
  }, { passive: false });
  container.addEventListener('touchend', () => { ongoingTouches = []; });
  container.addEventListener('touchcancel', () => { ongoingTouches = []; });

  // reset on double click
  container.addEventListener('dblclick', () => resetZoom());
}
