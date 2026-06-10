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
  // find all elements that can be drop targets (have id or data-name)
  const candidates = svg.querySelectorAll('*');
  candidates.forEach(el=>{
    // check data-name first (from saved mapping), then id/name/inkscape label
    const nameAttr = el.getAttribute('data-name') || el.id || el.getAttribute('name') || el.getAttribute('inkscape:label');
    if(!nameAttr) return;
    // make it visually pointer
    el.classList.add('svg-drop-target');
    el.style.cursor = 'pointer';
    el.addEventListener('dragover', (e)=>{ e.preventDefault(); });
    el.addEventListener('drop', (e)=>{
      e.preventDefault();
      const dragged = e.dataTransfer.getData('text/plain');
      const placedName = dragged;
      const targetName = nameAttr;
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
        }catch(e){
          // ignore if getBBox or SVG DOM isn't available
          console.warn('Could not place label on SVG element', e);
        }
        // style the matched element via inline styles to ensure visibility
        try{
          const applyStyle = (node)=>{
            if(!(node instanceof Element)) return;
            node.style.fill = '#6fcd8a';
            node.style.stroke = '#006400';
            node.style.strokeWidth = (node.style.strokeWidth || 1) + 'px';
            node.style.transition = 'fill 200ms ease, stroke 200ms ease';
          };
          if(el.tagName && el.tagName.toLowerCase() === 'g'){
            // apply to child shapes
            Array.from(el.querySelectorAll('path, polygon, rect, circle, ellipse')).forEach(applyStyle);
          }
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

    // mapping-mode click handler: if mapping active, clicking assigns a name
    el.addEventListener('click', (ev)=>{
      const container = document.getElementById('map-container');
      if(!container.classList.contains('mapping-mode')) return;
      ev.stopPropagation(); ev.preventDefault();
      const idx = el.getAttribute('data-shape-index');
      const current = (window.__SVG_MAPPING && window.__SVG_MAPPING[idx]) || el.getAttribute('data-name') || '';
      const answer = window.prompt('Asignar municipio a esta área (index '+idx+')', current || '');
      if(answer !== null){
        // store mapping
        window.__SVG_MAPPING = window.__SVG_MAPPING || {};
        window.__SVG_MAPPING[idx] = answer.trim();
        el.setAttribute('data-name', answer.trim());
        el.classList.add('mapped');
        flashNotification('Asignado: '+answer.trim());
      }
    });
  });
}

async function init(){
  const listsContainer = document.getElementById('lists');
  const data = await loadData();
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

  // assign stable indexes to candidate shapes and load mapping
  const candidates = svg.querySelectorAll('path, polygon, rect, circle, ellipse, g');
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

function setupZoomPan(container, svg){
  // Use CSS transforms on the SVG element for simple zoom/pan behavior
  let scale = 1;
  const minScale = 0.5, maxScale = 4;
  let panX = 0, panY = 0;
  let isPanning = false; let panStart = null; let panLast = {x:0,y:0};

  svg.style.transformOrigin = '0 0';
  svg.style.willChange = 'transform';

  function applyTransform(){
    svg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  // respond to global zoom requests
  window.addEventListener('app-zoom', (e)=>{
    const d = e.detail;
    if(d === 'reset'){
      scale = 1; panX = 0; panY = 0; applyTransform(); return;
    }
    const factor = (typeof d === 'number') ? d : 1.2;
    // zoom towards center of container
    const rect = container.getBoundingClientRect();
    const cx = rect.width/2;
    const cy = rect.height/2;
    const newScale = clamp(scale * factor, minScale, maxScale);
    // adjust pan so center stays put
    panX = (panX - cx) * (newScale/scale) + cx;
    panY = (panY - cy) * (newScale/scale) + cy;
    scale = newScale;
    applyTransform();
  });

  // wheel zoom centered on cursor
  container.addEventListener('wheel', (ev)=>{
    ev.preventDefault();
    const rect = container.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const delta = ev.deltaY > 0 ? 1/1.12 : 1.12;
    const newScale = clamp(scale * delta, minScale, maxScale);
    panX = (panX - cx) * (newScale/scale) + cx;
    panY = (panY - cy) * (newScale/scale) + cy;
    scale = newScale;
    applyTransform();
  }, { passive: false });

  // mouse panning: middle/right button OR left-button when clicking the SVG/map area
  container.addEventListener('pointerdown', (ev)=>{
    // determine if the pointerdown happened on the SVG (or its descendants)
    const clickedOnSvg = (ev.target instanceof Element) && (ev.target.closest && ev.target.closest('svg'));
    // allow middle(1)/right(2) always; allow left(0) only when clicking on the svg area
    if(ev.pointerType === 'mouse'){
      const isLeft = ev.button === 0;
      const isMiddleOrRight = ev.button === 1 || ev.button === 2;
      if(!(isMiddleOrRight || (isLeft && clickedOnSvg))) return;
    }
    isPanning = true;
    panStart = { x: ev.clientX, y: ev.clientY };
    panLast = { x: panX, y: panY };
    try{ container.setPointerCapture(ev.pointerId); }catch(e){}
  });
  container.addEventListener('pointermove', (ev)=>{
    if(!isPanning) return;
    const dx = ev.clientX - panStart.x;
    const dy = ev.clientY - panStart.y;
    panX = panLast.x + dx;
    panY = panLast.y + dy;
    applyTransform();
  });
  container.addEventListener('pointerup', (ev)=>{
    if(isPanning){ isPanning = false; container.releasePointerCapture(ev.pointerId); }
  });
  container.addEventListener('pointercancel', ()=>{ isPanning = false; });

  // touch pinch handling
  let ongoingTouches = [];
  function getDistance(t1,t2){ const dx = t2.clientX - t1.clientX; const dy = t2.clientY - t1.clientY; return Math.hypot(dx,dy); }
  container.addEventListener('touchstart', (ev)=>{
    if(ev.touches.length === 2){
      ongoingTouches = [ev.touches[0], ev.touches[1]];
    }
  }, { passive: false });
  container.addEventListener('touchmove', (ev)=>{
    if(ev.touches.length === 2 && ongoingTouches.length === 2){
      ev.preventDefault();
      const t1 = ev.touches[0], t2 = ev.touches[1];
      const prevDist = getDistance(ongoingTouches[0], ongoingTouches[1]);
      const newDist = getDistance(t1,t2);
      const factor = newDist / prevDist;
      const rect = container.getBoundingClientRect();
      const cx = (t1.clientX + t2.clientX)/2 - rect.left;
      const cy = (t1.clientY + t2.clientY)/2 - rect.top;
      const newScale = clamp(scale * factor, minScale, maxScale);
      panX = (panX - cx) * (newScale/scale) + cx;
      panY = (panY - cy) * (newScale/scale) + cy;
      scale = newScale;
      applyTransform();
      ongoingTouches = [t1, t2];
    }
  }, { passive: false });
  container.addEventListener('touchend', (ev)=>{ ongoingTouches = []; });
  container.addEventListener('touchcancel', (ev)=>{ ongoingTouches = []; });

  // reset on double click
  container.addEventListener('dblclick', (ev)=>{
    scale = 1; panX = 0; panY = 0; applyTransform();
  });
}
