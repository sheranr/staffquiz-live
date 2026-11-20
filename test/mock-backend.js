// TEST ONLY: same interface as public/backend.js, talking to test/mock-server.js
import { io } from '/socket.io/socket.io.esm.min.js';
export const SERVER_TS = { __serverTimestamp: true };
const lag = () => new Promise((r) => setTimeout(r, 20 + Math.random() * 120)); // fake network delay
export async function createBackend() {
  let uid = localStorage.getItem('mock_uid');
  if (!uid) { uid = Math.random().toString(36).slice(2, 12); localStorage.setItem('mock_uid', uid); }
  const s = io({ auth: { uid } });
  const call = async (ev, payload) => { await lag(); return new Promise((res, rej) => s.emit(ev, payload, (r) => (r && r.error ? rej(Object.assign(new Error(r.error), { code: r.error })) : res(r)))); };
  const handlers = new Map(); let n = 0;
  s.on('snap', ({ id, data }) => { const h = handlers.get(id); if (h) setTimeout(() => h(data), 10 + Math.random() * 80); });
  const sub = (spec, cb) => { const id = ++n; handlers.set(id, cb); const send = () => s.emit('sub', { id, ...spec }); send(); s.on('connect', send); return () => { handlers.delete(id); s.emit('unsub', { id }); }; };
  await new Promise((r) => (s.connected ? r() : s.once('connect', r)));
  return {
    uid, SERVER_TS,
    getGame: (pin) => call('get', { path: `games/${pin}` }),
    createGame: (pin, d) => call('set', { path: `games/${pin}`, data: d }),
    updateGame: (pin, patch) => call('update', { path: `games/${pin}`, patch }),
    watchGame: (pin, cb) => sub({ kind: 'doc', path: `games/${pin}` }, cb),
    getPlayer: (pin, u) => call('get', { path: `games/${pin}/players/${u}` }),
    addPlayer: (pin, d) => call('set', { path: `games/${pin}/players/${uid}`, data: d }),
    updatePlayer: (pin, u, patch) => call('update', { path: `games/${pin}/players/${u}`, patch }),
    watchPlayer: (pin, u, cb) => sub({ kind: 'doc', path: `games/${pin}/players/${u}` }, cb),
    watchPlayers: (pin, cb) => sub({ kind: 'col', path: `games/${pin}/players` }, cb),
    nameTaken: async (pin, nl) => (await call('query', { path: `games/${pin}/players`, where: ['nameLower', nl] })).some((d) => d.id !== uid && !d.kicked),
    submitAnswer: (pin, q, choice) => call('set', { path: `games/${pin}/answers/${q}_${uid}`, data: { uid, q, choice, at: SERVER_TS } }),
    watchAnswers: (pin, q, cb) => sub({ kind: 'col', path: `games/${pin}/answers`, where: ['q', q] }, cb),
  };
}
