/**
 * GDT Bridge Agent — MVZ El-Sharafi
 *
 * Polls the web forms API for pending GDT files and drops them
 * into the Medical Office GDT import folder.
 *
 * Run:        node bridge.js
 * As service: node service-install.js  (run once as Administrator)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ─── Configuration (override via .env) ────────────────────────────────────────
const CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  apiKey: process.env.API_KEY || '123456789abcdef123456789abcdef1234567890',
  importFolder:
    process.env.GDT_IMPORT_DIR || '/Users/mahran.elmasri/Desktop/gdt-files/',
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '10000', 10), // 10 seconds
  logFile: process.env.LOG_FILE || path.join(__dirname, 'bridge.log'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
};
// ──────────────────────────────────────────────────────────────────────────────

// ─── Logger ───────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(level, message) {
  const line = `[${timestamp()}] [${level.padEnd(5)}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(CONFIG.logFile, line + '\n', 'utf8');
  } catch (_) {}
}

const logger = {
  info: (msg) => log('INFO', msg),
  warn: (msg) => log('WARN', msg),
  error: (msg) => log('ERROR', msg),
  ok: (msg) => log('OK', msg),
};
// ──────────────────────────────────────────────────────────────────────────────

// ─── API client ───────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: CONFIG.apiBaseUrl,
  timeout: 15000,
  headers: {
    'X-API-Key': CONFIG.apiKey,
    'Content-Type': 'application/json',
  },
});

/**
 * Fetch list of pending GDT files from the API.
 * Expected response: { success: true, data: [...], count: N }
 */
async function fetchPendingFiles() {
  const res = await api.get('/api/gdt/pending');
  // API returns { success, data: [...], count } - extract the data array
  if (res.data && res.data.success && Array.isArray(res.data.data)) {
    return res.data.data;
  }
  return [];
}

/**
 * Mark a GDT file as delivered so the API won't return it again.
 */
async function markDelivered(id) {
  await api.post(`/api/gdt/delivered/${id}`);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── File writer ──────────────────────────────────────────────────────────────
/**
 * Write a GDT file to the Medical Office import folder.
 * GDT 2.1 uses Latin-1 encoding with CRLF line endings.
 */
function writeGdtFile(filename, content) {
  const dest = path.join(CONFIG.importFolder, filename);

  // Decode base64 if the API sends it that way
  let buffer;
  if (isBase64(content)) {
    buffer = Buffer.from(content, 'base64');
  } else {
    // Assume UTF-8 string — re-encode as Latin-1 for GDT 2.1 compliance
    buffer = Buffer.from(content, 'latin1');
  }

  // Atomic write: write to .tmp then rename, so MO never sees a partial file
  const tmp = dest + '.tmp';
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, dest);

  return dest;
}

function isBase64(str) {
  if (typeof str !== 'string') return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(str) && str.length % 4 === 0;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Startup checks ───────────────────────────────────────────────────────────
function startup() {
  logger.info('GDT Bridge Agent starting...');
  logger.info(`API endpoint : ${CONFIG.apiBaseUrl}`);
  logger.info(`Import folder: ${CONFIG.importFolder}`);
  logger.info(`Poll interval: ${CONFIG.pollInterval}ms`);

  if (!fs.existsSync(CONFIG.importFolder)) {
    logger.warn(
      `Import folder does not exist — creating: ${CONFIG.importFolder}`,
    );
    fs.mkdirSync(CONFIG.importFolder, { recursive: true });
  }

  if (!CONFIG.apiKey) {
    logger.warn(
      'API_KEY is not set in .env — requests may be rejected by the server',
    );
  }

  logger.ok('Startup OK — polling started');
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Main poll loop ───────────────────────────────────────────────────────────
let consecutiveErrors = 0;

async function poll() {
  try {
    logger.info('Checking for pending GDT files...');
    const pending = await fetchPendingFiles();

    if (pending.length === 0) {
      consecutiveErrors = 0;
      logger.info('No pending files');
      return;
    }

    logger.info(`Found ${pending.length} pending GDT file(s)`);

    for (const item of pending) {
      try {
        const filename = item.filename || `gdt_${item.id}_${Date.now()}.gdt`;
        const dest = writeGdtFile(filename, item.content);
        logger.ok(`Written: ${filename} → ${dest}`);

        await markDelivered(item.id);
        logger.info(`Marked delivered: ${item.id}`);
      } catch (fileErr) {
        logger.error(
          `Failed to process file id=${item.id}: ${fileErr.message}`,
        );
      }
    }

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    const msg = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    logger.error(`Poll failed (attempt ${consecutiveErrors}): ${msg}`);

    if (consecutiveErrors >= CONFIG.maxRetries) {
      logger.warn(
        `${consecutiveErrors} consecutive errors — check API connectivity`,
      );
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
startup();
poll(); // run immediately on start
setInterval(poll, CONFIG.pollInterval);
