// Tracking de visitants: calcula l'empremta FingerprintJS un cop carregada la
// pàgina i l'envia al backend per registrar/actualitzar el visitant.
//
// És no-bloquejant i tolerant a fallades: si FingerprintJS no carrega o el
// backend no respon, l'app segueix funcionant normalment. Només es reporta una
// vegada per sessió (sessionStorage) per no saturar.

import FingerprintJS from '../vendor/fingerprintjs.esm.js';
import { reportVisitor } from '../api/client.js';

const REPORTED_KEY = 'balears_visitor_reported';

export async function initVisitorTracking() {
  try {
    // Evita re-reportar dins la mateixa sessió de navegador.
    if (sessionStorage.getItem(REPORTED_KEY)) return;

    const fp = await FingerprintJS.load();
    const result = fp.get();
    const { visitorId, confidence, components } = result;

    // Components poden ser grans; només calen al backend per classificar i
    // mostrar. S'hi envien senceres (la ruta ja les limita).
    await reportVisitor(visitorId, confidence?.score ?? null, components);
    sessionStorage.setItem(REPORTED_KEY, '1');
  } catch (e) {
    // Silenciat: el tracking mai ha de trencar l'app.
  }
}
