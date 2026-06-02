/* =====================================================================
   SPAWNER — спавн врагов по кривой эскалации (CONFIG.phases).
   Спавнит за краем видимой области вокруг игрока. Боссы по таймеру.
   ===================================================================== */

import { CONFIG } from './config';
import { clamp, rand, randInt, chance, weightedPick, TAU } from './utils';
import { Game } from './game';
import { Audio2 } from './audio';

export const Spawner: any = {
  timer: 0,
  bossesSpawned: 0,

  reset() { this.timer = 0; this.bossesSpawned = 0; },

  currentPhase(t: number) {
    let ph = CONFIG.phases[0];
    for (const p of CONFIG.phases) if (t >= p.tStart) ph = p;
    return ph;
  },

  update(dt: number, t: number) {
    // боссы
    if (this.bossesSpawned < CONFIG.bossTimes.length &&
        t >= CONFIG.bossTimes[this.bossesSpawned]) {
      this.spawnBoss(t);
      this.bossesSpawned++;
    }

    const ph = this.currentPhase(t);
    if (Game.enemies.active.length >= ph.cap) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += ph.spawnInterval;

    const weights = this.effectiveWeights(ph);
    const n = Math.min(ph.batch, ph.cap - Game.enemies.active.length);
    for (let i = 0; i < n; i++) {
      const key = weightedPick(weights);
      this.spawnEnemy(key, ph);
    }
  },

  // веса фазы, помноженные на weightMul активных аномалий (Прилив роя, Голод…)
  effectiveWeights(ph: any) {
    const wm = Game.runMods && Game.runMods.weightMul;
    if (!wm) return ph.weights;
    let touched = false;
    const out: any = {};
    for (const k in ph.weights) {
      out[k] = ph.weights[k] * (wm[k] || 1);
      if (wm[k]) touched = true;
    }
    return touched ? out : ph.weights;
  },

  // позиция за пределами видимой области вокруг игрока.
  // Против кайтинга: с долей bias спавним В СТОРОНУ движения (засада спереди) —
  // бегство приводит к свежим врагам. bias=0 первые 60с (мягкое обучение), затем растёт.
  edgePos() {
    const margin = 60;
    const hw = Game.viewW / 2 + margin;
    const hh = Game.viewH / 2 + margin;
    const cx = Game.player.x, cy = Game.player.y;
    const bias = clamp((Game.time - 60) / 120, 0, 0.65);
    const ld = Game.player.lastDir || { x: 0, y: 0 };
    if ((ld.x || ld.y) && chance(bias)) {
      const base = Math.atan2(ld.y, ld.x);
      const a = base + rand(-0.9, 0.9);               // сектор спереди ±~50°
      const rad = Math.hypot(hw, hh) + 20;            // гарантированно за кадром при любом угле
      return { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad };
    }
    const side = randInt(0, 3);
    if (side === 0) return { x: cx + rand(-hw, hw), y: cy - hh };
    if (side === 1) return { x: cx + rand(-hw, hw), y: cy + hh };
    if (side === 2) return { x: cx - hw, y: cy + rand(-hh, hh) };
    return { x: cx + hw, y: cy + rand(-hh, hh) };
  },

  spawnEnemy(key: string, ph: any) {
    const pos = this.edgePos();
    this.spawnTypeAt(key, pos.x, pos.y, ph, false);
  },

  // единая инициализация врага: фаза × модификаторы забега (глубина+аномалии).
  // Используется и волнами, и при разделении Дробителя (isChild=true).
  spawnTypeAt(key: string, x: number, y: number, ph: any, isChild: boolean) {
    const def = CONFIG.enemies[key];
    const rm = Game.runMods || { hp: 1, spd: 1, dmg: 1 };
    Game.enemies.spawn((e: any) => {
      e.typeKey = key;
      e.x = x; e.y = y;
      e.kx = 0; e.ky = 0;
      e.maxHp = def.hp * ph.hpMult * rm.hp;
      e.hp = e.maxHp;
      e.radius = def.radius;
      e.speed = def.speed * ph.spdMult * rm.spd;
      e.damage = def.damage * ph.dmgMult * rm.dmg;
      e.color = def.color;
      e.shape = def.shape;
      e.xp = def.xp;
      e.bigGem = !!def.bigGem;
      e.score = def.score;
      e.isBoss = false;
      e.flash = 0; e.hitCd = 0; e.dmgCd = 0; e.slowT = 0;
      e.wob = rand(0, TAU);
      e.isChild = !!isChild;
      // свет-механики
      e.drainLight = def.drainLight || 0;
      e.drainRange = def.drainRange || 0;
      e.split = (def.split && !isChild) ? def.split : null;   // осколки не делятся дальше
      e.splitCount = def.splitCount || 0;
      e.anchorOnDeath = !!def.anchorOnDeath;
      e.anchorRadius = def.anchorRadius || 0;
      e.anchorLife = def.anchorLife || 0;
      e.suppressLight = !!def.suppressLight;
      e.suppressRange = def.suppressRange || 0;
      e.ring = false; e.ringTimer = 0;
      e.bossKind = null; e.bossPhase = 0;
      // дальник: параметры стрельбы
      e.ranged = !!def.ranged;
      if (def.ranged) {
        e.shotDmg = def.shotDmg * ph.dmgMult * rm.dmg;
        e.shotSpeed = def.shotSpeed;
        e.shotCd = def.shotCd;
        e.shotRange = def.shotRange;
        e.shotRadius = def.shotRadius;
        e.shotTimer = def.shotCd * (0.5 + rand(0, 0.5));   // рассинхрон залпов
      }
    });
  },

  // ростер боссов по глубине: глубже — новые владыки тьмы
  bossKey(idx: number, depth: number) {
    if (depth >= 3) return idx === 0 ? 'boss3' : 'boss4';
    if (depth >= 1) return idx === 0 ? 'boss2' : 'boss3';
    return idx === 0 ? 'boss' : 'boss2';
  },

  spawnBoss(t: number) {
    const idx = this.bossesSpawned;
    const rm = Game.runMods || { hp: 1, dmg: 1, depth: 0 };
    const key = this.bossKey(idx, rm.depth || 0);
    const def = CONFIG.enemies[key];
    const pos = this.edgePos();
    Game.enemies.spawn((e: any) => {
      e.typeKey = key;
      e.x = pos.x; e.y = pos.y;
      e.kx = 0; e.ky = 0;
      e.maxHp = def.hp * rm.hp;          // боссы крепнут с глубиной
      e.hp = e.maxHp;
      e.radius = def.radius;
      e.speed = def.speed;
      e.damage = def.damage * rm.dmg;
      e.color = def.color;
      e.shape = def.shape;
      e.xp = def.xp;
      e.bigGem = true;
      e.score = def.score;
      e.isBoss = true;
      e.ranged = false;
      e.flash = 0; e.hitCd = 0; e.dmgCd = 0; e.slowT = 0; e.slowMul = 1;
      // свет-механики боссов (Владыка Затмения / Нулевая Точка)
      e.drainLight = def.drainLight || 0;
      e.drainRange = def.drainRange || 0;
      e.split = null; e.splitCount = 0;
      e.anchorOnDeath = !!def.anchorOnDeath;
      e.anchorRadius = def.anchorRadius || 0;
      e.anchorLife = def.anchorLife || 0;
      e.suppressLight = false; e.suppressRange = 0;
      e.ring = !!def.ring;
      e.ringCd = def.ringCd || 0; e.ringTimer = def.ringCd || 0;
      e.ringShots = def.ringShots || 0; e.ringSpeed = def.ringSpeed || 0;
      e.ringDmg = (def.ringDmg || 0) * rm.dmg; e.ringRadius = def.ringRadius || 6;
      e.bossKind = key; e.bossPhase = 0;
      e.wob = 0;
    });
    Game.bossActive = true;
    Game.banner('⚠ ' + def.name.toUpperCase() + ' ⚠', 2.4);
    Game.addShake(12);
    Audio2.boss();
  },
};
