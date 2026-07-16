// Feature flags: load from the server and reflect them in the UI. The flags
// themselves are configured in Node via environment variables (read-only here).

import { loadFlags } from '../api/client.js';

// Each flag: the toolbar elements it shows/hides when enabled.
const FLAG_META = {
  accessLog: { targets: ['#manage-accesslog', '#manage-audit', '#manage-fingerprint', '#manage-visitors'] },
};

function applyFlags(flags) {
  for (const [name, meta] of Object.entries(FLAG_META)) {
    const on = Boolean(flags && flags[name]);
    meta.targets.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.display = on ? '' : 'none';
    });
  }
}

// Fetch flags once on startup and apply them to the toolbar.
export async function initFlags() {
  applyFlags(await loadFlags());
}
