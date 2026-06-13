import { loadDatasources, loadMapping } from './api/client.js';
import { createListSection, filterLists } from './ui/lists.js';
import { setupSvgDropTargets } from './svg/dropTargets.js';
import { setupZoomPan } from './svg/viewport.js';
import { setupLabelLayer } from './svg/labelLayer.js';
import { setupToolbar } from './ui/toolbar.js';
import { setupHud } from './ui/hud.js';
import { showStart, showFinish } from './ui/overlays.js';
import { configure, start, onFinish } from './game/gameState.js';
import { setInitialMapping, setAllNames } from './svg/mappingState.js';
import { assignShapeMapping } from './svg/mappingEditor.js';

const MAP_SVG_URL = '/images/mapa-municipal-de-les-illes-balears.svg';

async function loadLists() {
  const listsContainer = document.getElementById('lists');
  const data = await loadDatasources();
  const flat = Object.values(data).flat();
  setAllNames([...flat].sort((a, b) => a.localeCompare(b, 'ca')));
  // islands first so they read as the headline groups
  const order = ['illes-gimnèsies.txt', 'illes-pitiüses.txt', 'municipis-de-les-illes-balears.txt'];
  Object.keys(data).sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach((k) => {
    listsContainer.appendChild(createListSection(k, data[k]));
  });
  return flat.length;
}

async function loadMap() {
  const svgText = await (await fetch(MAP_SVG_URL)).text();
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = svgText;
  const svg = mapContainer.querySelector('svg');
  if (!svg) { mapContainer.textContent = 'No es va trobar el SVG del mapa.'; return null; }
  svg.removeAttribute('width');
  svg.removeAttribute('height');

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

function onMapTap(mapContainer, ev) {
  if (!mapContainer.classList.contains('mapping-mode')) return;
  const target = document.elementFromPoint(ev.clientX, ev.clientY);
  const shapeEl = target && target.closest && target.closest('[data-shape-index]');
  if (shapeEl) assignShapeMapping(shapeEl);
}

async function init() {
  const total = await loadLists();
  const map = await loadMap();
  if (!map) return;
  const { mapContainer, svg } = map;

  setupZoomPan(mapContainer, svg, (ev) => onMapTap(mapContainer, ev));
  setupLabelLayer(svg);
  setupSvgDropTargets(svg);
  setupToolbar();
  setupHud();

  const search = document.getElementById('list-search');
  if (search) search.addEventListener('input', (e) => filterLists(e.target.value));

  configure(total);
  onFinish((snapshot) => showFinish(snapshot));
  showStart(() => start());
}

window.addEventListener('DOMContentLoaded', init);
