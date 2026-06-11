function normalizeKey(s){
  if(!s) return '';
  // remove accents
  const t = s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // keep letters and numbers
  return t.replace(/[^a-z0-9]/g, '');
}

// Each "isla" item maps to the set of municipalities that make up its
// territory in the SVG. Dropping the island name onto any of those
// municipalities counts as correct. "Eivissa" and "Formentera" are also the
// names of one of their own municipalities, so they need a group too -
// otherwise dropping the island "Eivissa" would only ever match the single
// "Eivissa" municipality shape instead of highlighting the whole island.
const ISLAND_GROUPS = {
  'Mallorca': ["Alaró","Alcúdia","Algaida","Andratx","Ariany","Artà","Banyalbufar","Binissalem","Búger","Bunyola","Calvià","Campanet","Campos","Capdepera","Consell","Costitx","Deià","Escorca","Esporles","Estellencs","Felanitx","Fornalutx","Inca","Lloret de Vistalegre","Lloseta","Llubí","Llucmajor","Manacor","Mancor de la Vall","Maria de la Salut","Marratxí","Montuïri","Muro","Palma","Petra","Pollença","Porreres","Sa Pobla","Puigpunyent","Ses Salines","Sant Joan","Sant Llorenç des Cardassar","Sencelles","Santa Eugènia","Santa Margalida","Santa Maria del Camí","Santanyí","Selva","Sineu","Sóller","Son Servera","Valldemossa","Vilafranca de Bonany"],
  'Menorca': ["Maó","Ciutadella de Menorca","Alaior","Es Castell","Es Mercadal","Es Migjorn Gran","Ferreries","Sant Lluís"],
  'Eivissa': ["Eivissa","Sant Antoni de Portmany","Sant Josep de sa Talaia","Sant Joan de Labritja","Santa Eulària des Riu"],
  'Formentera': ["Formentera"]
};

// `kind` distinguishes the "isla" item (e.g. the "Eivissa" entry from
// illes-pitiüses.txt) from the "municipi" item with the same name (the
// "Eivissa" entry from municipis-de-les-illes-balears.txt). Only "isla"
// drops use the island-wide group matching above.
function isMatch(placedName, targetName, kind){
  const group = (kind === 'isla') ? ISLAND_GROUPS[placedName] : null;
  if(group) return group.some(m => normalizeKey(m) === normalizeKey(targetName));
  return normalizeKey(placedName) === normalizeKey(targetName);
}

async function loadData(){
  const res = await fetch('/api/datasources');
  return await res.json();
}

function createListSection(title, items){
  const tpl = document.getElementById('list-template');
  const node = tpl.content.cloneNode(true);
  node.querySelector('.source-title').textContent = title.replace('.txt','');
  const ul = node.querySelector('.items');
  // items from the islands lists are "isla" entries; everything else is a "municipi"
  const kind = (title === 'illes-gimnèsies.txt' || title === 'illes-pitiüses.txt') ? 'isla' : 'municipi';
  items.forEach(it => {
    const li = document.createElement('li');
    li.className = 'item';
    li.textContent = it;
    li.draggable = true;
    li.dataset.name = it;
    li.dataset.kind = kind;
    li.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({ name: it, kind }));
    });
    ul.appendChild(li);
  });
  return node;
}

// Create and append a text label to the SVG at the given position.
function addSvgLabel(svgRoot, x, y, text, anchor, fontSize){
  const el = document.createElementNS('http://www.w3.org/2000/svg','text');
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('text-anchor', anchor || 'middle');
  el.setAttribute('dominant-baseline', 'middle');
  el.classList.add('svg-label');
  // inline style beats the stylesheet's font-size so callers can scale labels
  if(fontSize) el.style.fontSize = fontSize + 'px';
  el.textContent = text;
  svgRoot.appendChild(el);
  return el;
}

// Make sure the SVG has an arrowhead marker definition for leader lines.
function ensureArrowMarker(svg){
  if(svg.querySelector('#leader-arrow')) return;
  let defs = svg.querySelector('defs');
  if(!defs){
    defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  const marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
  marker.setAttribute('id', 'leader-arrow');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
  path.setAttribute('fill', '#555');
  marker.appendChild(path);
  defs.appendChild(marker);
}

// Map-style label layout. Each point is {name, cx, cy, w, h, isTitle}.
// Labels are grouped by island. A label that fits inside its own shape is
// drawn centered there with no leader line; labels that don't fit are pushed
// out to the left/right edge of their island, stacked without overlap and
// connected with a short arrow. Island titles go above the island. The SVG
// viewBox is expanded to fit everything.
function placeLabelsAround(svg, points){
  if(points.length === 0) return;
  ensureArrowMarker(svg);

  const NORMAL = 9;   // font size (viewBox units) for municipality labels
  const TITLE = 15;   // font size for island titles
  const CHAR_W = 0.55; // approx glyph width as a fraction of font size

  const vb0 = svg.viewBox.baseVal;
  let exMinX = vb0.x, exMinY = vb0.y, exMaxX = vb0.x + vb0.width, exMaxY = vb0.y + vb0.height;
  const include = (x, y)=>{
    exMinX = Math.min(exMinX, x); exMinY = Math.min(exMinY, y);
    exMaxX = Math.max(exMaxX, x); exMaxY = Math.max(exMaxY, y);
  };
  const labelWidth = (name, size)=> name.length * CHAR_W * size;

  // group points by the island their shape belongs to (small islets each get
  // their own singleton group keyed by name)
  function islandOf(name){
    const k = normalizeKey(name);
    for(const isl in ISLAND_GROUPS){
      if(normalizeKey(isl) === k) return isl;
      if(ISLAND_GROUPS[isl].some(m=> normalizeKey(m) === k)) return isl;
    }
    return '__' + k;
  }
  const groups = {};
  points.forEach(p=>{ const g = islandOf(p.name); (groups[g] = groups[g] || []).push(p); });

  Object.values(groups).forEach(list=>{
    // island extent from its member shapes
    let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
    list.forEach(p=>{
      minx = Math.min(minx, p.cx - p.w/2); maxx = Math.max(maxx, p.cx + p.w/2);
      miny = Math.min(miny, p.cy - p.h/2); maxy = Math.max(maxy, p.cy + p.h/2);
    });
    const cX = (minx + maxx)/2;

    const inside = [], titles = [], sides = [];
    list.forEach(p=>{
      if(p.isTitle){ titles.push(p); return; }
      const fits = labelWidth(p.name, NORMAL) <= p.w * 0.95 && NORMAL <= p.h * 0.95;
      (fits ? inside : sides).push(p);
    });

    // labels that fit: centered inside the shape, no leader line
    inside.forEach(p=>{
      addSvgLabel(svg, p.cx, p.cy, p.name, 'middle', NORMAL);
      const hw = labelWidth(p.name, NORMAL)/2;
      include(p.cx - hw, p.cy); include(p.cx + hw, p.cy);
    });

    // labels that don't fit: out to the nearest side, decluttered vertically
    const gap = NORMAL * 1.3;
    const leftList  = sides.filter(p=> p.cx <  cX).sort((a,b)=> a.cy - b.cy);
    const rightList = sides.filter(p=> p.cx >= cX).sort((a,b)=> a.cy - b.cy);

    function layoutSide(arr, laneX, anchor){
      if(arr.length === 0) return;
      // push down to remove overlaps, then recenter the column on the island
      let prev = -Infinity;
      arr.forEach(p=>{ let y = p.cy; if(y < prev + gap) y = prev + gap; prev = y; p._y = y; });
      const curMid = (arr[0]._y + arr[arr.length-1]._y)/2;
      const shift = (miny + maxy)/2 - curMid;
      arr.forEach(p=> p._y += shift);

      arr.forEach(p=>{
        addSvgLabel(svg, laneX, p._y, p.name, anchor, NORMAL);
        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1', p.cx); line.setAttribute('y1', p.cy);
        line.setAttribute('x2', laneX + (anchor === 'end' ? 3 : -3));
        line.setAttribute('y2', p._y);
        line.classList.add('leader-line');
        line.setAttribute('marker-end', 'url(#leader-arrow)');
        svg.appendChild(line);
        const tw = labelWidth(p.name, NORMAL);
        if(anchor === 'end') include(laneX - tw, p._y); else include(laneX + tw, p._y);
      });
    }
    layoutSide(leftList,  minx - 8, 'end');
    layoutSide(rightList, maxx + 8, 'start');

    // island title above the island
    titles.forEach(p=>{
      const ty = miny - TITLE;
      addSvgLabel(svg, cX, ty, p.name, 'middle', TITLE);
      include(cX, ty - TITLE);
    });
  });

  const m = 6;
  const newX = exMinX - m, newY = exMinY - m;
  const newW = (exMaxX - exMinX) + 2*m, newH = (exMaxY - exMinY) + 2*m;
  if(window.__updateViewBox) window.__updateViewBox(newX, newY, newW, newH);
  else svg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
}

function flashNotification(text){
  const n = document.createElement('div');
  n.className = 'notification';
  n.textContent = text;
  document.body.appendChild(n);
  setTimeout(()=>n.remove(), 1500);
}

function setupSvgDropTargets(svg){
  // drop-target shapes
  const shapeTargets = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
  shapeTargets.forEach(el=>{
    const nameAttr = el.getAttribute('data-name') || el.id || el.getAttribute('name') || el.getAttribute('inkscape:label');
    if(!nameAttr) return;
    el.classList.add('svg-drop-target');
    el.style.cursor = 'pointer';
    el.addEventListener('dragover', (e)=>{ e.preventDefault(); });
    el.addEventListener('drop', (e)=>{
      e.preventDefault();
      let placedName, kind;
      try{
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        placedName = data.name; kind = data.kind;
      }catch(err){
        placedName = e.dataTransfer.getData('text/plain'); kind = null;
      }
      const targetName = el.getAttribute('data-name') || nameAttr;
      const ok = isMatch(placedName, targetName, kind);
      if(ok){
        // if the dropped item is an island whose territory is split across
        // several municipalities, highlight the outline of every shape of
        // that island instead of filling just the one the user dropped on
        const group = (kind === 'isla') ? ISLAND_GROUPS[placedName] : null;
        let matchedElements;
        if(group){
          const groupKeys = new Set(group.map(normalizeKey));
          matchedElements = Array.from(svg.querySelectorAll('[data-name]')).filter(node=> groupKeys.has(normalizeKey(node.getAttribute('data-name'))));
        } else {
          matchedElements = [el];
        }

        // style every matched shape
        matchedElements.forEach(node=>{
          node.classList.add('matched');
          if(group){
            node.classList.add('island-outline');
          } else {
            node.style.fill = '#6fcd8a';
            node.style.stroke = '#006400';
            node.style.transition = 'fill 200ms ease, stroke 200ms ease';
          }
        });

        // add a single text label for the matched area (if not already added)
        try{
          const svgRoot = (el.ownerSVGElement) ? el.ownerSVGElement : el.closest('svg');
          window.__LABELED_GROUPS = window.__LABELED_GROUPS || new Set();
          const groupKey = group ? normalizeKey(placedName) : null;
          const alreadyLabeled = group ? window.__LABELED_GROUPS.has(groupKey) : el.getAttribute('data-labeled');
          if(svgRoot && !alreadyLabeled){
            let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
            matchedElements.forEach(node=>{
              const b = node.getBBox();
              minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
              maxx = Math.max(maxx, b.x + b.width); maxy = Math.max(maxy, b.y + b.height);
            });
            const cx = (minx + maxx)/2;
            let ly = (miny + maxy)/2;
            if(group){
              // place the label outside the island's bounding box: above it,
              // unless that would fall off the top of the map, then below
              const margin = 4;
              const vb = svg.viewBox && svg.viewBox.baseVal;
              const vbMinY = vb ? vb.y : 0;
              ly = (miny - margin > vbMinY) ? (miny - margin) : (maxy + margin);
            }
            addSvgLabel(svgRoot, cx, ly, placedName);
            if(group) window.__LABELED_GROUPS.add(groupKey);
            else el.setAttribute('data-labeled', 'true');
          }
        }catch(e){ console.warn('Could not place label on SVG element', e); }
        // find the draggable item and mark placed
        const lists = document.querySelectorAll('.item');
        for(const it of lists){
          if(it.dataset.name === placedName && it.dataset.kind === kind){
            it.classList.add('placed');
            it.draggable = false;
            break;
          }
        }
        const cur = document.getElementById('correct');
        cur.textContent = parseInt(cur.textContent||'0') + 1;
        flashNotification('¡Correcto!');
      } else {
        el.classList.add('incorrect');
        setTimeout(()=>el.classList.remove('incorrect'), 600);
        flashNotification('Incorrecto');
      }
    });
  });
}

// Reveal the full solution: highlight every mapped shape with its name,
// plus an extra outside label for islands whose territory spans several
// municipalities (Mallorca, Menorca, Eivissa).
function showSolution(svg){
  window.__LABELED_GROUPS = window.__LABELED_GROUPS || new Set();
  const mappedShapes = Array.from(svg.querySelectorAll('[data-name]'));
  const points = [];

  mappedShapes.forEach(el=>{
    el.classList.add('matched');
    el.style.fill = '#6fcd8a';
    el.style.stroke = '#006400';
    el.style.transition = 'fill 200ms ease, stroke 200ms ease';
    if(!el.getAttribute('data-labeled')){
      const b = el.getBBox();
      points.push({ name: el.getAttribute('data-name'), cx: b.x + b.width/2, cy: b.y + b.height/2, w: b.width, h: b.height });
      el.setAttribute('data-labeled', 'true');
    }
  });

  // island-wide titles (Mallorca, Menorca, Eivissa span several shapes)
  Object.keys(ISLAND_GROUPS).forEach(islandName=>{
    const groupKey = normalizeKey(islandName);
    if(window.__LABELED_GROUPS.has(groupKey)) return;
    const groupKeys = new Set(ISLAND_GROUPS[islandName].map(normalizeKey));
    const elements = mappedShapes.filter(el=> groupKeys.has(normalizeKey(el.getAttribute('data-name'))));
    if(elements.length <= 1) return; // single-shape islands already have their own label
    let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
    elements.forEach(node=>{
      const b = node.getBBox();
      minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
      maxx = Math.max(maxx, b.x + b.width); maxy = Math.max(maxy, b.y + b.height);
    });
    points.push({ name: islandName, cx: (minx + maxx)/2, cy: (miny + maxy)/2, w: maxx - minx, h: maxy - miny, isTitle: true });
    window.__LABELED_GROUPS.add(groupKey);
  });

  placeLabelsAround(svg, points);

  document.querySelectorAll('.item').forEach(it=>{
    it.classList.add('placed');
    it.draggable = false;
  });
  const cur = document.getElementById('correct');
  cur.textContent = document.querySelectorAll('.item').length;
  flashNotification('Solución mostrada');
}

// Open the mapping modal for a single shape and apply the chosen assignment.
// Called from the pointer-handling code in setupZoomPan when in mapping mode.
async function assignShapeMapping(el){
  const idx = el.getAttribute('data-shape-index');
  const current = (window.__SVG_MAPPING && window.__SVG_MAPPING[idx]) || el.getAttribute('data-name') || '';
  const answer = await openMappingModal(current);
  if(answer === null) return; // cancelled
  window.__SVG_MAPPING = window.__SVG_MAPPING || {};
  if(answer === ''){
    delete window.__SVG_MAPPING[idx];
    el.removeAttribute('data-name');
    el.classList.remove('mapped');
    flashNotification('Asignación eliminada');
    return;
  }
  window.__SVG_MAPPING[idx] = answer;
  el.setAttribute('data-name', answer);
  el.classList.add('mapped');
  flashNotification('Asignado: '+answer);
}

// Populate and show the mapping modal, resolving with the chosen name,
// '' if the user cleared the assignment, or null if cancelled.
function openMappingModal(currentValue){
  return new Promise((resolve)=>{
    const modal = document.getElementById('mapping-modal');
    const sel = document.getElementById('mapping-select');
    const confirmBtn = document.getElementById('mapping-confirm');
    const cancelBtn = document.getElementById('mapping-cancel');
    const clearBtn = document.getElementById('mapping-clear');

    sel.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- sin asignar --';
    sel.appendChild(emptyOpt);
    (window.__ALL_NAMES || []).forEach(name=>{
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if(name === currentValue) opt.selected = true;
      sel.appendChild(opt);
    });

    modal.classList.remove('hidden');

    function cleanup(){
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      clearBtn.removeEventListener('click', onClear);
    }
    function onConfirm(){ const v = sel.value; cleanup(); resolve(v); }
    function onCancel(){ cleanup(); resolve(null); }
    function onClear(){ cleanup(); resolve(''); }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    clearBtn.addEventListener('click', onClear);
  });
}

async function init(){
  const listsContainer = document.getElementById('lists');
  const data = await loadData();
  window.__ALL_NAMES = Object.values(data).flat().sort((a,b)=> a.localeCompare(b, 'ca'));

  Object.keys(data).forEach(k=>{
    const node = createListSection(k, data[k]);
    listsContainer.appendChild(node);
  });

  // load SVG and insert inline so we can attach handlers
  const svgResp = await fetch('/images/mapa-municipal-de-les-illes-balears.svg');
  const svgText = await svgResp.text();
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = svgText;
  const svg = mapContainer.querySelector('svg');
  if(!svg){
    mapContainer.textContent = 'No se encontró el SVG del mapa.';
    return;
  }

  // assign stable indexes to candidate shape elements (exclude groups)
  const candidates = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
  const mappingResp = await fetch('/api/mapping');
  const savedMapping = await mappingResp.json();
  candidates.forEach((el, idx)=>{
    el.setAttribute('data-shape-index', String(idx));
    if(savedMapping && savedMapping[String(idx)]){
      el.setAttribute('data-name', savedMapping[String(idx)]);
      el.classList.add('mapped');
    }
  });

  setupSvgDropTargets(svg);
  setupZoomPan(mapContainer, svg);
  setupToolbar();
  // expose mapping state
  window.__SVG_MAPPING = savedMapping || {};
}

// Use SVG viewBox for crisp zooming and panning (vector-scaled)
function setupZoomPan(container, svg){
  // read or initialize viewBox
  const vbAttr = svg.getAttribute('viewBox');
  let vb = { x:0, y:0, w: svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width : svg.clientWidth, h: svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height ? svg.viewBox.baseVal.height : svg.clientHeight };
  if(vbAttr){
    const parts = vbAttr.split(/\s+/).map(Number);
    if(parts.length === 4) vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  } else {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  const minScale = 0.2, maxScale = 8; // scale relative to initial
  let initial = { ...vb };

  function setViewBox(x,y,w,h){
    vb = { x,y,w,h };
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }

  // Allow other code (e.g. the solution overlay) to expand the canvas and
  // make that the new "reset" viewBox.
  window.__updateViewBox = function(x,y,w,h){
    initial = { x, y, w, h };
    setViewBox(x,y,w,h);
  };

  function clientToSvgPoint(clientX, clientY){
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if(!ctm) return { x: clientX, y: clientY };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function clampScale(scale){ return Math.max(minScale, Math.min(maxScale, scale)); }

  // handle zoom requests (buttons)
  window.addEventListener('app-zoom', (e)=>{
    const d = e.detail;
    if(d === 'reset'){
      setViewBox(initial.x, initial.y, initial.w, initial.h); return;
    }
    const factor = (typeof d === 'number') ? d : 1.2;
    // center on container center
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const svgP = clientToSvgPoint(cx, cy);
    const curScale = initial.w / vb.w;
    const newScale = clampScale(curScale * factor);
    const newW = initial.w / newScale;
    const newH = initial.h / newScale;
    const newX = svgP.x - (svgP.x - vb.x) * (newW / vb.w);
    const newY = svgP.y - (svgP.y - vb.y) * (newH / vb.h);
    setViewBox(newX, newY, newW, newH);
  });

  // wheel zoom centered on cursor
  container.addEventListener('wheel', (ev)=>{
    ev.preventDefault();
    const rect = container.getBoundingClientRect();
    const clientX = ev.clientX; const clientY = ev.clientY;
    const svgP = clientToSvgPoint(clientX, clientY);
    const delta = ev.deltaY > 0 ? 1/1.12 : 1.12;
    const curScale = initial.w / vb.w;
    const newScale = clampScale(curScale * delta);
    const newW = initial.w / newScale;
    const newH = initial.h / newScale;
    const newX = svgP.x - (svgP.x - vb.x) * (newW / vb.w);
    const newY = svgP.y - (svgP.y - vb.y) * (newH / vb.h);
    setViewBox(newX, newY, newW, newH);
  }, { passive: false });

  // panning via pointer drag (left-button) or middle/right
  let isPanning = false; let panStart = null; let startVb = null; let downPoint = null;
  container.addEventListener('pointerdown', (ev)=>{
    const clickedOnSvg = (ev.target instanceof Element) && (ev.target.closest && ev.target.closest('svg'));
    if(ev.pointerType === 'mouse'){
      const isLeft = ev.button === 0;
      const isMiddleOrRight = ev.button === 1 || ev.button === 2;
      if(!(isMiddleOrRight || (isLeft && clickedOnSvg))) return;
    }
    isPanning = true;
    panStart = clientToSvgPoint(ev.clientX, ev.clientY);
    startVb = { ...vb };
    downPoint = { x: ev.clientX, y: ev.clientY };
    try{ container.setPointerCapture(ev.pointerId); }catch(e){}
  });
  container.addEventListener('pointermove', (ev)=>{
    if(!isPanning) return;
    const cur = clientToSvgPoint(ev.clientX, ev.clientY);
    const dx = cur.x - panStart.x; const dy = cur.y - panStart.y;
    setViewBox(startVb.x - dx, startVb.y - dy, startVb.w, startVb.h);
  });
  container.addEventListener('pointerup', (ev)=>{
    if(!isPanning) return;
    isPanning = false;
    try{ container.releasePointerCapture(ev.pointerId); }catch(e){}
    // pointer capture re-targets pointer events to the container, so a plain
    // 'click' on the SVG shape underneath never fires. Detect a tap (no
    // meaningful movement) here and resolve the shape under the pointer.
    const moved = Math.hypot(ev.clientX - downPoint.x, ev.clientY - downPoint.y);
    if(moved < 4 && container.classList.contains('mapping-mode')){
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const shapeEl = target && target.closest && target.closest('[data-shape-index]');
      if(shapeEl) assignShapeMapping(shapeEl);
    }
  });
  container.addEventListener('pointercancel', ()=>{ isPanning = false; });

  // touch pinch handling
  let ongoingTouches = [];
  function getDistance(t1,t2){ const dx = t2.clientX - t1.clientX; const dy = t2.clientY - t1.clientY; return Math.hypot(dx,dy); }
  container.addEventListener('touchstart', (ev)=>{
    if(ev.touches.length === 2){ ongoingTouches = [ev.touches[0], ev.touches[1]]; }
  }, { passive: false });
  container.addEventListener('touchmove', (ev)=>{
    if(ev.touches.length === 2 && ongoingTouches.length === 2){
      ev.preventDefault();
      const t1 = ev.touches[0], t2 = ev.touches[1];
      const prevDist = getDistance(ongoingTouches[0], ongoingTouches[1]);
      const newDist = getDistance(t1,t2);
      const factor = newDist / prevDist;
      const rect = container.getBoundingClientRect();
      const cx = (t1.clientX + t2.clientX)/2; const cy = (t1.clientY + t2.clientY)/2;
      const svgP = clientToSvgPoint(cx, cy);
      const curScale = initial.w / vb.w;
      const newScale = clampScale(curScale * factor);
      const newW = initial.w / newScale; const newH = initial.h / newScale;
      const newX = svgP.x - (svgP.x - vb.x) * (newW / vb.w);
      const newY = svgP.y - (svgP.y - vb.y) * (newH / vb.h);
      setViewBox(newX, newY, newW, newH);
      ongoingTouches = [t1, t2];
    }
  }, { passive: false });
  container.addEventListener('touchend', (ev)=>{ ongoingTouches = []; });
  container.addEventListener('touchcancel', (ev)=>{ ongoingTouches = []; });

  // reset on double click
  container.addEventListener('dblclick', (ev)=>{ setViewBox(initial.x, initial.y, initial.w, initial.h); });
}

window.addEventListener('DOMContentLoaded', init);

function setupToolbar(){
  const btnIn = document.getElementById('zoom-in');
  const btnOut = document.getElementById('zoom-out');
  const btnReset = document.getElementById('zoom-reset');
  const toggleMobile = document.getElementById('toggle-lists-mobile');
  btnIn && btnIn.addEventListener('click', ()=> dispatchZoom(1.2));
  btnOut && btnOut.addEventListener('click', ()=> dispatchZoom(1/1.2));
  btnReset && btnReset.addEventListener('click', ()=> dispatchZoom('reset'));
  toggleMobile && toggleMobile.addEventListener('click', ()=>{
    const lists = document.getElementById('lists');
    lists.style.display = (lists.style.display === 'none') ? '' : 'none';
  });
  const editBtn = document.getElementById('edit-mapping');
  const saveBtn = document.getElementById('save-mapping');
  let mappingMode = false;
  editBtn && editBtn.addEventListener('click', ()=>{
    mappingMode = !mappingMode;
    editBtn.textContent = mappingMode ? '🗺️ Mapeo (ON)' : '🗺️ Mapeo';
    document.getElementById('map-container').classList.toggle('mapping-mode', mappingMode);
    // when entering mapping mode, highlight candidates
    const svg = document.querySelector('#map-container svg');
    if(svg){
      svg.querySelectorAll('[data-shape-index]').forEach(el=>{
        el.classList.toggle('mapping-highlight', mappingMode);
      });
    }
  });
  saveBtn && saveBtn.addEventListener('click', async ()=>{
    const mapping = window.__SVG_MAPPING || {};
    const res = await fetch('/api/mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(mapping) });
    if(res.ok) flashNotification('Mapeo guardado'); else flashNotification('Error al guardar');
  });

  const solutionBtn = document.getElementById('show-solution');
  solutionBtn && solutionBtn.addEventListener('click', ()=>{
    const svg = document.querySelector('#map-container svg');
    if(!svg) return;
    showSolution(svg);
    solutionBtn.disabled = true;
  });
}

// small helper to send a custom event to zoom handlers
function dispatchZoom(action){
  const ev = new CustomEvent('app-zoom', { detail: action });
  window.dispatchEvent(ev);
}


