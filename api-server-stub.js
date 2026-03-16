/**
 * api-server-stub.js — Example Express API (server-side)
 *
 * Shows the two endpoints the bridge agent expects.
 * Plug your real database / form submission logic in here.
 *
 * Install:  npm install express
 * Run:      node api-server-stub.js
 */

const express = require('express');
const app = express();
app.use(express.json());

// ─── Simple API key middleware ────────────────────────────────────────────────
const API_KEY = process.env.API_KEY || 'your-secret-api-key-here';

function requireApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── In-memory queue (replace with your DB) ──────────────────────────────────
// Each entry: { id, filename, content (Latin-1 encoded GDT string or base64) }
const pendingFiles = [];
let nextId = 1;

// ─── Endpoint 1: GET /api/gdt/pending ────────────────────────────────────────
// Bridge polls this every 10 seconds.
// Returns array of GDT files ready to be imported into Medical Office.
app.get('/api/gdt/pending', requireApiKey, (req, res) => {
  res.json(pendingFiles.filter((f) => !f.delivered));
});

// ─── Endpoint 2: POST /api/gdt/delivered/:id ─────────────────────────────────
// Bridge calls this after successfully writing the file to the import folder.
// Marks the file so it won't be returned again.
app.post('/api/gdt/delivered/:id', requireApiKey, (req, res) => {
  const file = pendingFiles.find((f) => String(f.id) === req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  file.delivered = true;
  res.json({ ok: true });
});

// ─── Endpoint 3: POST /api/gdt/submit ────────────────────────────────────────
// Your web form POSTs here when a patient submits an Anamnese/IUD/OP form.
// The server generates the GDT content and queues it for the bridge to pick up.
app.post('/api/gdt/submit', requireApiKey, (req, res) => {
  const { patientId, lastName, firstName, dob, formType, answers } = req.body;

  if (!lastName || !firstName || !dob) {
    return res
      .status(400)
      .json({ error: 'lastName, firstName and dob are required' });
  }

  // Generate GDT content from the submitted form data
  const gdtContent = generateGdt({
    patientId,
    lastName,
    firstName,
    dob,
    formType,
    answers,
  });
  const filename = `${lastName}_${firstName}_${formType}_${Date.now()}.gdt`;

  const entry = {
    id: nextId++,
    filename,
    content: gdtContent, // Latin-1 encoded string
    delivered: false,
    createdAt: new Date().toISOString(),
  };

  pendingFiles.push(entry);

  res.json({ ok: true, id: entry.id, filename });
});

// ─── GDT generator ────────────────────────────────────────────────────────────
function gdtLine(fieldId, value) {
  const total = 3 + 4 + Buffer.byteLength(value, 'latin1') + 2;
  return `${String(total).padStart(3, '0')}${fieldId}${value}\r\n`;
}

function generateGdt({
  patientId,
  lastName,
  firstName,
  dob,
  formType = 'ANM',
  answers = [],
}) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;

  const lines = [
    gdtLine('8000', '6310'),
    gdtLine('9218', '02.10'),
    gdtLine('3000', String(patientId || '00000')),
    gdtLine('3101', firstName),
    gdtLine('3100', lastName),
    gdtLine('3103', dob.replace(/\D/g, '')), // strip non-digits → DDMMYYYY
    gdtLine('7230', 'WEBFORM'),
    gdtLine('8402', formType),
    gdtLine('6200', dateStr),
    gdtLine('6201', '000000'),
  ];

  // Add each answer as an 8480 result text line
  for (const { label, value } of answers) {
    lines.push(gdtLine('8480', `${label}: ${value}`));
  }

  const content = lines.join('');
  const totalBytes = Buffer.byteLength(content, 'latin1');
  const headerLine = gdtLine(
    '8100',
    String(totalBytes + 3 + 4 + 5 + 2).padStart(5, '0'),
  );

  return headerLine + content;
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`GDT API stub running on http://localhost:${PORT}`);
  console.log(`API key: ${API_KEY}`);
});
