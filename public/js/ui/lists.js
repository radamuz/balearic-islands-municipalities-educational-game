import { ITEM_KIND } from '../game/matching.js';
import { normalizeKey } from '../utils/normalize.js';

const FRIENDLY_TITLES = {
  'illes-gimnèsies.txt': 'Illes Gimnèsies',
  'illes-pitiüses.txt': 'Illes Pitiüses',
  'municipis-de-les-illes-balears.txt': 'Municipis',
};

export function createListSection(title, items) {
  const tpl = document.getElementById('list-template');
  const node = tpl.content.cloneNode(true);
  const section = node.querySelector('.source');
  const kind = (title === 'illes-gimnèsies.txt' || title === 'illes-pitiüses.txt')
    ? ITEM_KIND.ISLAND : ITEM_KIND.MUNICIPALITY;
  section.dataset.kind = kind;

  const titleEl = node.querySelector('.source-title');
  titleEl.textContent = FRIENDLY_TITLES[title] || title.replace('.txt', '');
  const count = document.createElement('span');
  count.className = 'source-count';
  count.textContent = items.length;
  titleEl.appendChild(count);

  const ul = node.querySelector('.items');
  // Orden alfabético (insensible a acentos según la ortografía catalana).
  const sorted = [...items].sort((a, b) => a.localeCompare(b, 'ca'));
  sorted.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'item' + (kind === ITEM_KIND.ISLAND ? ' item-island' : '');
    li.textContent = it;
    li.draggable = true;
    li.dataset.name = it;
    li.dataset.kind = kind;
    li.dataset.key = normalizeKey(it);
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ name: it, kind }));
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
      // Cerrar el panel en móvil cuando se arrastra
      const panel = document.getElementById('lists-panel');
      if (panel) panel.classList.remove('open');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    // Click para seleccionar: alternativa a arrastrar (click nombre + click mapa).
    li.addEventListener('click', () => selectItem(li, it, kind));
    ul.appendChild(li);
  });
  return node;
}

// --- selección por click (modo "click nombre + click lugar") ---------------
let selected = null; // { name, kind, el }

function selectItem(li, name, kind) {
  if (li.classList.contains('placed')) return;
  if (selected && selected.el === li) { clearSelection(); return; }
  clearSelection();
  selected = { name, kind, el: li };
  li.classList.add('selected');
  // Cerrar el panel en móvil para poder tocar el mapa.
  const panel = document.getElementById('lists-panel');
  if (panel) panel.classList.remove('open');
}

export function getSelectedItem() {
  return selected ? { name: selected.name, kind: selected.kind } : null;
}

export function clearSelection() {
  if (selected && selected.el) selected.el.classList.remove('selected');
  selected = null;
}

// Mark the draggable item matching `name`/`kind` as placed (after a correct drop).
export function markItemPlaced(name, kind) {
  const key = normalizeKey(name);
  for (const it of document.querySelectorAll('.item')) {
    if (it.dataset.key === key && it.dataset.kind === kind) {
      it.classList.add('placed');
      it.draggable = false;
      if (selected && selected.el === it) clearSelection();
      break;
    }
  }
}

// Hide items whose name doesn't contain the query (accent-insensitive).
export function filterLists(query) {
  const q = normalizeKey(query);
  document.querySelectorAll('.item').forEach((it) => {
    it.classList.toggle('filtered-out', q !== '' && !it.dataset.key.includes(q));
  });
}
