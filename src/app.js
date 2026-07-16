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

// The frontend is served from this same app, so production needs no CORS at
// all: default to sending no CORS headers rather than reflecting the caller's
// Origin. Reflecting it alongside `credentials: true` would let any site read
// authenticated responses the day the session cookie stops being SameSite=Lax.
// Cross-origin callers must be listed explicitly in CORS_ORIGINS.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Record every incoming access (IP, device, browser, path…). The access-log
// endpoints themselves are skipped so viewing/exporting doesn't pollute the log.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/access-log')) logRequest(req, res);
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
