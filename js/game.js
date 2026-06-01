/* =====================================================================
   GAME — состояние, апдейт, рендер, коллизии. Центр всего.
   Состояния: menu | playing | levelup | paused | gameover | win
   ===================================================================== */

const Game = {
  state: 'menu',
  player: null,
  enemies: null, projectiles: null, pickups: null, particles: null, dmgNumbers: null,
  effects: [],
  time: 0,
  score: 0,
  viewW: 960, viewH: 600,
  camera: { x: 0, y: 0 },
  shake: 0, shakeX: 0, shakeY: 0,
  bannerText: '', bannerTime: 0, bannerMax: 1,
  pendingLevels: 0,
  offers: [],
  selIndex: 0,
  bossActive: false,
  started: false,
  selectedChar: 'spark',
  charIndex: 0,
  shopIndex: 0,
  runGold: 0,

  init() {
    this.enemies = new Pool(makeEnemy);
    this.projectiles = new Pool(makeProj);
    this.pickups = new Pool(makePickup);
    this.particles = new Pool(makeParticle);
    this.dmgNumbers = new Pool(makeDmgNum);
    this.player = new Player();
  },

  start() {
    const char = CONFIG.characters[this.selectedChar] ? this.selectedChar : 'spark';
    this.player.reset(char);
    this.player.addWeapon(CONFIG.characters[char].start);   // стартовое оружие персонажа
    this.player.recalc();
    this.enemies.clear(); this.projectiles.clear(); this.pickups.clear();
    this.particles.clear(); this.dmgNumbers.clear();
    this.effects.length = 0;
    this.time = 0; this.score = 0;
    this.shake = 0; this.bannerTime = 0;
    this.pendingLevels = 0; this.offers = [];
    this.bossActive = false;
    Spawner.reset();
    this.state = 'playing';
    this.started = true;
    Audio2.ensure(); Audio2.resume(); Audio2.startMusic();
  },

  // ----------------------------- UPDATE -----------------------------
  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    if (this.time >= CONFIG.runDuration) { this.win(); return; }

    this.updatePlayer(dt);
    Spawner.update(dt, this.time);
    Weapons.update(this.player, dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateDmgNumbers(dt);
    this.updateEffects(dt);

    // shake decay
    if (this.shake > 0) this.shake = Math.max(0, this.shake - CONFIG.feel.shakeDecay * dt);
    if (this.bannerTime > 0) this.bannerTime -= dt;

    this.enemies.sweep(); this.projectiles.sweep(); this.pickups.sweep();
    this.particles.sweep(); this.dmgNumbers.sweep();

    // драфт по накопленным уровням
    if (this.pendingLevels > 0 && this.state === 'playing') this.openDraft();
  },

  updatePlayer(dt) {
    const p = this.player;
    const mv = Input.moveVector();
    p.vx = mv.x * p.moveSpeed;
    p.vy = mv.y * p.moveSpeed;
    if (mv.x || mv.y) { p.lastDir.x = mv.x; p.lastDir.y = mv.y; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.flash > 0) p.flash -= dt;
    // свет: цель растёт с уровнем; восстанавливается после проседаний от урона
    const L = CONFIG.light;
    const target = clamp(L.base + (p.level - 1) * L.perLevel + (p._charLightBonus || 0), L.min, L.max);
    if (p.light < target) p.light = Math.min(target, p.light + L.recover * dt);
    else if (p.light > target) p.light = target;
    if (p.light < L.min) p.light = L.min;
    this.camera.x = p.x; this.camera.y = p.y;
  },

  updateEnemies(dt) {
    const p = this.player;
    const list = this.enemies.active;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      if (e.dmgCd > 0) e.dmgCd -= dt;
      // движение к игроку
      const a = angleTo(e.x, e.y, p.x, p.y);
      let sp = e.speed;
      // твист: вне света враги быстрее (рвутся из теней)
      if (!e.isBoss && dist2(e.x, e.y, p.x, p.y) > p.light * p.light) sp *= CONFIG.light.darkSpeedMult;
      const d2p = dist2(e.x, e.y, p.x, p.y);
      // дальник тормозит в дистанции боя, чтобы держать позицию и стрелять
      if (e.ranged && d2p < (e.shotRange * 0.75) * (e.shotRange * 0.75)) sp *= 0.25;
      let mvx = Math.cos(a) * sp, mvy = Math.sin(a) * sp;
      e.x += (mvx + e.kx) * dt;
      e.y += (mvy + e.ky) * dt;
      // затухание нокбэка
      const fr = Math.exp(-10 * dt);
      e.kx *= fr; e.ky *= fr;

      // дальник стреляет по игроку
      if (e.ranged) {
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && d2p <= e.shotRange * e.shotRange) {
          e.shotTimer = e.shotCd;
          const sa = angleTo(e.x, e.y, p.x, p.y);
          this.projectiles.spawn((pr) => {
            pr.x = e.x; pr.y = e.y;
            pr.vx = Math.cos(sa) * e.shotSpeed; pr.vy = Math.sin(sa) * e.shotSpeed;
            pr.kind = 'eshot'; pr.hostile = true; pr.dmg = e.shotDmg;
            pr.color = '#c08bff'; pr.radius = e.shotRadius; pr.life = 3; pr.hitIds = null;
          });
        }
      }

      // контакт с игроком
      const rr = e.radius + p.radius;
      if (dist2(e.x, e.y, p.x, p.y) <= rr * rr) {
        if (p.invuln <= 0) {
          p.hp -= e.damage;
          p.invuln = CONFIG.player.iframes;
          p.flash = 0.12;
          p.light = Math.max(CONFIG.light.min, p.light - CONFIG.light.hitLoss); // тьма наступает
          this.addShake(CONFIG.feel.shakeOnHit);
          Audio2.hurt();
          // оттолкнуть врага
          const ka = angleTo(p.x, p.y, e.x, e.y);
          e.kx += Math.cos(ka) * CONFIG.player.contactKnockback;
          e.ky += Math.sin(ka) * CONFIG.player.contactKnockback;
          if (p.hp <= 0) { p.hp = 0; this.gameOver(); return; }
        }
      }
    }
    this.separateEnemies();
  },

  // лёгкое расталкивание, чтобы враги не схлопывались в точку (по сетке)
  separateEnemies() {
    const list = this.enemies.active;
    const N = list.length;
    if (N < 2) return;
    const cell = 36;
    const grid = this._grid || (this._grid = new Map());
    grid.clear();
    for (let i = 0; i < N; i++) {
      const e = list[i];
      if (e.dead || e.isBoss) continue;
      const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell);
      const key = cx + ',' + cy;
      let arr = grid.get(key);
      if (!arr) { arr = []; grid.set(key, arr); }
      arr.push(e);
    }
    for (let i = 0; i < N; i++) {
      const e = list[i];
      if (e.dead || e.isBoss) continue;
      const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const arr = grid.get((cx + ox) + ',' + (cy + oy));
        if (!arr) continue;
        for (const o of arr) {
          if (o === e || o.dead) continue;
          const dx = e.x - o.x, dy = e.y - o.y;
          const minD = e.radius + o.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < minD * minD) {
            const d = Math.sqrt(d2);
            const push = (minD - d) * 0.25;
            const nx = dx / d, ny = dy / d;
            e.x += nx * push; e.y += ny * push;
            o.x -= nx * push; o.y -= ny * push;
          }
        }
      }
    }
  },

  updateProjectiles(dt) {
    const list = this.projectiles.active;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.dead) continue;
      if (p.kind === 'mine') { this.updateMine(p, dt); continue; }
      if (p.hostile) { this.updateHostile(p, dt); continue; }
      if (p.kind === 'bolt') {
        // самонаведение
        if (p.target && p.target.dead) p.target = this.nearestEnemy(p.x, p.y, 700);
        if (p.target && !p.target.dead) {
          const desired = angleTo(p.x, p.y, p.target.x, p.target.y);
          let cur = Math.atan2(p.vy, p.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const turn = clamp(diff, -7 * dt, 7 * dt);
          const a = cur + turn;
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          p.angle = a;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) { p.dead = true; continue; }
        // столкновение
        for (const e of this.enemies.active) {
          if (e.dead) continue;
          if (p.hitIds && p.hitIds.has(e)) continue;
          const rr = p.radius + e.radius;
          if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
            this.hitEnemy(e, p.dmg, p.knockback, p.x, p.y);
            if (p.pierce > 0) {
              if (!p.hitIds) p.hitIds = new Set();
              p.hitIds.add(e);
              p.pierce--;
            } else { p.dead = true; break; }
          }
        }
      }
    }
  },

  // мина: ждёт, взрывается при враге рядом или по истечении жизни
  updateMine(p, dt) {
    p.life -= dt;
    let det = p.life <= 0;
    if (!det) {
      for (const e of this.enemies.active) {
        if (e.dead) continue;
        const rr = p.trigger + e.radius;
        if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) { det = true; break; }
      }
    }
    if (det) {
      for (const e of this.enemies.active) {
        if (e.dead) continue;
        const rr = p.radius + e.radius;
        if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) this.hitEnemy(e, p.dmg, p.knockback, p.x, p.y);
      }
      this.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 0, maxR: p.radius, life: 0.35, maxLife: 0.35, color: p.color });
      this.addShake(4);
      Audio2.nova();
      p.dead = true;
    }
  },

  // вражеский снаряд: летит, бьёт игрока
  updateHostile(p, dt) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; return; }
    const pl = this.player;
    const rr = p.radius + pl.radius;
    if (dist2(p.x, p.y, pl.x, pl.y) <= rr * rr) {
      if (pl.invuln <= 0) {
        pl.hp -= p.dmg;
        pl.invuln = CONFIG.player.iframes;
        pl.flash = 0.12;
        pl.light = Math.max(CONFIG.light.min, pl.light - CONFIG.light.hitLoss);
        this.addShake(CONFIG.feel.shakeOnHit);
        Audio2.hurt();
        if (pl.hp <= 0) { pl.hp = 0; this.gameOver(); }
      }
      p.dead = true;
    }
  },

  updatePickups(dt) {
    const p = this.player;
    const list = this.pickups.active;
    const pr2 = p.pickupRadius * p.pickupRadius;
    const aw = p.pickupRadius * 2.2;        // зона мягкого притяжения (шлейф)
    const aw2 = aw * aw;
    for (let i = 0; i < list.length; i++) {
      const k = list[i];
      if (k.dead) continue;
      const d2 = dist2(k.x, k.y, p.x, p.y);
      if (k.magnet || d2 <= pr2) {
        k.magnet = true;
        const a = angleTo(k.x, k.y, p.x, p.y);
        const pull = 420;
        k.x += Math.cos(a) * pull * dt;
        k.y += Math.sin(a) * pull * dt;
      } else if (d2 <= aw2) {
        // мягкий шлейф: осколки медленно тянутся за игроком
        const a = angleTo(k.x, k.y, p.x, p.y);
        const pull = 110;
        k.x += Math.cos(a) * pull * dt;
        k.y += Math.sin(a) * pull * dt;
      }
      const rr = p.radius + 10;
      if (d2 <= rr * rr) {
        this.collect(k);
        k.dead = true;
      }
    }
  },

  collect(k) {
    const p = this.player;
    if (k.type === 'gold') { p.gold += k.value; Audio2.pickup(); return; }
    const leveled = p.gainXp(k.value);
    if (leveled > 0) this.pendingLevels += leveled;
    Audio2.pickup();
  },

  updateParticles(dt) {
    const list = this.particles.active;
    for (let i = 0; i < list.length; i++) {
      const pt = list[i];
      if (pt.dead) continue;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-3 * dt); pt.vy *= Math.exp(-3 * dt);
      pt.life -= dt;
      pt.fade = Math.max(0, pt.life / pt.maxLife);
      if (pt.life <= 0) pt.dead = true;
    }
  },

  updateDmgNumbers(dt) {
    const list = this.dmgNumbers.active;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dead) continue;
      d.y += d.vy * dt;
      d.vy *= Math.exp(-2 * dt);
      d.life -= dt;
      if (d.life <= 0) d.dead = true;
    }
  },

  updateEffects(dt) {
    const list = this.effects;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.life -= dt;
      if (e.kind === 'nova') e.r = e.maxR * (1 - e.life / e.maxLife);
      if (e.life <= 0) list.splice(i, 1);
    }
  },

  // ----------------------------- БОЙ -----------------------------
  hitEnemy(e, dmg, knockback, fromX, fromY) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = CONFIG.feel.hitFlash;
    if (knockback) {
      const kbScale = clamp(30 / e.maxHp, 0.03, 1);
      const a = angleTo(fromX, fromY, e.x, e.y);
      e.kx += Math.cos(a) * knockback * kbScale;
      e.ky += Math.sin(a) * knockback * kbScale;
    }
    this.spawnDmgNumber(e.x, e.y - e.radius, Math.round(dmg), e.isBoss);
    Audio2.hit();
    if (e.hp <= 0) this.killEnemy(e);
  },

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.player.kills++;
    this.score += e.score;
    this.spawnPickup(e.x, e.y, e.bigGem ? 'xpbig' : 'xp', e.bigGem ? CONFIG.xp.gemBigValue : e.xp);
    const n = e.isBoss ? CONFIG.feel.bossDeathParticles : CONFIG.feel.deathParticles;
    this.burst(e.x, e.y, e.color, n, e.isBoss ? 340 : 150);
    if (e.isBoss) {
      this.addShake(CONFIG.feel.shakeOnBossDeath);
      const bn = CONFIG.enemies[e.typeKey] ? CONFIG.enemies[e.typeKey].name.toUpperCase() : 'БОСС';
      this.banner(bn + ' ПОВЕРЖЕН', 2.5);
      this.bossActive = false;
      Audio2.bossDie();
      for (let i = 0; i < 10; i++)
        this.spawnPickup(e.x + rand(-40, 40), e.y + rand(-40, 40), 'gold', 5);
    } else {
      Audio2.kill();
    }
  },

  // ----------------------------- СПАВН ВСПОМОГ. -----------------------------
  spawnPickup(x, y, type, value) {
    const col = type === 'gold' ? CONFIG.colors.gold
              : type === 'xpbig' ? CONFIG.colors.xpBig : CONFIG.colors.xp;
    this.pickups.spawn((k) => {
      k.x = x; k.y = y; k.type = type; k.value = value;
      k.color = col; k.magnet = false; k.born = this.time;
      const a = rand(0, TAU), s = rand(20, 70);
      k.vx = Math.cos(a) * s; k.vy = Math.sin(a) * s;
    });
  },

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      this.particles.spawn((pt) => {
        pt.x = x; pt.y = y;
        pt.vx = Math.cos(a) * s; pt.vy = Math.sin(a) * s;
        pt.life = pt.maxLife = rand(0.3, 0.7);
        pt.color = color; pt.size = rand(2, 4.5); pt.fade = 1;
      });
    }
  },

  spawnDmgNumber(x, y, value, crit) {
    this.dmgNumbers.spawn((d) => {
      d.x = x + rand(-6, 6); d.y = y;
      d.vy = -42; d.value = value; d.life = CONFIG.feel.dmgNumberLife;
      d.color = crit ? '#ffd24a' : '#ffffff'; d.crit = crit;
    });
  },

  addShake(mag) { this.shake = Math.min(30, Math.max(this.shake, mag)); },
  banner(text, time) { this.bannerText = text; this.bannerTime = time; this.bannerMax = time; },

  // ----------------------------- ЗАПРОСЫ -----------------------------
  nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies.active) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  nearestEnemies(x, y, count, maxD) {
    const res = [];
    const md2 = maxD * maxD;
    for (const e of this.enemies.active) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d > md2) continue;
      e._d = d;
      res.push(e);
    }
    res.sort((a, b) => a._d - b._d);
    return res.slice(0, count);
  },

  // ----------------------------- ДРАФТ / СОСТОЯНИЯ -----------------------------
  openDraft() {
    this.pendingLevels--;
    this.offers = this.generateOffers();
    this.selIndex = 0;
    this.state = 'levelup';
    this.dmgNumbers.clear();   // чтобы яркие числа не просвечивали сквозь дим
    Audio2.levelup();
  },

  generateOffers() {
    const p = this.player;
    // доступные эволюции: оружие на ур.5 + нужная пассивка
    const evos = [];
    for (const key in CONFIG.weapons) {
      const def = CONFIG.weapons[key];
      const w = p.weapons.find(w => w.key === key);
      if (w && w.level >= 5 && def.evolveInto && (p.passives[def.evolveWith] || 0) >= 1) {
        evos.push({ type: 'evolve', key, into: def.evolveInto });
      }
    }
    // обычные кандидаты
    const cands = [];
    for (const key in CONFIG.weapons) {
      const def = CONFIG.weapons[key];
      if (p.weapons.some(x => x.key === def.evolveInto)) continue;  // уже эволюционировало
      const w = p.weapons.find(x => x.key === key);
      if (!w) cands.push({ type: 'weapon', key, isNew: true, resLvl: 1 });
      else if (w.level < 5) cands.push({ type: 'weapon', key, isNew: false, resLvl: w.level + 1 });
    }
    for (const key in CONFIG.passives) {
      const lvl = p.passives[key] || 0;
      if (lvl < 5) cands.push({ type: 'passive', key, isNew: lvl === 0, resLvl: lvl + 1 });
    }
    // гарантированно показать одну эволюцию, если доступна
    let chosen = [];
    if (evos.length) chosen.push(pick(evos));
    chosen = chosen.concat(sampleN(cands, 3 - chosen.length));
    while (chosen.length < 3) chosen.push({ type: 'heal' });
    return chosen;
  },

  chooseOffer(i) {
    const o = this.offers[i];
    if (!o) return;
    const p = this.player;
    if (o.type === 'weapon') p.addWeapon(o.key);
    else if (o.type === 'passive') p.addPassive(o.key);
    else if (o.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    else if (o.type === 'evolve') {
      const w = p.weapons.find(w => w.key === o.key);
      if (w) { w.key = o.into; w.level = 1; w.timer = 0; w.orbAngle = 0; w._nodes = []; }
      this.banner('ЭВОЛЮЦИЯ — ' + CONFIG.evolutions[o.into].name, 2.4);
      this.addShake(8);
      Audio2.levelup();
    }
    Audio2.uiPick();
    this.offers = [];
    if (this.pendingLevels > 0) this.openDraft();
    else this.state = 'playing';
  },

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.dmgNumbers.clear(); }
    else if (this.state === 'paused') this.state = 'playing';
  },

  openCharSelect() {
    this.state = 'charselect';
    this.charIndex = Object.keys(CONFIG.characters).indexOf(this.selectedChar);
    if (this.charIndex < 0) this.charIndex = 0;
    Audio2.ensure(); Audio2.resume();
  },
  confirmChar() {
    const keys = Object.keys(CONFIG.characters);
    this.selectedChar = keys[clamp(this.charIndex, 0, keys.length - 1)];
    this.start();
  },
  openShop() {
    this.state = 'shop';
    this.shopIndex = 0;
    Audio2.ensure(); Audio2.resume();
  },
  quitToMenu() {
    this.awardRun();            // забранное золото засчитываем
    this.state = 'menu';
    Audio2.stopMusic();
  },

  // золото за забег + лучший результат в мету
  awardRun() {
    const earned = this.player.gold + Math.floor(this.player.kills / 5) + Math.floor(this.score / 4);
    this.runGold = earned;
    if (typeof Meta !== 'undefined') {
      Meta.data.gold += earned;
      Meta.recordBest(this.time);
    }
  },

  gameOver() {
    const p = this.player;
    // второе дыхание (перм-апгрейд): восстать вместо гибели
    if (p._revives > 0) {
      p._revives--;
      p.hp = p.maxHp * 0.6;
      p.invuln = 2.5;
      p.light = CONFIG.light.max;
      this.banner('ВТОРОЕ ДЫХАНИЕ', 2);
      // развеять ближнюю тьму
      for (const e of this.enemies.active) {
        if (!e.dead && !e.isBoss && dist2(e.x, e.y, p.x, p.y) < 320 * 320) {
          this.killEnemy(e);
        }
      }
      this.burst(p.x, p.y, CONFIG.colors.player, 60, 360);
      this.addShake(18);
      Audio2.levelup();
      return;
    }
    this.state = 'gameover';
    this.addShake(14);
    this.burst(p.x, p.y, CONFIG.colors.player, 40, 260);
    this.awardRun();
    Audio2.stopMusic();
    Audio2.death();
  },

  win() {
    this.state = 'win';
    this.awardRun();
    Audio2.stopMusic();
    Audio2.levelup();
  },
};
