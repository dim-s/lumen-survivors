/* =====================================================================
   SPAWNER — спавн врагов по кривой эскалации (CONFIG.phases).
   Спавнит за краем видимой области вокруг игрока. Боссы по таймеру.
   ===================================================================== */

const Spawner = {
  timer: 0,
  bossesSpawned: 0,

  reset() { this.timer = 0; this.bossesSpawned = 0; },

  currentPhase(t) {
    let ph = CONFIG.phases[0];
    for (const p of CONFIG.phases) if (t >= p.tStart) ph = p;
    return ph;
  },

  update(dt, t) {
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

    const n = Math.min(ph.batch, ph.cap - Game.enemies.active.length);
    for (let i = 0; i < n; i++) {
      const key = weightedPick(ph.weights);
      this.spawnEnemy(key, ph);
    }
  },

  // позиция за пределами видимой области вокруг игрока
  edgePos() {
    const cam = Game.camera;
    const margin = 60;
    const hw = Game.viewW / 2 + margin;
    const hh = Game.viewH / 2 + margin;
    const cx = Game.player.x, cy = Game.player.y;
    const side = randInt(0, 3);
    if (side === 0) return { x: cx + rand(-hw, hw), y: cy - hh };
    if (side === 1) return { x: cx + rand(-hw, hw), y: cy + hh };
    if (side === 2) return { x: cx - hw, y: cy + rand(-hh, hh) };
    return { x: cx + hw, y: cy + rand(-hh, hh) };
  },

  spawnEnemy(key, ph) {
    const def = CONFIG.enemies[key];
    const pos = this.edgePos();
    Game.enemies.spawn((e) => {
      e.typeKey = key;
      e.x = pos.x; e.y = pos.y;
      e.kx = 0; e.ky = 0;
      e.maxHp = def.hp * ph.hpMult;
      e.hp = e.maxHp;
      e.radius = def.radius;
      e.speed = def.speed * ph.spdMult;
      e.damage = def.damage * ph.dmgMult;
      e.color = def.color;
      e.shape = def.shape;
      e.xp = def.xp;
      e.bigGem = !!def.bigGem;
      e.score = def.score;
      e.isBoss = false;
      e.flash = 0; e.hitCd = 0; e.dmgCd = 0;
      e.wob = rand(0, TAU);
      // дальник: параметры стрельбы
      e.ranged = !!def.ranged;
      if (def.ranged) {
        e.shotDmg = def.shotDmg * ph.dmgMult;
        e.shotSpeed = def.shotSpeed;
        e.shotCd = def.shotCd;
        e.shotRange = def.shotRange;
        e.shotRadius = def.shotRadius;
        e.shotTimer = def.shotCd * (0.5 + rand(0, 0.5));   // рассинхрон залпов
      }
    });
  },

  spawnBoss(t) {
    const idx = this.bossesSpawned;
    const key = idx === 0 ? 'boss' : 'boss2';
    const def = CONFIG.enemies[key];
    const pos = this.edgePos();
    Game.enemies.spawn((e) => {
      e.typeKey = key;
      e.x = pos.x; e.y = pos.y;
      e.kx = 0; e.ky = 0;
      e.maxHp = def.hp;
      e.hp = e.maxHp;
      e.radius = def.radius;
      e.speed = def.speed;
      e.damage = def.damage;
      e.color = def.color;
      e.shape = def.shape;
      e.xp = def.xp;
      e.bigGem = true;
      e.score = def.score;
      e.isBoss = true;
      e.ranged = false;
      e.flash = 0; e.hitCd = 0; e.dmgCd = 0;
      e.wob = 0;
    });
    Game.bossActive = true;
    Game.banner('⚠ ' + def.name.toUpperCase() + ' ⚠', 2.4);
    Game.addShake(12);
    Audio2.boss();
  },
};
