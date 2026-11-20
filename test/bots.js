// TEST ONLY: N simulated staff join a game on the mock server and answer every question.
// node test/bots.js <PIN> [count] [url]
const { io } = require('socket.io-client');
const [PIN, N = 97, URL = 'http://localhost:4000'] = [process.argv[2], +process.argv[3] || 97, process.argv[4]];
let answered = 0, denied = 0;
(async () => {
  for (let i = 0; i < N; i++) {
    const uid = 'bot' + i, s = io(URL || 'http://localhost:4000', { auth: { uid }, transports: ['websocket'] });
    await new Promise((r) => s.on('connect', r));
    const skill = i / N;
    await new Promise((r) => s.emit('set', { path: `games/${PIN}/players/${uid}`, data: { name: 'Staff ' + i, nameLower: 'staff ' + i, joinedAt: { __serverTimestamp: true } } }, r));
    const done = new Set();
    s.on('snap', ({ data: g }) => {
      if (!g || g.phase !== 'question' || done.has(g.qIndex)) return;
      done.add(g.qIndex);
      const q = g.qIndex, delay = 300 + (1 - skill) * (g.q.time * 1000 - 500) * Math.random();
      setTimeout(() => {
        // bots don't know the answer; host keeps it secret. Higher-numbered bots pick option 0 more often
        const choice = Math.random() < 0.3 + 0.6 * skill ? 0 : 1 + Math.floor(Math.random() * (g.q.options.length - 1));
        s.emit('set', { path: `games/${PIN}/answers/${q}_${uid}`, data: { uid, q, choice, at: { __serverTimestamp: true } } }, (r) => (r && r.error ? denied++ : answered++));
      }, delay);
    });
    s.emit('sub', { id: 1, kind: 'doc', path: `games/${PIN}` });
  }
  console.log(`${N} bots joined`);
  setInterval(() => console.log(`bots: answers accepted=${answered} rejected=${denied}`), 15000).unref();
})();
