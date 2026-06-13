// Feature flags resolved from Node environment variables. Set them when you
// start the server, e.g.:  FEATURE_ACCESS_LOG=true npm start
// These are read-only at runtime — there is no in-app toggle.

function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|on|yes)$/i.test(String(value).trim());
}

function getFlags() {
  return {
    accessLog: parseBool(process.env.FEATURE_ACCESS_LOG, false),
  };
}

module.exports = { getFlags };
