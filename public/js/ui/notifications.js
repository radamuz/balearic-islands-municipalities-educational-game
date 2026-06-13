// Transient toast in the corner (used for non-gameplay messages).
export function flashNotification(text) {
  const n = document.createElement('div');
  n.className = 'notification';
  n.textContent = text;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'));
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 250); }, 1400);
}

// Floating score/combo popup that rises from the drop point and fades out.
export function popFeedback(x, y, main, sub = '', isError = false) {
  const el = document.createElement('div');
  el.className = 'pop-feedback' + (isError ? ' error' : '');
  const m = document.createElement('div');
  m.className = 'pop-main';
  m.textContent = main;
  el.appendChild(m);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'pop-sub';
    s.textContent = sub;
    el.appendChild(s);
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('rise'));
  setTimeout(() => el.remove(), 900);
}
