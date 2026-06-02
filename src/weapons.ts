/* =====================================================================
   WEAPONS — поведение оружия. Спавнит снаряды / наносит AoE-урон.
   Урон по врагам идёт через Game.hitEnemy (там же смерть/дроп/партиклы).
   ===================================================================== */

import { CONFIG } from './config';
import { weaponDef, angleTo, rand, TAU, dist2 } from './utils';
import { Game } from './game';
import { Audio2 } from './audio';

export const Weapons: any = {
  update(player: any, dt: number) {
    for (const w of player.weapons) {
      const def = weaponDef(w.key);
      const lvl = w.level - 1;
      if (def.kind === 'orbit') { this._orbit(player, w, def, lvl, dt); continue; }
      if (def.kind === 'beam')  { this._beam(player, w, def, lvl, dt); continue; }
      w.timer -= dt;
      if (w.timer <= 0) {
        w.timer += def.cooldown[lvl];
        if (def.kind === 'bolt') this._bolt(player, w, def, lvl);
        else if (def.kind === 'nova') this._nova(player, w, def, lvl);
        else if (def.kind === 'whip') this._whip(player, w, def, lvl);
        else if (def.kind === 'chain') this._chain(player, w, def, lvl);
        else if (def.kind === 'mine') this._mine(player, w, def, lvl);
        else if (def.kind === 'lantern') this._lantern(player, w, def, lvl);
        else if (def.kind === 'ricochet') this._ricochet(player, w, def, lvl);
      }
    }
  },

  _dmg(player: any, def: any, lvl: number) { return def.dmg[lvl] * player.damageMult; },

  _bolt(player: any, w: any, def: any, lvl: number) {
    const count = def.count[lvl];
    const targets = Game.nearestEnemies(player.x, player.y, count, 900);
    for (let i = 0; i < count; i++) {
      const t = targets[i];
      let ang;
      if (t) ang = angleTo(player.x, player.y, t.x, t.y);
      else ang = player.lastDir ? Math.atan2(player.lastDir.y, player.lastDir.x) : rand(0, TAU);
      // Сумеречный клинок: чем меньше радиус света, тем больнее удар
      let dmgv = this._dmg(player, def, lvl);
      if (def.edgeBonus) dmgv *= 1 + def.edgeBonus * (1 - player.light / CONFIG.light.max);
      Game.projectiles.spawn((p: any) => {
        p.x = player.x; p.y = player.y;
        p.vx = Math.cos(ang) * def.speed;
        p.vy = Math.sin(ang) * def.speed;
        p.dmg = dmgv;
        p.radius = def.radius;
        p.life = def.life;
        p.pierce = def.pierce;
        p.color = def.color;
        p.kind = 'bolt';
        p.knockback = def.knockback;
        p.hitIds = null;
        p.hostile = false;          // пул переиспользует объекты от вражеских выстрелов — сбросить
        p.target = t || null;
        p.angle = ang;
      });
    }
    Audio2.shoot();
  },

  _orbit(player: any, w: any, def: any, lvl: number, dt: number) {
    w.orbAngle = (w.orbAngle + def.orbitSpeed * dt) % TAU;
    const count = def.count[lvl];
    const dmg = this._dmg(player, def, lvl);
    w._nodes = w._nodes || [];
    for (let i = 0; i < count; i++) {
      const a = w.orbAngle + i * TAU / count;
      const ox = player.x + Math.cos(a) * def.orbitRadius;
      const oy = player.y + Math.sin(a) * def.orbitRadius;
      w._nodes[i] = { x: ox, y: oy };
      // урон по перекрытию (с индивидуальным кулдауном врага)
      for (const e of Game.enemies.active) {
        if (e.dead) continue;
        const rr = (def.radius + e.radius);
        if (dist2(ox, oy, e.x, e.y) <= rr * rr && e.hitCd <= 0) {
          e.hitCd = def.tick;
          Game.hitEnemy(e, dmg, def.knockback, ox, oy);
        }
      }
    }
    w._nodeCount = count;
  },

  _nova(player: any, w: any, def: any, lvl: number) {
    const r = def.novaRadius[lvl];
    const dmg = this._dmg(player, def, lvl);
    const r2 = r * r;
    for (const e of Game.enemies.active) {
      if (e.dead) continue;
      if (dist2(player.x, player.y, e.x, e.y) <= (r + e.radius) * (r + e.radius)) {
        Game.hitEnemy(e, dmg, def.knockback, player.x, player.y);
      }
    }
    Game.effects.push({ kind: 'nova', x: player.x, y: player.y, r: 0, maxR: r,
                        life: 0.4, maxLife: 0.4, color: def.color });
    // Рассветная вспышка: радиус света вспыхивает до максимума и держится ~2с
    if (def.lightBurst) { player.light = CONFIG.light.max; player._lightFloor = CONFIG.light.max; player._lightFloorT = 2; }
    Game.addShake(CONFIG.feel.shakeOnNova);
    Audio2.nova();
  },

  _whip(player: any, w: any, def: any, lvl: number) {
    const len = def.whipLen[lvl];
    const wide = def.whipWide;
    const dmg = this._dmg(player, def, lvl);
    const count = def.count[lvl];
    // радиальный (эволюция) — во все стороны; иначе по движению (+ назад при count>1)
    let dirs;
    if (def.radial) {
      dirs = [];
      for (let i = 0; i < count; i++) dirs.push(i * TAU / count);
    } else {
      dirs = [Math.atan2(player.lastDir.y, player.lastDir.x)];
      if (count > 1) dirs.push(dirs[0] + Math.PI);
    }
    for (const ang of dirs) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (const e of Game.enemies.active) {
        if (e.dead) continue;
        // проекция на ось удара
        const rx = e.x - player.x, ry = e.y - player.y;
        const proj = rx * dx + ry * dy;
        if (proj < 0 || proj > len + e.radius) continue;
        const perp = Math.abs(rx * -dy + ry * dx);
        if (perp > wide + e.radius) continue;
        Game.hitEnemy(e, dmg, def.knockback, player.x, player.y);
      }
      Game.effects.push({ kind: 'whip', x: player.x, y: player.y, ang, len, wide,
                          life: 0.18, maxLife: 0.18, color: def.color });
    }
    Audio2.shoot();
  },

  _chain(player: any, w: any, def: any, lvl: number) {
    const dmg = this._dmg(player, def, lvl);
    const maxHops = def.count[lvl];
    let cur = Game.nearestEnemy(player.x, player.y, def.firstRange);
    if (!cur) return;
    const hit = new Set();
    const pts = [{ x: player.x, y: player.y }];
    let fx = player.x, fy = player.y;
    for (let h = 0; h < maxHops && cur; h++) {
      hit.add(cur);
      Game.hitEnemy(cur, dmg, def.knockback, fx, fy);
      pts.push({ x: cur.x, y: cur.y });
      fx = cur.x; fy = cur.y;
      let next = null, bd = def.hopRange * def.hopRange;
      for (const e of Game.enemies.active) {
        if (e.dead || hit.has(e)) continue;
        const d = dist2(fx, fy, e.x, e.y);
        if (d < bd) { bd = d; next = e; }
      }
      cur = next;
    }
    Game.effects.push({ kind: 'chain', pts, life: 0.16, maxLife: 0.16, color: def.color });
    Audio2.shoot();
  },

  // Луч-маяк: непрерывный луч(и) в ближайших, урон тиками вдоль линии
  _beam(player: any, w: any, def: any, lvl: number, dt: number) {
    const count = def.count[lvl];
    const len = def.beamLen[lvl];
    const wide = def.beamWide;
    const targets = Game.nearestEnemies(player.x, player.y, count, len + 140);
    w._beams = [];
    for (let i = 0; i < count; i++) {
      const t = targets[i];
      let ang;
      if (t) ang = angleTo(player.x, player.y, t.x, t.y);
      else if (i === 0) ang = player.lastDir ? Math.atan2(player.lastDir.y, player.lastDir.x) : 0;
      else ang = (w._beams[0] ? w._beams[0].ang : 0) + i * 0.6;
      w._beams.push({ ang, len });
    }
    w._beamTick = (w._beamTick || 0) - dt;
    if (w._beamTick > 0) return;
    w._beamTick += def.tick;
    const dmg = this._dmg(player, def, lvl);
    for (const b of w._beams) {
      const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
      for (const e of Game.enemies.active) {
        if (e.dead) continue;
        const rx = e.x - player.x, ry = e.y - player.y;
        const proj = rx * dx + ry * dy;
        if (proj < 0 || proj > len + e.radius) continue;
        const perp = Math.abs(rx * -dy + ry * dx);
        if (perp > wide + e.radius) continue;
        Game.hitEnemy(e, dmg, def.knockback, player.x, player.y);
      }
    }
  },

  // Отражённый луч: снаряд, отскакивающий от кромки тьмы (см. Game.updateRicochet)
  _ricochet(player: any, w: any, def: any, lvl: number) {
    const count = def.count[lvl];
    const targets = Game.nearestEnemies(player.x, player.y, count, 720);
    for (let i = 0; i < count; i++) {
      const t = targets[i];
      const ang = t ? angleTo(player.x, player.y, t.x, t.y)
                    : (player.lastDir ? Math.atan2(player.lastDir.y, player.lastDir.x) : rand(0, TAU));
      Game.projectiles.spawn((p: any) => {
        p.x = player.x; p.y = player.y;
        p.vx = Math.cos(ang) * def.speed; p.vy = Math.sin(ang) * def.speed;
        p.dmg = this._dmg(player, def, lvl);
        p.radius = def.radius; p.life = def.life; p.color = def.color;
        p.kind = 'ricochet'; p.knockback = def.knockback;
        p.bounces = def.bounces[lvl]; p.bounceGain = def.bounceGain;
        p.hitIds = null; p.angle = ang; p.pierce = 0; p.hostile = false;
      });
    }
    Audio2.shoot();
  },

  // Пульс-фонарь: ставит стоячий источник света — свет-зону (см. Game.updateLantern)
  _lantern(player: any, w: any, def: any, lvl: number) {
    const count = def.count[lvl];
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), r = count > 1 ? rand(20, 60) : 0;
      Game.projectiles.spawn((p: any) => {
        p.x = player.x + Math.cos(a) * r; p.y = player.y + Math.sin(a) * r;
        p.vx = 0; p.vy = 0; p.kind = 'lantern';
        p.radius = def.lanternRadius[lvl];
        p.life = def.lanternLife[lvl]; p.maxLife = p.life;
        p.dmg = def.tickDmg[lvl] * player.damageMult;
        p.tick = def.tick; p.tickTimer = def.tick;
        p.slowMul = def.slow; p.color = def.color;
        p.hostile = false; p.hitIds = null;
      });
    }
    Audio2.nova();
  },

  _mine(player: any, w: any, def: any, lvl: number) {
    const count = def.count[lvl];
    const dmg = this._dmg(player, def, lvl);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), r = count > 1 ? rand(24, 66) : 0;
      Game.projectiles.spawn((p: any) => {
        p.x = player.x + Math.cos(a) * r; p.y = player.y + Math.sin(a) * r;
        p.vx = 0; p.vy = 0; p.kind = 'mine';
        p.dmg = dmg; p.color = def.color; p.radius = def.mineRadius;
        p.trigger = def.mineTrigger; p.life = def.mineLife;
        p.knockback = def.knockback; p.hostile = false; p.hitIds = null;
      });
    }
  },
};
