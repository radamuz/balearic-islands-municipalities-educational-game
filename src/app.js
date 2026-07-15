require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { PUBLIC_DIR, IMAGES_DIR } = require('./config/paths');
const datasourcesRouter = require('./routes/datasources');
const mappingRouter = require('./routes/mapping');
const scoresRouter = require('./routes/scores');
const accessLogRouter = require('./routes/accessLog');
const flagsRouter = require('./routes/flags');
const authRouter = require('./routes/auth');
const { logRequest } = require('./services/accessLogService');

const app = express();
app.set('trust proxy', true);

// Same-origin in production (the frontend is served from this app), so CORS is
// only needed for local dev. Credentials are allowed because admin auth rides
// on a cookie — which is also why we can't use a wildcard origin.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Record every incoming access (IP, device, browser, path…). The access-log
// endpoints themselves are skipped so viewing/exporting doesn't pollute the log.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/access-log')) logRequest(req);
  next();
});

// Serve static frontend and images
app.use(express.static(PUBLIC_DIR));
app.use('/images', express.static(IMAGES_DIR));

app.use('/api/auth', authRouter);
app.use('/api/datasources', datasourcesRouter);
app.use('/api/mapping', mappingRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/access-log', accessLogRouter);
app.use('/api/flags', flagsRouter);

module.exports = app;
