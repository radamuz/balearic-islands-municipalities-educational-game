const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  IMAGES_DIR: path.join(ROOT_DIR, 'images'),
  DATASOURCE_DIR: path.join(ROOT_DIR, 'datasource'),
  MAPPING_PATH: path.join(ROOT_DIR, 'mapping.json'),
};
