const fs = require('fs');
const { ACCESS_LOG_PATH } = require('../config/paths');

const MAX_ENTRIES = 5000;

// --- User-Agent parsing (lightweight, dependency-free) ---------------------
function parseUserAgent(ua) {
  const s = String(ua || '');

  // Operating system
  let os = 'Desconegut';
  if (/Windows NT 10/.test(s)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(s)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(s)) os = 'Windows 7';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/iPhone/.test(s)) os = 'iOS (iPhone)';
  else if (/iPad/.test(s)) os = 'iPadOS';
  else if (/Android[ /]?([\d.]+)?/.test(s)) os = 'Android' + (RegExp.$1 ? ' ' + RegExp.$1 : '');
  else if (/Mac OS X ([\d_]+)/.test(s)) os = 'macOS ' + RegExp.$1.replace(/_/g, '.');
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';

  // Browser (order matters: more specific first)
  let browser = 'Desconegut';
  if (/Edg(?:e|A|iOS)?\/([\d.]+)/.test(s)) browser = 'Edge ' + RegExp.$1;
  else if (/OPR\/([\d.]+)/.test(s) || /Opera\/([\d.]+)/.test(s)) browser = 'Opera ' + RegExp.$1;
  else if (/SamsungBrowser\/([\d.]+)/.test(s)) browser = 'Samsung Internet ' + RegExp.$1;
  else if (/Firefox\/([\d.]+)/.test(s)) browser = 'Firefox ' + RegExp.$1;
  else if (/Chrome\/([\d.]+)/.test(s)) browser = 'Chrome ' + RegExp.$1;
  else if (/Version\/([\d.]+).*Safari/.test(s)) browser = 'Safari ' + RegExp.$1;
  else if (/Safari\/([\d.]+)/.test(s)) browser = 'Safari';

  // Device type
  let deviceType = 'Escriptori';
  if (/iPad|Tablet/.test(s)) deviceType = 'Tauleta';
  else if (/Mobi|iPhone|Android.*Mobile/.test(s)) deviceType = 'Mòbil';
  else if (/Android/.test(s)) deviceType = 'Tauleta';

  // Vendor / model hint
  let device = '';
  if (/iPhone/.test(s)) device = 'iPhone';
  else if (/iPad/.test(s)) device = 'iPad';
  else if (/\((?:Linux; )?Android[^;]*;\s*([^;)]+?)(?:\sBuild|;|\))/.test(s)) device = RegExp.$1.trim();

  return { os, browser, deviceType, device };
}

// Best-effort real client IP, honoring common reverse-proxy headers.
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Read the full access log from disk (newest-first). Returns [] if none.
function getLog() {
  if (!fs.existsSync(ACCESS_LOG_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ACCESS_LOG_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// Append one access entry built from the request, capping the log size.
function logRequest(req) {
  try {
    const ua = req.headers['user-agent'] || '';
    const parsed = parseUserAgent(ua);
    const entry = {
      time: new Date().toISOString(),
      ip: clientIp(req),
      method: req.method,
      path: req.originalUrl || req.url,
      ...parsed,
      language: (req.headers['accept-language'] || '').split(',')[0] || '',
      referer: req.headers['referer'] || req.headers['referrer'] || '',
      userAgent: ua,
    };
    const log = getLog();
    log.unshift(entry);
    const trimmed = log.slice(0, MAX_ENTRIES);
    fs.writeFileSync(ACCESS_LOG_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    // Never let logging break a request.
  }
}

// Replace the whole access log with an imported array.
function replaceLog(entries) {
  if (!Array.isArray(entries)) throw new Error('Access log payload must be an array');
  const trimmed = entries.slice(0, MAX_ENTRIES);
  fs.writeFileSync(ACCESS_LOG_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  return trimmed;
}

module.exports = { getLog, logRequest, replaceLog, parseUserAgent };
