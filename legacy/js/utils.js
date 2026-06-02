/* =====================================================================
   UTILS — математика, рандом, пулинг
   ===================================================================== */

const TAU = Math.PI * 2;

/* Сидируемый PRNG (mulberry32) — детерминизм для автотестов.
   Весь геймплейный рандом идёт через RNG.next(); сид задаётся в main.js
   (?seed=N или Date.now()). Аудио-шум намеренно не детерминируется. */
const RNG = {
  _s: 1,
  seed(n) { this._s = (n >>> 0) || 1; },
  next() {
    let t = (this._s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
};

// определение оружия по ключу — базовое или эволюционировавшее
function weaponDef(key) { return CONFIG.weapons[key] || CONFIG.evolutions[key]; }

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a = 1, b) { return b === undefined ? RNG.next() * a : a + RNG.next() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[(RNG.next() * arr.length) | 0]; }
function chance(p) { return RNG.next() < p; }

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// Взвешенный выбор ключа по объекту {key: weight}
function weightedPick(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = RNG.next() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  // фолбэк
  for (const k in weights) return k;
}

// Перемешать N различных элементов массива (Fisher-Yates, частичный)
function sampleN(arr, n) {
  const a = arr.slice();
  const out = [];
  n = Math.min(n, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + ((RNG.next() * (a.length - i)) | 0);
    const t = a[i]; a[i] = a[j]; a[j] = t;
    out.push(a[i]);
  }
  return out;
}

// Двигаться от (x,y) к (tx,ty) со скоростью speed*dt, вернуть {x,y}
function moveToward(x, y, tx, ty, step) {
  const dx = tx - x, dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= step || d === 0) return { x: tx, y: ty, dx: 0, dy: 0 };
  const nx = dx / d, ny = dy / d;
  return { x: x + nx * step, y: y + ny * step, dx: nx, dy: ny };
}

/* Простой пул объектов: фабрика создаёт, reset переинициализирует.
   Активные хранятся в .active, мёртвые — в .free. */
class Pool {
  constructor(factory) {
    this.factory = factory;
    this.active = [];
    this.free = [];
  }
  spawn(initFn) {
    let o = this.free.pop();
    if (!o) o = this.factory();
    o.dead = false;
    if (initFn) initFn(o);
    this.active.push(o);
    return o;
  }
  // Удалить мёртвые из active в free (вызывать раз за кадр)
  sweep() {
    const a = this.active;
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      const o = a[i];
      if (o.dead) { this.free.push(o); }
      else { a[w++] = o; }
    }
    a.length = w;
  }
  clear() {
    for (const o of this.active) { o.dead = true; this.free.push(o); }
    this.active.length = 0;
  }
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = (sec / 60) | 0;
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
