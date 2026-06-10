function normalizeKey(s){
  if(!s) return '';
  // remove accents
  const t = s.trim().toLowerCase().normalize('NFD').replace(/[\u0000-\u036f]/g, '');
  // keep letters and numbers
  return t.replace(/[^a-z0-9]/g, '');
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
  items.forEach(it => {
    const li = document.createElement('li');
    li.className = 'item';
    li.textContent = it;
    li.draggable = true;
    li.dataset.name = it;
    li.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', it);
    });
    ul.appendChild(li);
  });
  return node;
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
      const dragged = e.dataTransfer.getData('text/plain');
      const placedName = dragged;
      const targetName = el.getAttribute('data-name') || nameAttr;
      const ok = normalizeKey(placedName) === normalizeKey(targetName);
      if(ok){
        // mark as matched
        el.classList.add('matched');
        // add a text label centered on the shape (if not already added)
        try{
          const svgRoot = (el.ownerSVGElement) ? el.ownerSVGElement : el.closest('svg');
          if(svgRoot && !el.getAttribute('data-labeled')){
            const bbox = el.getBBox();
            const text = document.createElementNS('http://www.w3.org/2000/svg','text');
            text.setAttribute('x', (bbox.x + bbox.width/2));
            text.setAttribute('y', (bbox.y + bbox.height/2));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.classList.add('svg-label');
            text.textContent = placedName;
            svgRoot.appendChild(text);
            el.setAttribute('data-labeled', 'true');
          }
        }catch(e){ console.warn('Could not place label on SVG element', e); }
        // style only the matched element (or its children if it's a group placeholder)
        try{
          const applyStyle = (node)=>{
            if(!(node instanceof Element)) return;
            node.style.fill = '#6fcd8a';
            node.style.stroke = '#006400';
            node.style.transition = 'fill 200ms ease, stroke 200ms ease';
          };
          applyStyle(el);
        }catch(e){}
        // find the draggable item and mark placed
        const lists = document.querySelectorAll('.item');
        for(const it of lists){
          if(it.dataset.name === placedName){
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

  // mapping-mode click handler: attach to indexed shapes so user can assign names
  const mappingTargets = svg.querySelectorAll('[data-shape-index]');
  mappingTargets.forEach(el => {
    el.addEventListener('click', async (ev)=>{
      const container = document.getElementById('map-container');
      if(!container.classList.contains('mapping-mode')) return;
      ev.stopPropagation(); ev.preventDefault();
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
    });
  });
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
  const initial = { ...vb };

  function setViewBox(x,y,w,h){
    vb = { x,y,w,h };
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }

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
  let isPanning = false; let panStart = null; let startVb = null;
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
    try{ container.setPointerCapture(ev.pointerId); }catch(e){}
  });
  container.addEventListener('pointermove', (ev)=>{
    if(!isPanning) return;
    const cur = clientToSvgPoint(ev.clientX, ev.clientY);
    const dx = cur.x - panStart.x; const dy = cur.y - panStart.y;
    setViewBox(startVb.x - dx, startVb.y - dy, startVb.w, startVb.h);
  });
  container.addEventListener('pointerup', (ev)=>{ if(isPanning){ isPanning=false; try{ container.releasePointerCapture(ev.pointerId); }catch(e){} }});
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
}

// small helper to send a custom event to zoom handlers
function dispatchZoom(action){
  const ev = new CustomEvent('app-zoom', { detail: action });
  window.dispatchEvent(ev);
}


