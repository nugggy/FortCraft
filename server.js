// FortCraft LAN server: serves the game and relays match traffic over WebSockets.
// Usage: node server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { execFile } = require('child_process');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const ALLOWED = ['index.html', 'style.css', 'version.json', 'manifest.webmanifest', 'sw.js', 'icons', 'src', 'vendor'];
const LOCAL = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const isGit = () => fs.existsSync(path.join(ROOT, '.git'));

// Self-update for git installs. Only this computer may trigger it, and the custom header
// forces a CORS preflight, so other websites can't call it from the browser.
function handleUpdateApi(req, res, p) {
  const local = LOCAL.includes(req.socket.remoteAddress);
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (p === '/api/update-info') return json(200, { canUpdate: local && isGit(), local, git: isGit() });
  if (req.method !== 'POST' || req.headers['x-fortcraft'] !== 'update') return json(400, { ok: false, error: 'Bad request' });
  if (!local) return json(403, { ok: false, error: 'Updates can only be started on the computer running the server.' });
  if (!isGit()) return json(400, { ok: false, error: 'This copy was not installed with git. Download the latest release instead.' });
  execFile('git', ['pull', '--ff-only'], { cwd: ROOT, timeout: 120000 }, (err, out, errOut) => {
    if (err) return json(500, { ok: false, error: 'git pull failed', log: String(errOut || err.message) });
    execFile(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev'], { cwd: ROOT, timeout: 300000, shell: process.platform === 'win32' }, (err2, out2, errOut2) => {
      json(err2 ? 500 : 200, { ok: !err2, log: String(out) + String(out2 || '') + (err2 ? String(errOut2) : ''), restart: true });
    });
  });
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/api/update-info' || p === '/api/update') return handleUpdateApi(req, res, p);
  if (p === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, players: clients.size, inMatch })); return; }
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || !ALLOWED.some(a => rel === a || rel.startsWith(a + path.sep))) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map(); // id -> { ws, name, outfit }
let nextId = 1, hostId = 0, inMatch = false;

const lobby = () => [...clients.entries()].map(([id, c]) => ({ id, name: c.name, outfit: c.outfit, glider: c.glider, pickaxe: c.pickaxe, platform: c.platform, inMatch: c.inMatch, spectator: !!c.spectator }));
const sendTo = (id, msg) => { const c = clients.get(id); if (c && c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const broadcast = (msg, except = -1) => { const s = JSON.stringify(msg); for (const id of clients.keys()) if (id !== except) sendTo(id, s); };
const pushLobby = () => broadcast({ t: 'lobby', lobby: lobby(), hostId, inMatch });

wss.on('connection', (ws, req) => {
  let id = 0;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'hello') {
      id = nextId++;
      clients.set(id, { ws, name: String(msg.name || 'Player').slice(0, 16), outfit: msg.outfit | 0, platform: msg.platform === 'mobile' ? 'mobile' : 'desktop', inMatch, spectator: inMatch }); // late joiners spectate until the next match
      if (!hostId || !clients.has(hostId)) hostId = id;
      sendTo(id, { t: 'welcome', id, hostId, lobby: lobby(), inMatch });
      pushLobby();
      console.log(`+ ${clients.get(id).name} joined (#${id}) from ${req.socket.remoteAddress}${inMatch ? ' as a spectator' : ''}`);
      return;
    }
    if (!id) return;
    msg.from = id;
    if (msg.t === 'profile') { const c = clients.get(id); c.name = String(msg.name || c.name).slice(0, 16); c.outfit = msg.outfit | 0; if (typeof msg.glider === 'string') c.glider = msg.glider.slice(0, 24); if (typeof msg.pickaxe === 'string') c.pickaxe = msg.pickaxe.slice(0, 24); pushLobby(); return; }
    if (msg.t === 'start' && id === hostId) {
      inMatch = true;
      for (const pid of msg.players) { const c = clients.get(pid); if (c) { c.inMatch = true; c.spectator = false; } }
      broadcast(msg, id); pushLobby(); return;
    }
    if (msg.t === 'end' && id === hostId) {
      inMatch = false;
      for (const c of clients.values()) { c.inMatch = false; c.spectator = false; }
      broadcast(msg, id); pushLobby(); return;
    }
    if (msg.to !== undefined) {
      const to = msg.to === 'host' ? hostId : msg.to;
      if (to === id) return;
      sendTo(to, msg);
      return;
    }
    broadcast(msg, id);
  });
  ws.on('close', () => {
    if (!id) return;
    const c = clients.get(id);
    clients.delete(id);
    console.log(`- ${c ? c.name : id} left`);
    broadcast({ t: 'left', id });
    if (id === hostId) {
      hostId = clients.size ? Math.min(...clients.keys()) : 0;
      if (inMatch) { inMatch = false; for (const k of clients.values()) k.inMatch = false; broadcast({ t: 'hostLeft' }); }
      broadcast({ t: 'host', id: hostId });
    }
    pushLobby();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  FortCraft server running\n');
  console.log(`  This computer:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On your LAN:     http://${a.address}:${PORT}`);
  }
  console.log('\n  Share the LAN address with players on the same network.\n');
});
