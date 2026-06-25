// SVG viewBox-based zoom & pan. Panning is computed from raw pixel deltas using
// the screen-CTM captured at drag start (not re-projected every move) so it
// tracks the cursor 1:1 and stays smooth. Other modules subscribe to viewBox
// changes (onViewBoxChange) to keep zoom-aware overlays like labels in sync.

let vb = { x: 0, y: 0, w: 0, h: 0 };
let initial = { x: 0, y: 0, w: 0, h: 0 };
let svgEl = null;
let containerEl = null;

const minScale = 0.5;
const maxScale = 200;

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

  // --- unified pointer pan + pinch --------------------------------------
  // Touch screens fire BOTH pointer and touch events for each finger, so the
  // old design (pointer-pan + touch-pinch) had the two fighting during a
  // two-finger gesture. Pointer Events support multi-touch natively via
  // pointerId, so we track every active pointer here and switch between pan
  // (1 pointer) and pinch (2 pointers) cleanly — no touch handlers needed.
  const pointers = new Map(); // pointerId -> { x, y }
  let ctmScale = { a: 1, d: 1 };
  // single-pointer pan state
  let panActive = false, panStartVb = null, panDownPoint = null, movedDist = 0, tapStart = null;
  // two-pointer pinch state
  let pinchHappened = false, pinchPrevDist = 0, pinchPrevMid = null;

  function refreshCtmScale() {
    const ctm = svgEl.getScreenCTM();
    ctmScale = { a: (ctm && ctm.a) || 1, d: (ctm && ctm.d) || 1 };
  }
  const activePoints = () => Array.from(pointers.values());
  const midpoint = (pts) => ({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
  const spread = (pts) => Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

  function beginPan(x, y) {
    panActive = true;
    panStartVb = { ...vb };
    panDownPoint = { x, y };
    refreshCtmScale();
    container.classList.add('panning');
  }

  container.addEventListener('pointerdown', (ev) => {
    // Mouse: only left-on-svg or middle/right initiates a drag.
    if (ev.pointerType === 'mouse') {
      const onSvg = (ev.target instanceof Element) && ev.target.closest && ev.target.closest('svg');
      const isLeft = ev.button === 0;
      const isMiddleOrRight = ev.button === 1 || ev.button === 2;
      if (!(isMiddleOrRight || (isLeft && onSvg))) return;
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { container.setPointerCapture(ev.pointerId); } catch (e) {}

    if (pointers.size === 1) {
      pinchHappened = false;
      movedDist = 0;
      tapStart = { x: ev.clientX, y: ev.clientY };
      beginPan(ev.clientX, ev.clientY);
    } else if (pointers.size === 2) {
      // Two fingers down: stop panning, start pinch.
      panActive = false;
      pinchHappened = true;
      container.classList.remove('panning');
      const pts = activePoints();
      pinchPrevDist = spread(pts);
      pinchPrevMid = midpoint(pts);
    }
  });

  container.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size >= 2) {
      // --- pinch zoom + two-finger pan ---
      const pts = activePoints();
      const curDist = spread(pts);
      const curMid = midpoint(pts);
      refreshCtmScale();
      // Translate by midpoint movement (two-finger drag).
      const mdx = (curMid.x - pinchPrevMid.x) / ctmScale.a;
      const mdy = (curMid.y - pinchPrevMid.y) / ctmScale.d;
      if (mdx || mdy) setViewBox(vb.x - mdx, vb.y - mdy, vb.w, vb.h);
      // Scale around the current midpoint.
      if (pinchPrevDist > 0) {
        zoomAround(clientToSvgPoint(curMid.x, curMid.y), curDist / pinchPrevDist);
      }
      pinchPrevDist = curDist;
      pinchPrevMid = curMid;
      return;
    }

    if (panActive) {
      movedDist = Math.hypot(ev.clientX - panDownPoint.x, ev.clientY - panDownPoint.y);
      const dx = (ev.clientX - panDownPoint.x) / ctmScale.a;
      const dy = (ev.clientY - panDownPoint.y) / ctmScale.d;
      setViewBox(panStartVb.x - dx, panStartVb.y - dy, panStartVb.w, panStartVb.h);
    }
  });

  function removePointer(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    try { container.releasePointerCapture(ev.pointerId); } catch (e) {}

    if (pointers.size === 1) {
      // Dropped from pinch back to one finger: resume pan from where it is,
      // resetting the baseline so the map doesn't jump.
      const p = activePoints()[0];
      beginPan(p.x, p.y);
    } else if (pointers.size === 0) {
      panActive = false;
      container.classList.remove('panning');
      // Treat as a tap only if it was a single, near-stationary touch.
      if (!pinchHappened && tapStart && movedDist < 6 && onTap) onTap(ev);
      tapStart = null;
    }
  }
  container.addEventListener('pointerup', removePointer);
  container.addEventListener('pointercancel', removePointer);

  container.addEventListener('dblclick', () => resetZoom());
}
