const fs = require('fs');
const path = require('path');
const { DATASOURCE_DIR } = require('../config/paths');

// Read every .txt file in the datasource directory and return a map of
// filename -> array of non-empty, trimmed lines.
function readDatasources() {
  const files = fs.readdirSync(DATASOURCE_DIR);
  const txtFiles = files.filter((f) => f.toLowerCase().endsWith('.txt'));
  const result = {};
  txtFiles.forEach((file) => {
    const content = fs.readFileSync(path.join(DATASOURCE_DIR, file), 'utf8');
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    result[file] = lines;
  });
  return result;
}

module.exports = { readDatasources };
