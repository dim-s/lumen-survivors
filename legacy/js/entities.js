/* =====================================================================
   ENTITIES — игрок, враги, снаряды, подбираемые, частицы, числа урона.
   ===================================================================== */

class Player {
  constructor() {
    this.reset();
  }
  reset(charKey) {
    const p = CONFIG.player;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.facing = -Math.PI / 2;     // куда смотрит (для хлыста)
    this.lastDir = { x: 1, y: 0 };
    this.radius = p.radius;
    this.level = 1;
    this.xp = 0;
    this.xpNext = CONFIG.xp.base;
    this.invuln = 0;
    this.flash = 0;
    this.alive = true;
    this.kills = 0;
    this.gold = 0;
    // прокачиваемые наборы
    this.weapons = [];               // [{key, level, timer, ...}]
    this.passives = {};              // {key: level}
    // базовые статы + модификаторы персонажа
    this.base = Object.assign({}, p);
    const ch = CONFIG.characters[charKey] || CONFIG.characters.spark;
    this.charKey = (CONFIG.characters[charKey] ? charKey : 'spark');
    const m = ch.mods || {};
    if (m.maxHp) this.base.maxHp = m.maxHp;
    if (m.moveSpeedMul) this.base.moveSpeed = p.moveSpeed * m.moveSpeedMul;
    if (m.damageMult) this.base.damageMult = m.damageMult;
    this._charLightBonus = m.lightBonus || 0;
    // особые режимы света героев: 'decay' (Угасающий), 'mirror' (Зеркало)
    this._lightMode = m.lightMode || null;
    this._lightDecay = m.lightDecay || 0;     // px/сек угасания (decay)
    this._killLight = m.killLight || 0;       // +свет за убийство (decay)
    this._mirrorPer = m.mirrorPer || 0;       // свет за осколок (mirror)
    this._mirrorStacks = 0;
    this._lightFloor = 0; this._lightFloorT = 0;   // удержание света от ульты-вспышки
    // перманентные апгрейды из магазина (мета)
    this._revives = 0;
    if (typeof Meta !== 'undefined' && Meta.data && Meta.data.upgrades) {
      const u = Meta.data.upgrades;
      if (u.maxhp) this.base.maxHp += u.maxhp * 12;
      if (u.power) this.base.damageMult *= (1 + u.power * 0.05);
      if (u.speed) this.base.moveSpeed *= (1 + u.speed * 0.04);
      if (u.light) this._charLightBonus += u.light * 20;
      this._revives = u.revive || 0;
    }
    // производные
    this.maxHp = this.base.maxHp;
    this.hp = this.maxHp;
    this.moveSpeed = this.base.moveSpeed;
    this.pickupRadius = this.base.pickupRadius;
    this.regen = this.base.regen;
    this.damageMult = this.base.damageMult;
    this._bonusMaxHp = 0;
    if (this._lightMode === 'decay') this.light = CONFIG.light.max;        // стартует ярко, тает
    else if (this._lightMode === 'mirror') this.light = CONFIG.light.min;  // тьма, пока не нафармил
    else this.light = clamp(CONFIG.light.base + this._charLightBonus, CONFIG.light.min, CONFIG.light.max);
  }

  addWeapon(key) {
    const w = this.weapons.find(w => w.key === key);
    if (w) { if (w.level < 5) w.level++; return; }
    this.weapons.push({ key, level: 1, timer: 0, orbAngle: 0 });
  }
  addPassive(key) {
    this.passives[key] = Math.min(5, (this.passives[key] || 0) + 1);
    this.recalc();
  }
  hasWeapon(key) { const w = this.weapons.find(w => w.key === key); return w ? w.level : 0; }

  recalc() {
    const b = this.base;
    let moveSpeed = b.moveSpeed, pickupRadius = b.pickupRadius, regen = b.regen;
    let damageMult = b.damageMult, bonusMaxHp = 0;
    for (const key in this.passives) {
      const def = CONFIG.passives[key];
      const v = def.val[this.passives[key] - 1];
      if (def.mode === 'mult') {
        if (def.stat === 'moveSpeed') moveSpeed = b.moveSpeed * v;
        else if (def.stat === 'pickupRadius') pickupRadius = b.pickupRadius * v;
        else if (def.stat === 'damageMult') damageMult = b.damageMult * v;
      } else if (def.mode === 'add') {
        if (def.stat === 'regen') regen = b.regen + v;
      } else if (def.mode === 'addMaxHp') {
        bonusMaxHp = v;
      }
    }
    this.moveSpeed = moveSpeed;
    this.pickupRadius = pickupRadius;
    this.regen = regen;
    this.damageMult = damageMult;
    const newMax = b.maxHp + bonusMaxHp;
    const healDelta = newMax - this.maxHp;
    this.maxHp = newMax;
    if (healDelta > 0) this.hp = Math.min(this.maxHp, this.hp + healDelta);
  }

  gainXp(v) {
    this.xp += v;
    let leveled = 0;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      leveled++;
      this.xpNext = Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, this.level - 1));
    }
    return leveled;
  }
}

// --- Фабрики для пулов (плоские объекты для скорости) ---

function makeEnemy() {
  return { x:0,y:0, kx:0,ky:0, hp:0, maxHp:0, radius:0, speed:0, damage:0,
           color:'#fff', shape:'tri', xp:1, bigGem:false, score:1, isBoss:false,
           flash:0, dead:false, typeKey:'chaser', wob: RNG.next()*TAU, dmgCd:0, hitCd:0,
           ranged:false, shotTimer:0, shotDmg:0, shotSpeed:0, shotCd:0, shotRange:0, shotRadius:6,
           // свет-механики: высасывание света, разделение, якорь тьмы, замедление фонарём
           drainLight:0, drainRange:0, split:null, splitCount:0, isChild:false,
           anchorOnDeath:false, anchorRadius:0, anchorLife:0, slowT:0, slowMul:1, bossKind:null, bossPhase:0,
           suppressLight:false, suppressRange:0,
           ring:false, ringCd:0, ringTimer:0, ringShots:0, ringSpeed:0, ringDmg:0, ringRadius:6 };
}
function makeProj() {
  return { x:0,y:0, vx:0,vy:0, dmg:0, radius:4, life:0, pierce:0, color:'#fff',
           kind:'bolt', knockback:0, dead:false, hitIds:null, angle:0, ownerTick:0,
           orbIndex:0, src:null, trigger:0, hostile:false, target:null,
           slowMul:1, tick:0, tickTimer:0, maxLife:0, bounces:0, bounceGain:0 };
}
function makePickup() {
  return { x:0,y:0, vx:0,vy:0, type:'xp', value:1, color:'#fff', dead:false, magnet:false, born:0 };
}
function makeParticle() {
  return { x:0,y:0, vx:0,vy:0, life:0, maxLife:0, color:'#fff', size:3, dead:false, fade:1 };
}
function makeDmgNum() {
  return { x:0,y:0, vy:-30, value:0, life:0, color:'#fff', crit:false, dead:false };
}
