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
    const result = await fp.get(); // get() és asíncrona — cal await
    const { visitorId, confidence, components } = result;
    if (!visitorId) throw new Error('FingerprintJS no ha retornat visitorId');

    const res = await reportVisitor(visitorId, confidence?.score ?? null, components);
    // Només marquem la gate si el POST ha anat bé; així un error transititori
    // es reintenta en la propera càrrega en lloc de silenciar-se per sempre.
    if (res && res.ok) {
      sessionStorage.setItem(REPORTED_KEY, '1');
    } else {
      console.warn('[visitorTracking] reportVisitor ha fallat:', res);
    }
  } catch (e) {
    // No blocant, però visible a consola per poder depurar.
    console.warn('[visitorTracking] error:', e && e.message ? e.message : e);
  }
}
