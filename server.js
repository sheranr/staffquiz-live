// StaffQuiz Live — real-time MCQ quiz game server
// Express serves the screens, Socket.io runs the live game.
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const HOST_PASSWORD = process.env.HOST_PASSWORD || ''; // optional: protects quiz hosting
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '300', 10);
const COUNTDOWN_MS = 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 5e6 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/health', (req, res) => res.json({ ok: true, games: games.size }));
app.get('/qr', async (req, res) => {
  try {
    const url = String(req.query.u || '').slice(0, 500);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 320 });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(400).end(); }
});

/** @type {Map<string, any>} */
const games = new Map();

const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
function newPin() {
  let pin;
  do { pin = String(Math.floor(100000 + Math.random() * 900000)); } while (games.has(pin));
  return pin;
}
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

function sanitizeQuiz(quiz, settings) {
  const defTime = Math.min(120, Math.max(5, parseInt(settings.timeLimit, 10) || 20));
  let qs = (Array.isArray(quiz.questions) ? quiz.questions : []).map((q) => {
    const options = (q.options || []).map((o) => clean(o, 200)).filter(Boolean).slice(0, 6);
    const correct = parseInt(q.correct, 10);
    return {
      text: clean(q.text, 500),
      image: /^https?:\/\//i.test(q.image || '') ? clean(q.image, 1000) : '',
      options,
      correct,
      time: Math.min(120, Math.max(5, parseInt(q.time, 10) || defTime)),
    };
  }).filter((q) => q.text && q.options.length >= 2 && q.correct >= 0 && q.correct < q.options.length);
  if (settings.shuffleQuestions) qs = shuffle(qs);
  if (settings.shuffleOptions) {
    qs = qs.map((q) => {
      const order = shuffle(q.options.map((_, i) => i));
      return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
    });
  }
  return { title: clean(quiz.title, 120) || 'Staff Quiz', questions: qs };
}

// ---------- scoring ----------
// Correct answer earns 500–1000 points: the faster, the more points.
// Wrong / no answer = 0. Ties on points are broken by total answer time (faster wins).
function pointsFor(elapsedMs, limitMs, speedScoring) {
  if (!speedScoring) return 1000;
  const frac = Math.min(1, Math.max(0, elapsedMs / limitMs));
  return Math.round(1000 * (1 - frac / 2));
}

function ranking(game) {
  return [...game.players.values()]
    .filter((p) => !p.kicked)
    .sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.joinedAt - b.joinedAt)
    .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score, correct: p.correctCount, totalTime: p.totalTime, streak: p.streak, online: !!p.socketId }));
}

function curQ(game) { return game.quiz.questions[game.qIndex]; }

function publicQuestion(game) {
  const q = curQ(game);
  return { index: game.qIndex, total: game.quiz.questions.length, text: q.text, image: q.image, options: q.options, time: q.time, endsAt: game.qEndsAt };
}

// ---------- state snapshots ----------
function hostState(game) {
  const base = {
    pin: game.pin, title: game.quiz.title, phase: game.phase, settings: game.settings,
    total: game.quiz.questions.length, qIndex: game.qIndex,
    players: [...game.players.values()].filter((p) => !p.kicked).map((p) => ({ id: p.id, name: p.name, online: !!p.socketId })),
    serverNow: Date.now(),
  };
  if (game.phase === 'countdown') base.startsAt = game.countdownEndsAt;
  if (['question', 'reveal'].includes(game.phase)) {
    base.question = publicQuestion(game);
    base.answered = game.answers.size;
  }
  if (game.phase === 'reveal') {
    const q = curQ(game);
    const dist = q.options.map(() => 0);
    let fastest = null;
    for (const [pid, a] of game.answers) {
      dist[a.choice]++;
      if (a.correct && (!fastest || a.elapsed < fastest.elapsed)) fastest = { name: game.players.get(pid)?.name, elapsed: a.elapsed };
    }
    base.reveal = { correct: q.correct, dist, fastest, correctCount: [...game.answers.values()].filter((a) => a.correct).length };
  }
  if (['leaderboard', 'final'].includes(game.phase)) base.leaderboard = ranking(game);
  if (game.phase === 'final') base.results = buildResults(game);
  return base;
}

function playerState(game, p) {
  const s = { pin: game.pin, title: game.quiz.title, phase: game.phase, name: p.name, score: p.score, total: game.quiz.questions.length, qIndex: game.qIndex, serverNow: Date.now() };
  if (game.phase === 'countdown') s.startsAt = game.countdownEndsAt;
  if (game.phase === 'question') {
    const q = publicQuestion(game);
    s.question = { index: q.index, total: q.total, text: q.text, image: q.image, options: q.options, time: q.time, endsAt: q.endsAt };
    const a = game.answers.get(p.id);
    s.answered = a ? a.choice : null;
  }
  if (['reveal', 'leaderboard', 'final'].includes(game.phase)) {
    const a = game.answers.get(p.id);
    const q = curQ(game);
    if (game.phase === 'reveal') {
      s.result = { answered: !!a, correct: !!(a && a.correct), points: a ? a.points : 0, correctText: q.options[q.correct], correctIndex: q.correct, streak: p.streak };
    }
    if (game.settings.showRank || game.phase === 'final') {
      const r = ranking(game);
      const me = r.find((x) => x.id === p.id);
      s.rank = me ? me.rank : null;
      s.of = r.length;
      if (me && me.rank > 1) { const ahead = r[me.rank - 2]; s.behind = { name: ahead.name, by: ahead.score - me.score }; }
    }
    if (game.phase === 'final') s.top3 = ranking(game).slice(0, 3).map((x) => ({ name: x.name, score: x.score }));
  }
  return s;
}

function buildResults(game) {
  return {
    questions: game.quiz.questions.map((q) => ({ text: q.text, options: q.options, correct: q.correct })),
    players: ranking(game).map((r) => {
      const p = game.players.get(r.id);
      return { ...r, answers: p.history };
    }),
  };
}

function broadcast(game) {
  hostOnly(game);
  for (const p of game.players.values()) {
    if (p.socketId && !p.kicked) io.to(p.socketId).emit('state', playerState(game, p));
  }
}
function hostOnly(game) {
  const st = hostState(game);
  if (game.hostSocket) io.to(game.hostSocket).emit('host:state', st);
  io.to('screen:' + game.pin).emit('host:state', st); // big-screen displays (view only)
}

// ---------- phase transitions ----------
function startCountdown(game) {
  game.phase = 'countdown';
  game.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  broadcast(game);
  clearTimeout(game.timer);
  game.timer = setTimeout(() => startQuestion(game), COUNTDOWN_MS);
}

function startQuestion(game) {
  const q = curQ(game);
  game.phase = 'question';
  game.answers = new Map();
  game.qStartedAt = Date.now();
  game.qEndsAt = game.qStartedAt + q.time * 1000;
  broadcast(game);
  clearTimeout(game.timer);
  game.timer = setTimeout(() => endQuestion(game), q.time * 1000 + 300); // small grace for network latency
}

function endQuestion(game) {
  if (game.phase !== 'question') return;
  clearTimeout(game.timer);
  const q = curQ(game);
  for (const p of game.players.values()) {
    if (p.kicked) continue;
    const a = game.answers.get(p.id);
    if (a && a.correct) {
      p.streak += 1; p.correctCount += 1; p.totalTime += a.elapsed;
    } else {
      p.streak = 0;
    }
    p.history[game.qIndex] = a ? { choice: a.choice, correct: a.correct, ms: a.elapsed, points: a.points } : null;
  }
  game.phase = 'reveal';
  broadcast(game);
}

function next(game) {
  switch (game.phase) {
    case 'lobby':
      if (!game.quiz.questions.length) return;
      game.qIndex = 0; startCountdown(game); break;
    case 'countdown': break;
    case 'question': endQuestion(game); break;
    case 'reveal':
      game.phase = game.qIndex >= game.quiz.questions.length - 1 ? 'final' : 'leaderboard';
      broadcast(game); break;
    case 'leaderboard':
      game.qIndex += 1; startCountdown(game); break;
    default: break;
  }
  game.touched = Date.now();
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  // HOST
  socket.on('host:create', (data, ack = () => {}) => {
    if (HOST_PASSWORD && data?.password !== HOST_PASSWORD) return ack({ ok: false, error: 'Wrong host password' });
    const settings = {
      timeLimit: data?.settings?.timeLimit || 20,
      speedScoring: data?.settings?.speedScoring !== false,
      shuffleQuestions: !!data?.settings?.shuffleQuestions,
      shuffleOptions: !!data?.settings?.shuffleOptions,
      showRank: data?.settings?.showRank !== false,
      requireId: !!data?.settings?.requireId,
      lateJoin: data?.settings?.lateJoin !== false,
    };
    const quiz = sanitizeQuiz(data?.quiz || {}, settings);
    if (!quiz.questions.length) return ack({ ok: false, error: 'Add at least one valid question (text, 2+ options, correct answer).' });
    const pin = newPin();
    const game = {
      pin, hostKey: rid(), hostSocket: socket.id, quiz, settings,
      phase: 'lobby', qIndex: -1, players: new Map(), answers: new Map(),
      timer: null, created: Date.now(), touched: Date.now(),
    };
    games.set(pin, game);
    socket.data.hostPin = pin;
    ack({ ok: true, pin, hostKey: game.hostKey });
    hostOnly(game);
  });

  socket.on('host:rejoin', ({ pin, hostKey } = {}, ack = () => {}) => {
    const game = games.get(String(pin));
    if (!game || game.hostKey !== hostKey) return ack({ ok: false });
    game.hostSocket = socket.id; socket.data.hostPin = game.pin;
    ack({ ok: true }); hostOnly(game);
  });

  // BIG SCREEN (view-only display for a TV/projector while the host controls from a phone)
  socket.on('screen:join', ({ pin } = {}, ack = () => {}) => {
    const game = games.get(String(pin || '').trim());
    if (!game) return ack({ ok: false, error: 'Game not found' });
    socket.join('screen:' + game.pin);
    ack({ ok: true });
    socket.emit('host:state', hostState(game));
  });

  const hostGame = () => { const g = games.get(socket.data.hostPin); return g && g.hostSocket === socket.id ? g : null; };

  socket.on('host:next', () => { const g = hostGame(); if (g) next(g); });
  socket.on('host:kick', ({ id } = {}) => {
    const g = hostGame(); if (!g) return;
    const p = g.players.get(id); if (!p) return;
    p.kicked = true;
    if (p.socketId) io.to(p.socketId).emit('kicked');
    broadcast(g);
  });
  socket.on('host:end', () => {
    const g = hostGame(); if (!g) return;
    clearTimeout(g.timer);
    for (const p of g.players.values()) if (p.socketId) io.to(p.socketId).emit('ended');
    io.to('screen:' + g.pin).emit('ended');
    games.delete(g.pin);
  });

  // PLAYER
  socket.on('player:join', ({ pin, name, staffId, playerId } = {}, ack = () => {}) => {
    const game = games.get(String(pin || '').trim());
    if (!game) return ack({ ok: false, error: 'Game not found. Check the PIN.' });
    // reconnect
    if (playerId && game.players.has(playerId)) {
      const p = game.players.get(playerId);
      if (p.kicked) return ack({ ok: false, error: 'You were removed from this game.' });
      p.socketId = socket.id; socket.data.pin = game.pin; socket.data.pid = p.id;
      ack({ ok: true, playerId: p.id });
      socket.emit('state', playerState(game, p)); hostOnly(game);
      return;
    }
    const nm = clean(name, 24);
    const sid = clean(staffId, 24);
    if (!nm) return ack({ ok: false, error: 'Enter your name.' });
    if (game.settings.requireId && !sid) return ack({ ok: false, error: 'Enter your staff ID.' });
    if (game.phase !== 'lobby' && !game.settings.lateJoin) return ack({ ok: false, error: 'The quiz has already started.' });
    const active = [...game.players.values()].filter((p) => !p.kicked);
    if (active.length >= MAX_PLAYERS) return ack({ ok: false, error: 'This game is full.' });
    const display = sid ? `${nm} (${sid})` : nm;
    if (active.some((p) => p.name.toLowerCase() === display.toLowerCase())) return ack({ ok: false, error: 'That name is taken — add an initial.' });
    const p = { id: rid(8), name: display, socketId: socket.id, score: 0, streak: 0, correctCount: 0, totalTime: 0, history: [], joinedAt: Date.now(), kicked: false };
    game.players.set(p.id, p);
    socket.data.pin = game.pin; socket.data.pid = p.id;
    ack({ ok: true, playerId: p.id });
    socket.emit('state', playerState(game, p));
    hostOnly(game);
  });

  socket.on('player:answer', ({ choice } = {}, ack = () => {}) => {
    const game = games.get(socket.data.pin);
    if (!game || game.phase !== 'question') return ack({ ok: false });
    const p = game.players.get(socket.data.pid);
    if (!p || p.kicked || game.answers.has(p.id)) return ack({ ok: false });
    const q = curQ(game);
    const c = parseInt(choice, 10);
    if (!(c >= 0 && c < q.options.length)) return ack({ ok: false });
    const now = Date.now();
    const elapsed = Math.min(now - game.qStartedAt, q.time * 1000); // measured on the server = fair
    const correct = c === q.correct;
    const points = correct ? pointsFor(elapsed, q.time * 1000, game.settings.speedScoring) : 0;
    p.score += points;
    game.answers.set(p.id, { choice: c, correct, elapsed, points });
    ack({ ok: true });
    hostOnly(game); // live "answered" counter
    const activeOnline = [...game.players.values()].filter((x) => !x.kicked && x.socketId).length;
    if (game.answers.size >= activeOnline) endQuestion(game); // everyone answered → reveal now
  });

  socket.on('disconnect', () => {
    const game = games.get(socket.data.pin);
    if (game) {
      const p = game.players.get(socket.data.pid);
      if (p && p.socketId === socket.id) { p.socketId = null; hostOnly(game); }
    }
  });
});

// clean up games idle for 6 hours
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600 * 1000;
  for (const [pin, g] of games) if (g.touched < cutoff) { clearTimeout(g.timer); games.delete(pin); }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`StaffQuiz Live running on http://localhost:${PORT}`);
  console.log(`  Host screen:   http://localhost:${PORT}/host`);
  console.log(`  Players join:  http://localhost:${PORT}/`);
});
