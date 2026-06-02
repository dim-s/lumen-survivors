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
  // ---- расширение v2: глубины, аномалии, зоны тьмы, события ----
  selectedDepth: 0,         // выбранная глубина (0 = базовый забег)
  depthIndex: 0,            // фактическая глубина забега
  runMods: null,            // слитые модификаторы забега (глубина × аномалии)
  darkZones: [],            // пятна тьмы от Якорей: {x,y,r,life,maxLife}
  eventsSpawned: 0,         // сколько Развилок Тьмы уже было
  runSeen: null,            // Set typeKey врагов, встреченных в забеге (кодекс)
  killedBoss: false,        // убит ли хоть один босс (веха разблокировки)
  newUnlocks: [],           // что открылось этим забегом (для итогового экрана)
  // кликабельные UI-зоны (выставляются при рендере соответствующего экрана)
  _menuShopRect: null, _depthRects: null, _pauseRects: null, _volRect: null,
  _resultMenuRect: null, _shopBackRect: null,

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
    // глубина: не выше открытой
    const maxD = (typeof Meta !== 'undefined') ? Meta.data.maxDepth : 0;
    this.depthIndex = clamp(this.selectedDepth, 0, maxD);
    this.computeRunMods();
    this.player.reset(char);
    this.player.addWeapon(CONFIG.characters[char].start);   // стартовое оружие персонажа
    this.player.recalc();
    this.enemies.clear(); this.projectiles.clear(); this.pickups.clear();
    this.particles.clear(); this.dmgNumbers.clear();
    this.effects.length = 0;
    this.darkZones.length = 0;
    this.time = 0; this.score = 0;
    this.shake = 0; this.bannerTime = 0;
    this.pendingLevels = 0; this.offers = [];
    this.bossActive = false;
    this.eventsSpawned = 0;
    this.killedBoss = false;
    this.runSeen = new Set();
    this.newUnlocks = [];
    this._runAwarded = false;
    Spawner.reset();
    this.state = 'playing';
    this.started = true;
    // сбросить зажатие мыши с кнопки старта/рестарта — иначе игрок сразу едет к курсору
    if (typeof Input !== 'undefined') Input.mouseDown = false;
    Audio2.ensure(); Audio2.resume(); Audio2.startMusic();
  },

  // ---- роллинг аномалий и слияние модификаторов забега (всё через RNG) ----
  rollAnomalies() {
    // 1 аномалия на базовой глубине, +1 за каждые две глубины (макс 3)
    const n = clamp(1 + Math.floor(this.depthIndex / 2), 1, 3);
    return sampleN(CONFIG.anomalies, n);
  },

  computeRunMods() {
    const m = { depth: this.depthIndex, anomalies: [],
                hp: 1, spd: 1, dmg: 1, light: 1, reward: 1,
                recover: 1, hitLoss: 1, darkSpeed: 1, pickup: 1, xp: 1, weightMul: {} };
    // глубина
    if (this.depthIndex > 0) {
      const d = CONFIG.depths[this.depthIndex - 1];
      m.hp *= d.hp; m.spd *= d.spd; m.dmg *= d.dmg; m.light *= d.light; m.reward *= d.reward;
    }
    // аномалии
    m.anomalies = this.rollAnomalies();
    for (const a of m.anomalies) this._mergeAnomaly(m, a);
    this.runMods = m;
  },

  // влить модификаторы одной аномалии в набор (используется и при роллинге, и Развилкой)
  _mergeAnomaly(m, a) {
    if (a.light)    m.light    *= a.light;
    if (a.enemyHp)  m.hp       *= a.enemyHp;
    if (a.enemySpd) m.spd      *= a.enemySpd;
    if (a.enemyDmg) m.dmg      *= a.enemyDmg;
    if (a.reward)   m.reward   *= a.reward;
    if (a.recover)  m.recover  *= a.recover;
    if (a.hitLoss)  m.hitLoss  *= a.hitLoss;
    if (a.darkSpeed)m.darkSpeed*= a.darkSpeed;
    if (a.pickup)   m.pickup   *= a.pickup;
    if (a.xp)       m.xp       *= a.xp;
    if (a.weightMul) for (const k in a.weightMul) m.weightMul[k] = (m.weightMul[k] || 1) * a.weightMul[k];
  },

  // множитель «дыхания» света День/Ночь — частота нарастает к финалу
  dayNightMult() {
    const c = CONFIG.cycle;
    const p = lerp(c.period, c.periodEnd, clamp(this.time / CONFIG.runDuration, 0, 1));
    return 1 + Math.sin(this.time / p * TAU) * c.swing;
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
    this.updateDarkZones(dt);

    // shake decay
    if (this.shake > 0) this.shake = Math.max(0, this.shake - CONFIG.feel.shakeDecay * dt);
    if (this.bannerTime > 0) this.bannerTime -= dt;

    this.enemies.sweep(); this.projectiles.sweep(); this.pickups.sweep();
    this.particles.sweep(); this.dmgNumbers.sweep();

    // Развилка Тьмы по таймеру (выбор без правильного ответа)
    if (this.eventsSpawned < CONFIG.eventTimes.length &&
        this.time >= CONFIG.eventTimes[this.eventsSpawned] && this.state === 'playing') {
      this.openEvent();
      return;
    }
    // драфт по накопленным уровням
    if (this.pendingLevels > 0 && this.state === 'playing') this.openDraft();
  },

  updateDarkZones(dt) {
    const z = this.darkZones;
    for (let i = z.length - 1; i >= 0; i--) {
      z[i].life -= dt;
      if (z[i].life <= 0) z.splice(i, 1);
    }
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
    // свет: цель растёт с уровнем; модифицируется глубиной, аномалиями, дыханием
    // День/Ночь и пятнами тьмы; восстанавливается после проседаний от урона.
    // У героев-режимов (Угасающий/Зеркало) — своя модель света.
    const L = CONFIG.light;
    const rm = this.runMods || { light: 1, recover: 1 };
    const recoverMul = (this._lightRecoverMul != null) ? this._lightRecoverMul : 1;  // глушение Рассеивателем
    // суммарное подавление пятнами тьмы (Якори), если игрок внутри
    let supp = 1;
    if (this.darkZones.length) {
      for (const z of this.darkZones) if (dist2(p.x, p.y, z.x, z.y) <= z.r * z.r) supp *= 0.6;
    }
    if (p._lightMode === 'decay') {
      // Угасающий: свет непрерывно тает; зоны тьмы ускоряют пропорционально; убийства подливают
      let rate = p._lightDecay;
      if (supp < 1) rate *= (2 - supp);
      p.light = clamp(p.light - rate * dt, L.min, L.max);
    } else {
      // Зеркало: радиус из осколков-убийств; иначе — обычный рост с уровнем
      const baseT = (p._lightMode === 'mirror')
        ? (L.min + p._mirrorStacks * p._mirrorPer)
        : (L.base + (p.level - 1) * L.perLevel + (p._charLightBonus || 0));
      let target = clamp(baseT, L.min, L.max) * rm.light * this.dayNightMult() * supp;
      target = clamp(target, L.min, L.max);
      if (p.light < target) p.light = Math.min(target, p.light + L.recover * rm.recover * recoverMul * dt);
      else if (p.light > target) p.light = target;
    }
    // всплеск света от ульты (Рассветная вспышка) держит радиус ~2с во всех режимах
    if (p._lightFloorT > 0) { p._lightFloorT -= dt; if (p.light < p._lightFloor) p.light = p._lightFloor; }
    if (p.light < L.min) p.light = L.min;
    this.camera.x = p.x; this.camera.y = p.y;
  },

  updateEnemies(dt) {
    const p = this.player;
    const rm = this.runMods || { darkSpeed: 1, hitLoss: 1 };
    const list = this.enemies.active;
    let leechNear = false;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      if (e.dmgCd > 0) e.dmgCd -= dt;
      const d2p = dist2(e.x, e.y, p.x, p.y);
      // движение к игроку
      const a = angleTo(e.x, e.y, p.x, p.y);
      let sp = e.speed;
      // твист: вне света враги быстрее (рвутся из теней)
      if (!e.isBoss && d2p > p.light * p.light) sp *= CONFIG.light.darkSpeedMult * rm.darkSpeed;
      // дальник тормозит в дистанции боя, чтобы держать позицию и стрелять
      if (e.ranged && d2p < (e.shotRange * 0.75) * (e.shotRange * 0.75)) sp *= 0.25;
      // замедление в свет-зоне фонаря
      if (e.slowT > 0) { sp *= e.slowMul; e.slowT -= dt; }
      // Пожиратель высасывает радиус света, пока близко (приоритет «убить первым»)
      if (e.drainLight && d2p <= e.drainRange * e.drainRange) {
        p.light = Math.max(CONFIG.light.min, p.light - e.drainLight * dt);
      }
      // Рассеиватель: глушит восстановление света, пока рядом
      if (e.suppressLight && d2p <= e.suppressRange * e.suppressRange) leechNear = true;
      // Нулевая Точка: пульсирует кольцами тьмы (радиальный залп по таймеру)
      if (e.ring) {
        e.ringTimer -= dt;
        if (e.ringTimer <= 0) {
          e.ringTimer += e.ringCd;
          for (let k = 0; k < e.ringShots; k++) {
            const ra = k / e.ringShots * TAU + this.time * 0.7;
            this.projectiles.spawn((pr) => {
              pr.x = e.x; pr.y = e.y;
              pr.vx = Math.cos(ra) * e.ringSpeed; pr.vy = Math.sin(ra) * e.ringSpeed;
              pr.kind = 'eshot'; pr.hostile = true; pr.dmg = e.ringDmg;
              pr.color = '#c08bff'; pr.radius = e.ringRadius; pr.life = 4; pr.hitIds = null;
            });
          }
          Audio2.nova();
        }
      }
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
          p.light = Math.max(CONFIG.light.min, p.light - CONFIG.light.hitLoss * rm.hitLoss); // тьма наступает
          if (p._lightMode === 'mirror') p._mirrorStacks = Math.floor(p._mirrorStacks * 0.5);  // осколки бьются
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
    // Рассеиватель рядом → восстановление света заглушено (читается в updatePlayer)
    this._lightRecoverMul = leechNear ? 0.3 : 1;
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
      if (p.kind === 'lantern') { this.updateLantern(p, dt); continue; }
      if (p.kind === 'ricochet') { this.updateRicochet(p, dt); continue; }
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

  // Отражённый луч: летит, отскакивает от кромки света игрока (крепчая), бьёт врагов
  updateRicochet(p, dt) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; return; }
    const pl = this.player;
    const dx = p.x - pl.x, dy = p.y - pl.y;
    const d = Math.hypot(dx, dy);
    // отскок от кромки тьмы (границы света), пока есть отскоки
    if (d > pl.light && p.bounces > 0 && d > 1) {
      const nx = dx / d, ny = dy / d;
      const dot = p.vx * nx + p.vy * ny;
      // только если снаряд реально летит НАРУЖУ — иначе движение игрока даёт фантомный отскок
      if (dot > 0) {
        p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny;
        p.x = pl.x + nx * (pl.light - 2); p.y = pl.y + ny * (pl.light - 2);
        p.bounces--;
        p.dmg *= (1 + p.bounceGain);
        if (p.hitIds) p.hitIds.clear();   // после отскока можно снова бить тех же
        Audio2.hit();
      }
    }
    for (const e of this.enemies.active) {
      if (e.dead) continue;
      if (p.hitIds && p.hitIds.has(e)) continue;
      const rr = p.radius + e.radius;
      if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
        this.hitEnemy(e, p.dmg, p.knockback, p.x, p.y);
        if (!p.hitIds) p.hitIds = new Set();
        p.hitIds.add(e);
      }
    }
  },

  // фонарь (Пульс-фонарь): стоит на месте, замедляет и жжёт врагов в радиусе
  updateLantern(p, dt) {
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; return; }
    p.tickTimer -= dt;
    const doDmg = p.tickTimer <= 0;
    if (doDmg) p.tickTimer += p.tick;
    for (const e of this.enemies.active) {
      if (e.dead) continue;
      const rr = p.radius + e.radius;
      if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
        e.slowT = 0.12; e.slowMul = p.slowMul;        // замедление (читается в updateEnemies)
        if (doDmg && p.dmg > 0) this.hitEnemy(e, p.dmg, 0, p.x, p.y);
      }
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
        pl.light = Math.max(CONFIG.light.min, pl.light - CONFIG.light.hitLoss * (this.runMods ? this.runMods.hitLoss : 1));
        if (pl._lightMode === 'mirror') pl._mirrorStacks = Math.floor(pl._mirrorStacks * 0.5);  // осколки бьются
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
    const pickR = p.pickupRadius * (this.runMods ? this.runMods.pickup : 1);  // аномалия Морок сужает магнит
    const pr2 = pickR * pickR;
    const aw = pickR * 2.2;                  // зона мягкого притяжения (шлейф)
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
    const xpMul = this.runMods ? this.runMods.xp : 1;
    const leveled = p.gainXp(xpMul !== 1 ? Math.max(1, Math.round(k.value * xpMul)) : k.value);
    if (leveled > 0) this.pendingLevels += leveled;
    // короткий пульс XP-бара (связь килл→осколок→XP читаема) — единый, рефрешим
    const pulse = this.effects.find(e => e.kind === 'xppulse');
    if (pulse) pulse.life = pulse.maxLife;
    else this.effects.push({ kind: 'xppulse', life: 0.3, maxLife: 0.3 });
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
    const pl = this.player;
    pl.kills++;
    // герои: Угасающий черпает свет из убийств, Зеркало копит осколки
    if (pl._lightMode === 'decay') pl.light = Math.min(CONFIG.light.max, pl.light + pl._killLight);
    else if (pl._lightMode === 'mirror') pl._mirrorStacks++;
    this.score += e.score;
    if (this.runSeen) this.runSeen.add(e.typeKey);
    this.spawnPickup(e.x, e.y, e.bigGem ? 'xpbig' : 'xp', e.bigGem ? CONFIG.xp.gemBigValue : e.xp);
    const n = e.isBoss ? CONFIG.feel.bossDeathParticles : CONFIG.feel.deathParticles;
    this.burst(e.x, e.y, e.color, n, e.isBoss ? 340 : 150);
    // Дробитель распадается на осколки
    if (e.split) {
      const ph = Spawner.currentPhase(this.time);
      for (let i = 0; i < e.splitCount; i++) {
        const a = rand(0, TAU), r = rand(10, 26);
        Spawner.spawnTypeAt(e.split, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, ph, true);
      }
    }
    // Якорь роняет пятно тьмы — гасит рост света на участке
    if (e.anchorOnDeath) {
      this.darkZones.push({ x: e.x, y: e.y, r: e.anchorRadius, life: e.anchorLife, maxLife: e.anchorLife });
    }
    if (e.isBoss) {
      this.killedBoss = true;
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
    this._draftIsEvent = false;
    this.state = 'levelup';
    this.dmgNumbers.clear();   // чтобы яркие числа не просвечивали сквозь дим
    Audio2.levelup();
  },

  // ---- Развилка Тьмы: выбор без правильного ответа (переиспользует UI драфта) ----
  openEvent() {
    this.eventsSpawned++;
    this.offers = this.generateEventOffers();
    this.selIndex = 0;
    this._draftIsEvent = true;
    this.state = 'levelup';
    this.dmgNumbers.clear();
    this.banner('РАЗВИЛКА ТЬМЫ', 1.6);
    Audio2.levelup();
  },

  generateEventOffers() {
    return sampleN(CONFIG.darkEvents, 3).map(d => ({ type: 'event', kind: d.kind, def: d }));
  },

  applyDarkEvent(kind) {
    const p = this.player;
    if (kind === 'eliteWave') {
      const ph = Spawner.currentPhase(this.time);
      const pool = ['tank', 'devourer', 'anchor', 'chaser'];
      for (let i = 0; i < 12; i++) {
        const pos = Spawner.edgePos();
        Spawner.spawnTypeAt(pick(pool), pos.x, pos.y, ph, false);
      }
      for (let i = 0; i < 14; i++)
        this.spawnPickup(p.x + rand(-60, 60), p.y + rand(-60, 60), 'gold', 5);
      this.banner('ПРОРЫВ ТЕНЕЙ', 1.8);
    } else if (kind === 'curse') {
      // добавить аномалию, которой ещё нет; взамен — перманентный (на забег) +урон.
      // Баф даётся только если аномалия реально добавлена (иначе сделки нет)
      const have = new Set(this.runMods.anomalies.map(a => a.key));
      const fresh = CONFIG.anomalies.filter(a => !have.has(a.key));
      if (fresh.length) {
        const a = pick(fresh);
        this._mergeAnomaly(this.runMods, a);
        this.runMods.anomalies.push(a);
        this.banner('ТЬМА: ' + a.name.toUpperCase(), 2);
        p.base.damageMult *= 1.15; p.recalc();
      }
    } else if (kind === 'respite') {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
      p.light = CONFIG.light.max;
      for (const e of this.enemies.active) {
        if (!e.dead && !e.isBoss && dist2(e.x, e.y, p.x, p.y) < 260 * 260) this.killEnemy(e);
      }
      this.burst(p.x, p.y, CONFIG.colors.player, 40, 280);
    } else if (kind === 'fortune') {
      for (let i = 0; i < 22; i++)
        this.spawnPickup(p.x + rand(-80, 80), p.y + rand(-80, 80), 'gold', 5);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15);
    }
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
      // запертое оружие не предлагаем, пока игрок его не открыл (если уже взято — качаем)
      if (!w && typeof Meta !== 'undefined' && !Meta.isUnlocked(key)) continue;
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
    else if (o.type === 'event') this.applyDarkEvent(o.kind);
    else if (o.type === 'evolve') {
      const w = p.weapons.find(w => w.key === o.key);
      if (w) { w.key = o.into; w.level = 1; w.timer = 0; w.orbAngle = 0; w._nodes = []; w._beamTick = 0; w._beams = null; }
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
    const key = keys[clamp(this.charIndex, 0, keys.length - 1)];
    if (typeof Meta !== 'undefined' && !Meta.isUnlocked(key)) { Audio2.hit(); return; }  // герой заперт
    this.selectedChar = key;
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

  // золото за забег + рекорд + вехи разблокировок (раз за забег)
  awardRun() {
    if (this._runAwarded) return;
    this._runAwarded = true;
    const rew = this.runMods ? this.runMods.reward : 1;
    const base = this.player.gold + Math.floor(this.player.kills / 5) + Math.floor(this.score / 4);
    const earned = Math.round(base * rew);
    this.runGold = earned;
    this.newUnlocks = [];
    if (typeof Meta !== 'undefined') {
      Meta.data.gold += earned;
      this.newUnlocks = Meta.recordRun({
        time: this.time, level: this.player.level, kills: this.player.kills,
        killedBoss: this.killedBoss, won: this.state === 'win',
        depth: this.depthIndex, seen: this.runSeen,
      });
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
