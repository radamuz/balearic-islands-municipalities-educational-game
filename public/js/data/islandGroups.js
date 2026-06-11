import { normalizeKey } from '../utils/normalize.js';

// Each "isla" item maps to the set of municipalities that make up its
// territory in the SVG. Dropping the island name onto any of those
// municipalities counts as correct. "Eivissa" and "Formentera" are also the
// names of one of their own municipalities, so they need a group too -
// otherwise dropping the island "Eivissa" would only ever match the single
// "Eivissa" municipality shape instead of highlighting the whole island.
export const ISLAND_GROUPS = {
  'Mallorca': ["Alaró","Alcúdia","Algaida","Andratx","Ariany","Artà","Banyalbufar","Binissalem","Búger","Bunyola","Calvià","Campanet","Campos","Capdepera","Consell","Costitx","Deià","Escorca","Esporles","Estellencs","Felanitx","Fornalutx","Inca","Lloret de Vistalegre","Lloseta","Llubí","Llucmajor","Manacor","Mancor de la Vall","Maria de la Salut","Marratxí","Montuïri","Muro","Palma","Petra","Pollença","Porreres","Sa Pobla","Puigpunyent","Ses Salines","Sant Joan","Sant Llorenç des Cardassar","Sencelles","Santa Eugènia","Santa Margalida","Santa Maria del Camí","Santanyí","Selva","Sineu","Sóller","Son Servera","Valldemossa","Vilafranca de Bonany"],
  'Menorca': ["Maó","Ciutadella de Menorca","Alaior","Es Castell","Es Mercadal","Es Migjorn Gran","Ferreries","Sant Lluís"],
  'Eivissa': ["Eivissa","Sant Antoni de Portmany","Sant Josep de sa Talaia","Sant Joan de Labritja","Santa Eulària des Riu"],
  'Formentera': ["Formentera"]
};

// Find the island group a shape/name belongs to. Returns the island name, or
// '__<normalizedKey>' for shapes that aren't part of any island group (e.g.
// small islets), so each gets its own singleton group key.
export function islandOf(name) {
  const k = normalizeKey(name);
  for (const isl in ISLAND_GROUPS) {
    if (normalizeKey(isl) === k) return isl;
    if (ISLAND_GROUPS[isl].some((m) => normalizeKey(m) === k)) return isl;
  }
  return '__' + k;
}
