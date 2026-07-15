const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  IMAGES_DIR: path.join(ROOT_DIR, 'images'),
  DATASOURCE_DIR: path.join(ROOT_DIR, 'datasource'),
  // Scores and the access log live in DynamoDB. The mapping does too, but the
  // committed file stays as the read fallback when DynamoDB is unreachable.
  MAPPING_PATH: path.join(ROOT_DIR, 'mapping.json'),
};
