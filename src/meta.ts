/* =====================================================================
   META — мета-прогрессия: лучший забег, золото, перм-апгрейды,
   разблокировки, кодекс. Хранится в localStorage (lumen_meta).
   Вынесено из main для разрыва цикла зависимостей с bootstrap.
   ===================================================================== */

import { CONFIG } from './config';

export const Meta: any = {
  data: { best: 0, gold: 0, upgrades: {}, volume: 0.7,
          maxDepth: 0, unlocks: {}, codex: {}, totalKills: 0 },
  load() {
    try {
      const s = localStorage.getItem('lumen_meta');
      if (s) this.data = Object.assign(this.data, JSON.parse(s));
    } catch (e) {}
    if (!this.data.upgrades) this.data.upgrades = {};
    if (!this.data.unlocks)  this.data.unlocks = {};
    if (!this.data.codex)    this.data.codex = {};
    if (this.data.maxDepth == null)  this.data.maxDepth = 0;
    if (this.data.totalKills == null) this.data.totalKills = 0;
  },
  save() { try { localStorage.setItem('lumen_meta', JSON.stringify(this.data)); } catch (e) {} },
  recordBest(time: number) { if (time > this.data.best) this.data.best = time; },

  // Контент заперт, только если он есть в CONFIG.unlocks и веха ещё не взята.
  // Всё, чего нет в списке разблокировок, доступно по умолчанию.
  isUnlocked(key: string) {
    const u = CONFIG.unlocks.find((x: any) => x.key === key);
    if (!u) return true;
    return !!(this.data.unlocks && this.data.unlocks[key]);
  },

  // Подвести итог забега: рекорд, киллы, кодекс, открыть следующую глубину,
  // проверить вехи разблокировок. Возвращает имена только что открытого.
  recordRun(stats: any) {
    if (!this.data.unlocks) this.data.unlocks = {};
    if (!this.data.codex)   this.data.codex = {};
    if (this.data.maxDepth == null)   this.data.maxDepth = 0;
    if (this.data.totalKills == null) this.data.totalKills = 0;
    this.recordBest(stats.time);
    this.data.totalKills += stats.kills || 0;
    if (stats.seen) for (const k of stats.seen) this.data.codex[k] = (this.data.codex[k] || 0) + 1;
    if (stats.won) {
      const next = (stats.depth || 0) + 1;
      if (next > this.data.maxDepth && next <= CONFIG.depths.length) this.data.maxDepth = next;
    }
    const freshly: any[] = [];
    for (const u of CONFIG.unlocks) {
      if (this.data.unlocks[u.key]) continue;
      const c = u.cond;
      const ok =
        (c.survive    != null && stats.time   >= c.survive) ||
        (c.level      != null && stats.level  >= c.level) ||
        (c.totalKills != null && this.data.totalKills >= c.totalKills) ||
        (c.killBoss   === true && stats.killedBoss) ||
        (c.win        === true && stats.won) ||
        (c.depth      != null && (stats.depth || 0) >= c.depth);
      if (ok) { this.data.unlocks[u.key] = true; freshly.push(u.key); }
    }
    this.save();
    return freshly;
  },

  upgLevel(key: string) { return this.data.upgrades[key] || 0; },
  upgCost(key: string) {
    const u = CONFIG.shop.find((s: any) => s.key === key);
    const lv = this.upgLevel(key);
    return (lv >= u.max) ? null : u.cost[lv];
  },
  buy(key: string) {
    const c = this.upgCost(key);
    if (c == null || this.data.gold < c) return false;
    this.data.gold -= c;
    this.data.upgrades[key] = this.upgLevel(key) + 1;
    this.save();
    return true;
  },
};
