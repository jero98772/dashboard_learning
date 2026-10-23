// Tiny API that keeps every entry in a CSV file on disk. No dependencies.
//   GET    /api/entries      -> all entries as JSON
//   POST   /api/entries      -> add one entry or an array (an existing id is replaced)
//   DELETE /api/entries/:id  -> remove one entry
//   GET    /api/csv          -> the CSV file itself
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.CSV_FILE || path.join(dir, 'data', 'learning-log.csv');
const PORT = Number(process.env.PORT) || 3001;
const COLS = ['id', 'date', 'time', 'topic', 'format', 'minutes', 'title', 'sample', 'created'];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function load() {
  if (!fs.existsSync(FILE)) return [];
  const [head, ...rows] = parseCsv(fs.readFileSync(FILE, 'utf8'));
  if (!head) return [];
  return rows.map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return {
      id: o.id, date: o.date, time: o.time, topic: o.topic, format: o.format,
      minutes: Number(o.minutes) || 0, title: o.title,
      sample: o.sample === 'true', created: Number(o.created) || 0,
    };
  });
}

let entries = load();

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const lines = [COLS.join(',')].concat(entries.map((e) => COLS.map((c) => esc(e[c])).join(',')));
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, lines.join('\n') + '\n');
  fs.renameSync(tmp, FILE);
}

function clean(d) {
  return {
    id: String(d.id || crypto.randomUUID().slice(0, 8)),
    date: String(d.date || '').slice(0, 10),
    time: String(d.time || '12:00').slice(0, 5),
    topic: String(d.topic || '').slice(0, 80),
    format: String(d.format || '').slice(0, 40),
    minutes: Math.max(0, Number(d.minutes) || 0),
    title: String(d.title || '').slice(0, 140),
    sample: d.sample === true,
    created: Number(d.created) || Date.now(),
  };
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/entries') return send(res, 200, entries);
  if (req.method === 'GET' && p === '/api/csv') {
    if (!fs.existsSync(FILE)) save();
    return send(res, 200, fs.readFileSync(FILE, 'utf8'), 'text/csv; charset=utf-8');
  }
  if (req.method === 'DELETE' && p.startsWith('/api/entries/')) {
    const id = decodeURIComponent(p.slice('/api/entries/'.length));
    entries = entries.filter((e) => e.id !== id);
    save();
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/entries') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try {
        const raw = JSON.parse(body);
        const incoming = (Array.isArray(raw) ? raw : [raw]).map(clean);
        incoming.forEach((n) => {
          const i = entries.findIndex((e) => e.id === n.id);
          if (i >= 0) entries[i] = n; else entries.push(n);
        });
        save();
        send(res, 200, { ok: true, ids: incoming.map((n) => n.id) });
      } catch (e) { send(res, 400, { error: 'Bad request' }); }
    });
    return undefined;
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log('CSV API on http://localhost:' + PORT + '  ->  ' + FILE));
