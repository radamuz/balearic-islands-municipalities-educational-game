export function flashNotification(text) {
  const n = document.createElement('div');
  n.className = 'notification';
  n.textContent = text;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1500);
}
