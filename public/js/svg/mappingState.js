// Holds the manual shape-index -> name mapping (persisted via /api/mapping)
// and the full list of known names used to populate the mapping editor.

let mapping = {};
let allNames = [];

export function getAllMapping() {
  return mapping;
}

export function setInitialMapping(initial) {
  mapping = initial || {};
}

export function getMappingFor(shapeIndex) {
  return mapping[shapeIndex];
}

export function setMapping(shapeIndex, name) {
  mapping[shapeIndex] = name;
}

export function clearMapping(shapeIndex) {
  delete mapping[shapeIndex];
}

export function getAllNames() {
  return allNames;
}

export function setAllNames(names) {
  allNames = names;
}
