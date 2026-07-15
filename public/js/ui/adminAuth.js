// Admin gate for the settings wheel.
//
// This only controls what the UI shows — the server independently rejects
// unauthenticated writes (see src/middleware/requireAdmin.js). Hiding the menu
// is convenience; the 401 is the actual protection.

import { fetchSession, login, logout } from '../api/client.js';
import { flashNotification } from './notifications.js';

let isAdmin = false;

export function isAdminSession() {
  return isAdmin;
}

// Show or hide the whole settings wheel based on the current session.
function applyAdminState() {
  const wheel = document.querySelector('.dev-tools');
  if (wheel) wheel.style.display = isAdmin ? '' : 'none';

  const loginBtn = document.getElementById('admin-login-btn');
  if (loginBtn) loginBtn.style.display = isAdmin ? 'none' : '';
}

function showLoginModal() {
  const overlay = document.getElementById('admin-login-overlay');
  const body = document.getElementById('admin-login-body');
  overlay.classList.remove('hidden');

  body.innerHTML = `
    <h2>🔐 Accés d'administrador</h2>
    <p class="empty">Introdueix les teves credencials per accedir a les eines.</p>
    <form id="admin-login-form" class="admin-form">
      <label for="admin-user">Usuari</label>
      <input id="admin-user" name="username" type="text" autocomplete="username" required autofocus />
      <label for="admin-pass">Contrasenya</label>
      <input id="admin-pass" name="password" type="password" autocomplete="current-password" required />
      <p id="admin-login-error" class="admin-error hidden"></p>
      <div class="finish-actions">
        <button type="button" id="admin-login-cancel" class="btn-secondary">Cancel·lar</button>
        <button type="submit" id="admin-login-submit" class="btn-primary">Entrar</button>
      </div>
    </form>`;

  const form = body.querySelector('#admin-login-form');
  const errorEl = body.querySelector('#admin-login-error');
  const submitBtn = body.querySelector('#admin-login-submit');

  body.querySelector('#admin-login-cancel').onclick = () => overlay.classList.add('hidden');

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrant…';

    const res = await login(
      body.querySelector('#admin-user').value,
      body.querySelector('#admin-pass').value,
    );

    if (res && res.ok) {
      isAdmin = true;
      applyAdminState();
      overlay.classList.add('hidden');
      flashNotification('Sessió iniciada');
      // Open the wheel so the tools are right there after logging in.
      const wheel = document.querySelector('.dev-tools');
      if (wheel) wheel.open = true;
    } else {
      errorEl.textContent = (res && res.error) || 'Error en iniciar sessió';
      errorEl.classList.remove('hidden');
      body.querySelector('#admin-pass').value = '';
      body.querySelector('#admin-pass').focus();
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  };
}

export async function initAdminAuth() {
  const session = await fetchSession();
  isAdmin = Boolean(session && session.admin);
  applyAdminState();

  const loginBtn = document.getElementById('admin-login-btn');
  if (loginBtn) loginBtn.addEventListener('click', () => showLoginModal());

  const logoutBtn = document.getElementById('admin-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
      isAdmin = false;
      applyAdminState();
      flashNotification('Sessió tancada');
    });
  }
}
