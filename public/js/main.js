import { loadDatasources, loadMapping } from './api/client.js';
import { createListSection } from './ui/lists.js';
import { setupSvgDropTargets } from './svg/dropTargets.js';
import { setupZoomPan } from './svg/viewport.js';
import { setupToolbar } from './ui/toolbar.js';
import { setInitialMapping, setAllNames } from './svg/mappingState.js';
import { assignShapeMapping } from './svg/mappingEditor.js';

const MAP_SVG_URL = '/images/mapa-municipal-de-les-illes-balears.svg';

async function loadLists() {
  const listsContainer = document.getElementById('lists');
  const data = await loadDatasources();
  setAllNames(Object.values(data).flat().sort((a, b) => a.localeCompare(b, 'ca')));
  Object.keys(data).forEach((k) => {
    listsContainer.appendChild(createListSection(k, data[k]));
  });
}

// Load the map SVG inline (so we can attach handlers), assign stable shape
// indexes, and apply the previously saved manual mapping.
async function loadMap() {
  const svgResp = await fetch(MAP_SVG_URL);
  const svgText = await svgResp.text();
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = svgText;
  const svg = mapContainer.querySelector('svg');
  if (!svg) {
    mapContainer.textContent = 'No se encontró el SVG del mapa.';
    return null;
  }

  const candidates = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
  const savedMapping = await loadMapping();
  setInitialMapping(savedMapping);
  candidates.forEach((el, idx) => {
    el.setAttribute('data-shape-index', String(idx));
    if (savedMapping && savedMapping[String(idx)]) {
      el.setAttribute('data-name', savedMapping[String(idx)]);
      el.classList.add('mapped');
    }
  });

  return { mapContainer, svg };
}

// In mapping mode, a tap (no drag) on a shape opens the mapping editor for it.
function onMapTap(mapContainer, ev) {
  if (!mapContainer.classList.contains('mapping-mode')) return;
  const target = document.elementFromPoint(ev.clientX, ev.clientY);
  const shapeEl = target && target.closest && target.closest('[data-shape-index]');
  if (shapeEl) assignShapeMapping(shapeEl);
}

async function init() {
  await loadLists();

  const map = await loadMap();
  if (!map) return;
  const { mapContainer, svg } = map;

  setupSvgDropTargets(svg);
  setupZoomPan(mapContainer, svg, (ev) => onMapTap(mapContainer, ev));
  setupToolbar();
}

window.addEventListener('DOMContentLoaded', init);
