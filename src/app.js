const express = require('express');
const cors = require('cors');
const { PUBLIC_DIR, IMAGES_DIR } = require('./config/paths');
const datasourcesRouter = require('./routes/datasources');
const mappingRouter = require('./routes/mapping');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend and images
app.use(express.static(PUBLIC_DIR));
app.use('/images', express.static(IMAGES_DIR));

app.use('/api/datasources', datasourcesRouter);
app.use('/api/mapping', mappingRouter);

module.exports = app;
