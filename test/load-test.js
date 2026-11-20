// Simulates a host + N players playing a full game. Usage: node test/load-test.js [players] [url]
const { io } = require('socket.io-client');
const N = +process.argv[2] || 100, URL = process.argv[3] || 'http://localhost:3000';
const quiz = { title: 'Load test', questions: Array.from({ length: 5 }, (_, i) => ({ text: `Q${i + 1}?`, options: ['A', 'B', 'C', 'D'], correct: i % 4, time: 6 })) };
const host = io(URL, { transports: ['websocket'] });
let finals = 0, lastPhase = '';
host.on('connect', () => host.emit('host:create', { quiz, settings: { timeLimit: 6 } }, async (r) => {
  console.log('Game PIN', r.pin);
  const players = [];
  for (let i = 0; i < N; i++) {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    await new Promise(res => s.on('connect', res));
    await new Promise(res => s.emit('player:join', { pin: r.pin, name: 'Staff ' + i }, (a) => { if (!a.ok) console.log('join fail', a); res(); }));
    s.on('state', (st) => {
      if (st.phase === 'question' && st.answered == null && !s._ans?.[st.qIndex]) {
        (s._ans ||= {})[st.qIndex] = 1;
        const skill = i / N; // higher i = faster & more accurate
        setTimeout(() => s.emit('player:answer', { choice: Math.random() < 0.3 + 0.6 * skill ? st.qIndex % 4 : (st.qIndex + 1) % 4 }, () => {}), 200 + (1 - skill) * 3000 * Math.random());
      }
      if (st.phase === 'final' && !s._f) { s._f = 1; finals++; }
    });
    players.push(s);
  }
  console.log(`${N} players joined`);
  setTimeout(() => host.emit('host:next'), 500);
}));
const t0 = Date.now();
host.on('host:state', (s) => {
  if (s.phase === lastPhase && s.phase !== 'lobby') return;
  lastPhase = s.phase;
  const at = ((Date.now() - t0) / 1000).toFixed(1) + 's';
  if (s.phase === 'reveal') { console.log(at, `Q${s.qIndex + 1} reveal: dist ${s.reveal.dist} correct=${s.reveal.correctCount} fastest=${s.reveal.fastest?.name} ${s.reveal.fastest?.elapsed}ms`); setTimeout(() => host.emit('host:next'), 300); }
  if (s.phase === 'leaderboard') { console.log(at, 'top3', s.leaderboard.slice(0, 3).map(p => `${p.name}:${p.score}`).join(' | ')); setTimeout(() => host.emit('host:next'), 300); }
  if (s.phase === 'final') {
    const lb = s.leaderboard;
    const sorted = lb.every((p, i) => i === 0 || lb[i - 1].score > p.score || (lb[i - 1].score === p.score && lb[i - 1].totalTime <= p.totalTime));
    setTimeout(() => { console.log(at, 'FINAL top5', lb.slice(0, 5).map(p => `${p.name}:${p.score}`).join(' | '), '| ranking sorted:', sorted, '| players saw final:', finals, '| results rows:', s.results.players.length); process.exit(0); }, 1000);
  }
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
