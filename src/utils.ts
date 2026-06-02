/* =====================================================================
   UTILS — математика, рандом, пулинг
   ===================================================================== */

import { CONFIG } from './config';

export const TAU = Math.PI * 2;

/* Сидируемый PRNG (mulberry32) — детерминизм для автотестов.
   Весь геймплейный рандом идёт через RNG.next(); сид задаётся в main.js
   (?seed=N или Date.now()). Аудио-шум намеренно не детерминируется. */
export const RNG = {
  _s: 1,
  seed(n: number) { this._s = (n >>> 0) || 1; },
  next() {
    let t = (this._s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
};

// определение оружия по ключу — базовое или эволюционировавшее
export function weaponDef(key: string) { return CONFIG.weapons[key] || CONFIG.evolutions[key]; }

export function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : (v > hi ? hi : v); }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function rand(a = 1, b?: number) { return b === undefined ? RNG.next() * a : a + RNG.next() * (b - a); }
export function randInt(a: number, b: number) { return Math.floor(rand(a, b + 1)); }
export function pick(arr: any[]) { return arr[(RNG.next() * arr.length) | 0]; }
export function chance(p: number) { return RNG.next() < p; }

export function dist2(ax: number, ay: number, bx: number, by: number) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function dist(ax: number, ay: number, bx: number, by: number) { return Math.sqrt(dist2(ax, ay, bx, by)); }
export function angleTo(ax: number, ay: number, bx: number, by: number) { return Math.atan2(by - ay, bx - ax); }

// Взвешенный выбор ключа по объекту {key: weight}
export function weightedPick(weights: any) {
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
export function sampleN(arr: any[], n: number) {
  const a = arr.slice();
  const out: any[] = [];
  n = Math.min(n, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + ((RNG.next() * (a.length - i)) | 0);
    const t = a[i]; a[i] = a[j]; a[j] = t;
    out.push(a[i]);
  }
  return out;
}

// Двигаться от (x,y) к (tx,ty) со скоростью speed*dt, вернуть {x,y}
export function moveToward(x: number, y: number, tx: number, ty: number, step: number) {
  const dx = tx - x, dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= step || d === 0) return { x: tx, y: ty, dx: 0, dy: 0 };
  const nx = dx / d, ny = dy / d;
  return { x: x + nx * step, y: y + ny * step, dx: nx, dy: ny };
}

/* Простой пул объектов: фабрика создаёт, reset переинициализирует.
   Активные хранятся в .active, мёртвые — в .free. */
export class Pool {
  factory: () => any;
  active: any[] = [];
  free: any[] = [];
  constructor(factory: () => any) {
    this.factory = factory;
    this.active = [];
    this.free = [];
  }
  spawn(initFn?: (o: any) => void) {
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

export function fmtTime(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const m = (sec / 60) | 0;
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
