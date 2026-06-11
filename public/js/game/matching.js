import { normalizeKey } from '../utils/normalize.js';
import { ISLAND_GROUPS } from '../data/islandGroups.js';

// Distinguishes the "isla" item (e.g. the "Eivissa" entry from
// illes-pitiüses.txt) from the "municipi" item with the same name (the
// "Eivissa" entry from municipis-de-les-illes-balears.txt). Only "isla"
// drops use the island-wide group matching below.
export const ITEM_KIND = {
  ISLAND: 'isla',
  MUNICIPALITY: 'municipi',
};

// Returns the list of municipalities that make up `placedName`'s territory
// when it's an island drop, or null otherwise.
export function getIslandGroup(placedName, kind) {
  return (kind === ITEM_KIND.ISLAND) ? (ISLAND_GROUPS[placedName] || null) : null;
}

export function isMatch(placedName, targetName, kind) {
  const group = getIslandGroup(placedName, kind);
  if (group) return group.some((m) => normalizeKey(m) === normalizeKey(targetName));
  return normalizeKey(placedName) === normalizeKey(targetName);
}
