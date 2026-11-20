// TEST ONLY: serves the site with an in-memory stand-in for Firestore (same rules for answers),
// so whole games can be played locally without a Firebase project.  node test/mock-server.js
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const app = express();
app.get('/backend.js', (req, res) => res.sendFile(path.join(__dirname, 'mock-backend.js')));
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const io = new Server(server);
const docs = new Map(); // path -> data
const subs = new Map(); // socket.id -> Map(subId -> {kind,path,where})

const isTs = (v) => v && typeof v === 'object' && v.__serverTimestamp === true;
function resolve(v, now) {
  if (isTs(v)) return now;
  if (Array.isArray(v)) return v.map((x) => resolve(x, now));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolve(v[k], now); return o; }
  return v;
}
const parent = (p) => p.split('/').slice(0, -1).join('/');
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
function colDocs(col, where) {
  const out = [];
  for (const [p, d] of docs) if (parent(p) === col && (!where || d[where[0]] === where[1])) out.push({ id: p.split('/').pop(), ...clone(d) });
  return out;
}
function notify(changed) {
  for (const [sid, m] of subs) for (const [id, s] of m) {
    if (s.kind === 'doc' && s.path === changed) io.to(sid).emit('snap', { id, data: clone(docs.get(s.path)) ?? null });
    if (s.kind === 'col' && parent(changed) === s.path) io.to(sid).emit('snap', { id, data: colDocs(s.path, s.where) });
  }
}
function checkRules(op, p, data, uid, now) {
  const seg = p.split('/');
  if (seg[0] !== 'games') return 'bad path';
  const game = docs.get('games/' + seg[1]);
  if (seg.length === 2) {
    if (op === 'set') return docs.has(p) ? 'exists' : data.hostUid === uid ? null : 'not host';
    return game && game.hostUid === uid ? null : 'not host';
  }
  if (seg[2] === 'players') {
    if (op === 'set') return seg[3] === uid && !docs.has(p) ? null : 'denied';
    return game && game.hostUid === uid ? null : 'denied';
  }
  if (seg[2] === 'answers') {
    if (op !== 'set' || docs.has(p)) return 'denied';
    if (seg[3] !== `${data.q}_${uid}` || data.uid !== uid) return 'denied';
    if (!game || game.phase !== 'question' || game.qIndex !== data.q) return 'closed';
    if (now >= game.qStartAt + (game.q.time + 2) * 1000) return 'late';
    const pl = docs.get(`games/${seg[1]}/players/${uid}`);
    if (!pl || pl.kicked) return 'not player';
    return null;
  }
  return 'bad path';
}
io.on('connection', (socket) => {
  subs.set(socket.id, new Map());
  const uid = socket.handshake.auth.uid;
  socket.on('get', ({ path: p }, ack) => ack(clone(docs.get(p)) ?? null));
  socket.on('query', ({ path: p, where }, ack) => ack(colDocs(p, where)));
  socket.on('set', ({ path: p, data }, ack) => {
    const now = Date.now(); const err = checkRules('set', p, data, uid, now);
    if (err) return ack({ error: err });
    docs.set(p, resolve(data, now)); ack({}); notify(p);
  });
  socket.on('update', ({ path: p, patch }, ack) => {
    const now = Date.now(); if (!docs.has(p)) return ack({ error: 'missing' });
    const err = checkRules('update', p, patch, uid, now); if (err) return ack({ error: err });
    docs.set(p, { ...docs.get(p), ...resolve(patch, now) }); ack({}); notify(p);
  });
  socket.on('sub', (s) => {
    subs.get(socket.id).set(s.id, s);
    socket.emit('snap', { id: s.id, data: s.kind === 'doc' ? clone(docs.get(s.path)) ?? null : colDocs(s.path, s.where) });
  });
  socket.on('unsub', ({ id }) => subs.get(socket.id)?.delete(id));
  socket.on('disconnect', () => subs.delete(socket.id));
});
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('mock site on http://localhost:' + PORT));
module.exports = { docs };
