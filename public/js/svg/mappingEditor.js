import { flashNotification } from '../ui/notifications.js';
import { getMappingFor, setMapping, clearMapping, getAllNames } from './mappingState.js';

// Open the mapping modal for a single shape and apply the chosen assignment.
// Called from the pointer-handling code when in mapping mode.
export async function assignShapeMapping(el) {
  const idx = el.getAttribute('data-shape-index');
  const current = getMappingFor(idx) || el.getAttribute('data-name') || '';
  const answer = await openMappingModal(current);
  if (answer === null) return; // cancelled
  if (answer === '') {
    clearMapping(idx);
    el.removeAttribute('data-name');
    el.classList.remove('mapped');
    flashNotification('Assignació eliminada');
    return;
  }
  setMapping(idx, answer);
  el.setAttribute('data-name', answer);
  el.classList.add('mapped');
  flashNotification('Assignat: ' + answer);
}

// Populate and show the mapping modal, resolving with the chosen name,
// '' if the user cleared the assignment, or null if cancelled.
function openMappingModal(currentValue) {
  return new Promise((resolve) => {
    const modal = document.getElementById('mapping-modal');
    const sel = document.getElementById('mapping-select');
    const confirmBtn = document.getElementById('mapping-confirm');
    const cancelBtn = document.getElementById('mapping-cancel');
    const clearBtn = document.getElementById('mapping-clear');

    sel.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- sense assignar --';
    sel.appendChild(emptyOpt);
    getAllNames().forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === currentValue) opt.selected = true;
      sel.appendChild(opt);
    });

    modal.classList.remove('hidden');

    function cleanup() {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      clearBtn.removeEventListener('click', onClear);
    }
    function onConfirm() { const v = sel.value; cleanup(); resolve(v); }
    function onCancel() { cleanup(); resolve(null); }
    function onClear() { cleanup(); resolve(''); }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    clearBtn.addEventListener('click', onClear);
  });
}
