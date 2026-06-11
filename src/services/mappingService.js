const fs = require('fs');
const { MAPPING_PATH } = require('../config/paths');

function getMapping() {
  if (!fs.existsSync(MAPPING_PATH)) return {};
  const data = fs.readFileSync(MAPPING_PATH, 'utf8');
  return JSON.parse(data);
}

function saveMapping(mapping) {
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), 'utf8');
}

module.exports = { getMapping, saveMapping };
