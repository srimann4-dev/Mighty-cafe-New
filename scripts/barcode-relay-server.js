#!/usr/bin/env node
/**
 * Mighty Cafe — Barcode Scan Relay (laptop companion)
 *
 * Run on a laptop on the same Wi‑Fi as the phone:
 *   node scripts/barcode-relay-server.js
 *
 * Open the printed URL in Chrome/Edge, scan barcodes on the phone app,
 * enter quantities on the laptop, then export CSV for Excel.
 */

const http = require('http');
const os = require('os');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.BARCODE_RELAY_PORT || 8765);
const scans = new Map();

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function listScans() {
  return [...scans.values()].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
}

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mighty Cafe — Barcode Scan List</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; background: #f5f5f5; color: #1a1a1a; }
    header { background: #2ecc71; color: #fff; padding: 16px 24px; }
    header h1 { margin: 0 0 4px; font-size: 1.35rem; }
    header p { margin: 0; opacity: 0.92; font-size: 0.9rem; }
    main { max-width: 960px; margin: 0 auto; padding: 20px 16px 40px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; }
    button { border: none; border-radius: 10px; padding: 10px 16px; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
    .btn-primary { background: #2ecc71; color: #fff; }
    .btn-danger { background: #e74c3c; color: #fff; }
    .btn-outline { background: #fff; border: 1px solid #ddd; color: #333; }
    .status { font-size: 0.85rem; color: #666; margin-left: auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #fafafa; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    tr:last-child td { border-bottom: none; }
    tr.new-row { animation: flash 1.2s ease; }
    @keyframes flash { from { background: #d5f5e3; } to { background: transparent; } }
    input.qty { width: 88px; padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; }
    .empty { text-align: center; padding: 48px 16px; color: #888; background: #fff; border-radius: 12px; }
    .barcode { font-family: ui-monospace, monospace; font-weight: 600; }
    .hint { background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #e8e8e8; font-size: 0.9rem; line-height: 1.5; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>Mighty Cafe — Barcode Scan List</h1>
    <p>Scans from the phone appear here. Enter quantity for each line, then export to Excel.</p>
  </header>
  <main>
    <div class="hint">
      In the app: <strong>Inventory → Barcode Scan List</strong> → set Laptop URL to
      <code id="phone-url">http://${'${LAN_IP}'}:${PORT}</code> → scan items with your gun or camera.
    </div>
    <div class="toolbar">
      <button class="btn-primary" onclick="exportCsv()">Export CSV (Excel)</button>
      <button class="btn-outline" onclick="copyTable()">Copy for Notes / Excel paste</button>
      <button class="btn-danger" onclick="clearAll()">Clear list</button>
      <span class="status" id="status">Waiting for scans…</span>
    </div>
    <div id="table-wrap"></div>
  </main>
  <script>
    let knownIds = new Set();

    async function refresh() {
      const res = await fetch('/api/scans');
      const rows = await res.json();
      const wrap = document.getElementById('table-wrap');
      document.getElementById('status').textContent = rows.length
        ? rows.length + ' scan(s) — updated ' + new Date().toLocaleTimeString()
        : 'Waiting for scans…';

      if (!rows.length) {
        wrap.innerHTML = '<div class="empty">No barcodes yet. Scan on the phone to add rows here.</div>';
        knownIds = new Set();
        return;
      }

      let html = '<table><thead><tr><th>#</th><th>Time</th><th>Barcode</th><th>Item</th><th>Qty</th></tr></thead><tbody>';
      rows.forEach((row, i) => {
        const isNew = !knownIds.has(row.id);
        html += '<tr class="' + (isNew ? 'new-row' : '') + '">';
        html += '<td>' + (i + 1) + '</td>';
        html += '<td>' + new Date(row.scannedAt).toLocaleTimeString() + '</td>';
        html += '<td class="barcode">' + escapeHtml(row.barcode) + '</td>';
        html += '<td>' + escapeHtml(row.itemName || '—') + '</td>';
        html += '<td><input class="qty" type="number" min="0" step="any" value="' + (row.quantity ?? '') + '" data-id="' + row.id + '" onchange="saveQty(this)" /></td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
      knownIds = new Set(rows.map((r) => r.id));
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    async function saveQty(input) {
      const id = input.dataset.id;
      const quantity = input.value === '' ? null : Number(input.value);
      await fetch('/api/scans/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
    }

    async function clearAll() {
      if (!confirm('Clear all scanned barcodes?')) return;
      await fetch('/api/scans', { method: 'DELETE' });
      knownIds = new Set();
      refresh();
    }

    function exportCsv() {
      window.location.href = '/export.csv';
    }

    async function copyTable() {
      const res = await fetch('/api/scans');
      const rows = await res.json();
      const lines = ['Barcode\\tItem\\tQuantity'];
      for (const r of rows) {
        lines.push([r.barcode, r.itemName || '', r.quantity ?? ''].join('\\t'));
      }
      await navigator.clipboard.writeText(lines.join('\\n'));
      alert('Copied ' + rows.length + ' row(s). Paste into Excel or Notepad.');
    }

    setInterval(refresh, 1000);
    refresh();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && path === '/') {
      const lanIp = getLanIp();
      cors(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_PAGE.replace('${LAN_IP}', lanIp));
      return;
    }

    if (req.method === 'GET' && path === '/api/scans') {
      sendJson(res, 200, listScans());
      return;
    }

    if (req.method === 'POST' && path === '/api/scans') {
      const body = await readBody(req);
      const barcode = String(body.barcode ?? '').trim();
      if (!barcode) {
        sendJson(res, 400, { error: 'barcode required' });
        return;
      }
      const entry = {
        id: randomUUID(),
        barcode,
        itemName: body.itemName ? String(body.itemName) : null,
        unit: body.unit ? String(body.unit) : null,
        quantity: body.quantity != null && body.quantity !== '' ? Number(body.quantity) : null,
        scannedAt: new Date().toISOString(),
      };
      scans.set(entry.id, entry);
      sendJson(res, 201, entry);
      console.log(`[scan] ${barcode}${entry.itemName ? ` (${entry.itemName})` : ''}`);
      return;
    }

    if (req.method === 'PATCH' && path.startsWith('/api/scans/')) {
      const id = path.slice('/api/scans/'.length);
      const existing = scans.get(id);
      if (!existing) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      const body = await readBody(req);
      if ('quantity' in body) {
        existing.quantity = body.quantity == null || body.quantity === '' ? null : Number(body.quantity);
      }
      scans.set(id, existing);
      sendJson(res, 200, existing);
      return;
    }

    if (req.method === 'DELETE' && path === '/api/scans') {
      scans.clear();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && path === '/export.csv') {
      const rows = listScans();
      const lines = ['barcode,item_name,unit,quantity,scanned_at'];
      for (const row of rows) {
        lines.push([
          escapeCsv(row.barcode),
          escapeCsv(row.itemName ?? ''),
          escapeCsv(row.unit ?? ''),
          escapeCsv(row.quantity ?? ''),
          escapeCsv(row.scannedAt),
        ].join(','));
      }
      cors(res);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="barcode-scan-list-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
      res.end(lines.join('\n'));
      return;
    }

    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, { ok: true, scanCount: scans.size, lanIp: getLanIp(), port: PORT });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('  Mighty Cafe Barcode Relay');
  console.log('  ─────────────────────────');
  console.log(`  Laptop page:  http://localhost:${PORT}`);
  console.log(`  Phone URL:    http://${lanIp}:${PORT}`);
  console.log('');
  console.log('  Keep this terminal open while scanning.');
  console.log('');
});
