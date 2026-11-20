// Shared helpers for host and player screens
const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let clockOffset = 0; // serverTime - localTime
function syncClock(serverNow) { if (serverNow) clockOffset = serverNow - Date.now(); }
const serverNow = () => Date.now() + clockOffset;

function toast(msg, ms = 2200) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}

// Countdown ring. Returns a stop() function.
function runTimer(el, endsAt, totalSec, onTick) {
  const R = 42, C = 2 * Math.PI * R;
  el.innerHTML = `<svg width="96" height="96"><circle cx="48" cy="48" r="${R}" stroke="rgba(255,255,255,.12)" stroke-width="8" fill="none"/>
    <circle class="arc" cx="48" cy="48" r="${R}" stroke="var(--accent)" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div class="num"></div>`;
  const arc = $('.arc', el), num = $('.num', el);
  let raf;
  const tick = () => {
    const left = Math.max(0, endsAt - serverNow());
    const frac = left / (totalSec * 1000);
    arc.style.strokeDashoffset = C * (1 - frac);
    arc.style.stroke = frac < 0.25 ? 'var(--bad)' : 'var(--accent)';
    num.textContent = Math.ceil(left / 1000);
    if (onTick) onTick(left, frac);
    if (left > 0) raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

// Lightweight confetti
function confetti(duration = 4000) {
  let c = $('#confetti');
  if (!c) { c = document.createElement('canvas'); c.id = 'confetti'; document.body.appendChild(c); }
  const ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#ffcc33', '#e8384f', '#2f7cf6', '#22a85a', '#9b51e0', '#14b8c4', '#ffffff'];
  const parts = Array.from({ length: 220 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.6,
    w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4, col: colors[(Math.random() * colors.length) | 0],
  }));
  const end = Date.now() + duration;
  (function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (Date.now() < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
  })();
}

function beep(freq = 660, ms = 120) {
  try {
    const a = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(0.08, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
    o.start(); o.stop(a.currentTime + ms / 1000);
  } catch (e) { /* audio not available */ }
}
