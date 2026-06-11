import { ITEM_KIND } from '../game/matching.js';

export function createListSection(title, items) {
  const tpl = document.getElementById('list-template');
  const node = tpl.content.cloneNode(true);
  node.querySelector('.source-title').textContent = title.replace('.txt', '');
  const ul = node.querySelector('.items');
  // items from the islands lists are "isla" entries; everything else is a "municipi"
  const kind = (title === 'illes-gimnèsies.txt' || title === 'illes-pitiüses.txt') ? ITEM_KIND.ISLAND : ITEM_KIND.MUNICIPALITY;
  items.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.textContent = it;
    li.draggable = true;
    li.dataset.name = it;
    li.dataset.kind = kind;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ name: it, kind }));
    });
    ul.appendChild(li);
  });
  return node;
}

// Mark the draggable item matching `name`/`kind` as placed (used after a correct drop).
export function markItemPlaced(name, kind) {
  const items = document.querySelectorAll('.item');
  for (const it of items) {
    if (it.dataset.name === name && it.dataset.kind === kind) {
      it.classList.add('placed');
      it.draggable = false;
      break;
    }
  }
}
