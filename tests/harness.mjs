/* =====================================================================
   LUMEN — headless регресс-харнесс (чистый Node, без браузера/зависимостей).
   Грузит игровые скрипты в vm-контекст с DOM/canvas-заглушкой, гоняет
   сидированные бот-симуляции и проверяет инварианты:
     - детерминизм (один seed → идентичный исход)
     - отсутствие исключений в логике И в рендере
     - эскалация врагов и прогрессия уровней работают
   Использование:  node tests/harness.mjs            (сиды по умолчанию)
                   node tests/harness.mjs 42 7 99    (свои сиды)
   Код выхода 0 = PASS, 1 = FAIL.
   ===================================================================== */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const seeds = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
const SEEDS = seeds.length ? seeds : [42, 7, 1234];

// --- DOM / canvas заглушка ---
function makeFakeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => grad;
      if (p === 'measureText') return () => ({ width: 10 });
      return () => {};            // любой другой метод — no-op
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeFakeCanvas() {
  const c = { width: 0, height: 0, _off: 0, style: {} };
  c.getContext = () => makeFakeCtx();
  return c;
}

// Грузим предсобранный IIFE-бандл (см. build-test-bundle.mjs). Бандл экспонирует
// игровые символы на globalThis — драйвер ниже видит их как и раньше.
const bundlePath = path.join(__dirname, '.bundle.cjs');
if (!fs.existsSync(bundlePath)) {
  console.error('Тест-бандл не найден. Собери его: node tests/build-test-bundle.mjs (или запусти `npm test`).');
  process.exit(1);
}
const bundle = fs.readFileSync(bundlePath, 'utf8');

// Драйвер симуляции — добавляется в тот же лексический скоуп, что и игра,
// поэтому видит Game/CONFIG/Input/UI/RNG/dist2 напрямую.
const driver = `
globalThis.__runSim = function(seed, seconds, char) {
  RNG.seed(seed >>> 0);
  Game.viewW = 1280; Game.viewH = 720;
  Game.init();
  Game.selectedChar = (char && CONFIG.characters[char]) ? char : 'spark';
  Game.start();
  const STEP = 1/60;
  const steps = Math.round(seconds * 60);
  let reachedBoss = false, maxEnemies = 0, renderErr = null, thrown = null, sawHostile = false;
  function pickIdx() {
    const o = Game.offers, p = Game.player, nW = p.weapons.length;
    let i = o.findIndex(x => x.type==='weapon' && x.isNew); if (nW < 4 && i>=0) return i;
    if ((p.passives.vigor||0) < 2) { i = o.findIndex(x => x.type==='passive' && x.key==='vigor'); if (i>=0) return i; }
    i = o.findIndex(x => x.type==='passive' && x.key==='power'); if (i>=0) return i;
    i = o.findIndex(x => x.type==='weapon'); if (i>=0) return i; return 0;
  }
  try {
    for (let s = 0; s < steps; s++) {
      if (Game.state === 'levelup') Game.chooseOffer(pickIdx());
      if (Game.state === 'gameover' || Game.state === 'win') break;
      const p = Game.player;
      let cx=0, cy=0, c=0;
      for (const e of Game.enemies.active) { if (e.dead) continue; const dd = dist2(p.x,p.y,e.x,e.y); if (dd < 240*240) { cx+=e.x; cy+=e.y; c++; } }
      let mx=0, my=0;
      if (c) { cx/=c; cy/=c; const ax=p.x-cx, ay=p.y-cy, d=Math.hypot(ax,ay)||1; mx=ax/d-ay/d*0.6; my=ay/d+ax/d*0.6; }
      // уклонение от вражеских снарядов (честный прокси игрока)
      for (const pr of Game.projectiles.active) {
        if (!pr.hostile) continue;
        const dd = dist2(p.x,p.y,pr.x,pr.y);
        if (dd < 130*130) { const d = Math.sqrt(dd)||1; mx += (p.x-pr.x)/d*1.5; my += (p.y-pr.y)/d*1.5; }
      }
      Input.keys = {};
      if (mx>0.2) Input.keys.d=true; if (mx<-0.2) Input.keys.a=true;
      if (my>0.2) Input.keys.s=true; if (my<-0.2) Input.keys.w=true;
      Game.update(STEP);
      if (Game.bossActive) reachedBoss = true;
      if (Game.enemies.active.length > maxEnemies) maxEnemies = Game.enemies.active.length;
      if (!sawHostile) { for (const pr of Game.projectiles.active) { if (pr.hostile) { sawHostile = true; break; } } }
      if (s % 30 === 0 && !renderErr) { try { UI.render(TESTCTX); } catch (e) { renderErr = String((e && e.stack) || e); } }
    }
  } catch (e) { thrown = String((e && e.stack) || e); }
  const p = Game.player;
  return { seed, end: Game.state, time: +Game.time.toFixed(2), level: p.level, kills: p.kills,
           weapons: p.weapons.map(w => w.key+':'+w.level).join(','),
           reachedBoss, maxEnemies, renderErr, thrown, sawHostile, char: Game.selectedChar };
};

// Тест эволюции (детерминированный): bolt до ур.5 + power → драфт ОБЯЗАН предложить
// эволюцию; применяем и проверяем, что эволюционировавшее оружие реально стреляет.
globalThis.__runEvo = function(seed, seconds) {
  RNG.seed(seed >>> 0);
  const _savedMeta = Meta.data;
  Meta.data = { best: 0, gold: 0, upgrades: {}, volume: 0.7, maxDepth: 0, unlocks: {}, codex: {}, totalKills: 0 };
  Game.viewW = 1280; Game.viewH = 720; Game.init(); Game.start();
  const p = Game.player;
  let evolved = false, evoFired = false, sawOffer = false, thrown = null;
  try {
    // напрямую довести bolt до ур.5 и взять пассивку power (условие эволюции в dawnray)
    for (let i = 0; i < 4; i++) p.addWeapon('bolt');   // 1 -> 5
    p.addPassive('power');
    // драфт обязан показать гарантированную карту эволюции
    Game.pendingLevels = 1; Game.openDraft();
    const ei = Game.offers.findIndex(o => o.type === 'evolve' && o.into === 'dawnray');
    sawOffer = ei >= 0;
    if (ei >= 0) Game.chooseOffer(ei);
    evolved = p.weapons.some(w => CONFIG.evolutions[w.key]);
    // прогнать кадры со спавненными врагами — эволюция должна стрелять
    if (Game.state !== 'playing') Game.state = 'playing';
    const ph = Spawner.currentPhase(Game.time);
    for (let k = 0; k < 6; k++) Spawner.spawnTypeAt('chaser', p.x + rand(70, 170), p.y + rand(-70, 70), ph, false);
    for (let s = 0; s < 120 && !evoFired; s++) {
      Input.keys = {};
      Game.update(1/60);
      if (evolved && Game.projectiles.active.length > 0) evoFired = true;
    }
  } catch (e) { thrown = String((e && e.stack) || e); }
  Meta.data = _savedMeta;   // вернуть мету
  return { evolved, evoFired, sawOffer, thrown, level: p.level,
           weapons: p.weapons.map(w => w.key+':'+w.level).join(',') };
};

// Пара прогонов одного сида с ИДЕНТИЧНЫМ стартовым Meta (разблокировки копятся между
// забегами по дизайну — для проверки детерминизма оба прогона стартуют из одного снапшота).
globalThis.__detPair = function(seed, seconds) {
  const snap = JSON.stringify(Meta.data);
  const a = __runSim(seed, seconds);
  Meta.data = JSON.parse(snap);
  const b = __runSim(seed, seconds);
  Meta.data = JSON.parse(snap);
  return { a, b };
};

// Рендер всех не-боевых экранов без исключений.
globalThis.__renderStates = function() {
  RNG.seed(5); Game.viewW = 1280; Game.viewH = 720; Game.init();
  Game.selectedChar = 'spark'; Game.start();
  Game.player.addWeapon('whip'); Game.player.addPassive('power');
  Game.runGold = 123;
  const errs = {};
  for (const st of ['menu', 'charselect', 'shop', 'paused', 'gameover', 'win']) {
    Game.state = st; Game.shopIndex = 0; Game.charIndex = 0;
    try { UI.render(TESTCTX); } catch (e) { errs[st] = String((e && e.message) || e); }
  }
  return errs;
};

// Мета: покупка апгрейда, применение к статам, второе дыхание.
globalThis.__checkMeta = function() {
  Meta.data = { best: 0, gold: 5000, upgrades: {} };
  const bought = Meta.buy('maxhp');
  const goldAfter = Meta.data.gold;
  const hpLv = Meta.upgLevel('maxhp');
  // применение к статам
  Meta.data.upgrades = { maxhp: 3, power: 2, speed: 1, light: 2, revive: 1 };
  RNG.seed(1); Game.viewW = 1280; Game.viewH = 720; Game.init(); Game.selectedChar = 'spark'; Game.start();
  const p = Game.player;
  const stats = { maxHp: p.maxHp, dmg: +p.damageMult.toFixed(3), light: p._charLightBonus, revives: p._revives };
  // второе дыхание: gameOver при наличии revive не должен убивать
  p.hp = 5; Game.gameOver();
  const afterRevive = { state: Game.state, hp: Math.round(p.hp), revives: p._revives };
  // второй gameOver (revive потрачен) — теперь смерть
  p.hp = 0; Game.gameOver();
  const afterDeath = Game.state;
  Meta.data = { best: 0, gold: 0, upgrades: {} };   // вернуть мету к чистому
  return { bought, goldAfter, hpLv, stats, afterRevive, afterDeath };
};

// Оба босса спавнятся (Жнец первым, Затмение вторым) с верным именем баннера.
globalThis.__checkBosses = function() {
  RNG.seed(1); Game.viewW = 1280; Game.viewH = 720; Game.init(); Game.start();
  const res = { b1: null, b2: null, win: CONFIG.bossTimes[1] < CONFIG.runDuration };
  Spawner.bossesSpawned = 0; Spawner.spawnBoss(CONFIG.bossTimes[0]); Spawner.bossesSpawned = 1;
  let b = Game.enemies.active.find(e => e.isBoss); res.b1 = b ? b.typeKey : null;
  Spawner.spawnBoss(CONFIG.bossTimes[1]); Spawner.bossesSpawned = 2;
  b = Game.enemies.active.filter(e => e.isBoss).pop(); res.b2 = b ? b.typeKey : null;
  return res;
};

// v2: свет-механики врагов, аномалии/глубины (детерминизм), вехи разблокировок.
globalThis.__checkV2 = function() {
  const out = {};
  RNG.seed(11); Game.viewW = 1280; Game.viewH = 720; Game.init();
  Game.selectedChar = 'spark'; Game.selectedDepth = 0; Game.start();
  const p = Game.player;
  const ph = Spawner.currentPhase(Game.time);
  // микрошаг без Spawner — изолируем механику от случайных волн
  function micro(n) { for (let s = 0; s < n; s++) { Input.keys = {}; Game.updatePlayer(1/60); Game.updateEnemies(1/60); } }

  // Пожиратель высасывает радиус света (3 шт. перебивают восстановление)
  Game.enemies.clear(); p.light = 300; micro(30); const lightNoDev = p.light;
  Game.enemies.clear(); p.light = 300;
  Spawner.spawnTypeAt('devourer', p.x + 130, p.y, ph, false);
  Spawner.spawnTypeAt('devourer', p.x - 130, p.y, ph, false);
  Spawner.spawnTypeAt('devourer', p.x, p.y + 130, ph, false);
  micro(30); out.lightNoDev = +lightNoDev.toFixed(1); out.lightDev = +p.light.toFixed(1);
  out.devourerDrains = p.light < lightNoDev - 5;

  // Дробитель распадается на осколки при смерти
  Game.enemies.clear();
  Spawner.spawnTypeAt('splitter', p.x + 200, p.y, ph, false);
  const spl = Game.enemies.active.find(e => e.typeKey === 'splitter');
  Game.killEnemy(spl);
  out.splitChildren = Game.enemies.active.filter(e => e.typeKey === 'splitling' && !e.dead).length;

  // Якорь роняет пятно тьмы
  Game.enemies.clear(); Game.darkZones.length = 0;
  Spawner.spawnTypeAt('anchor', p.x + 250, p.y, ph, false);
  Game.killEnemy(Game.enemies.active.find(e => e.typeKey === 'anchor'));
  out.darkZones = Game.darkZones.length;

  // Аномалии: детерминизм при равном seed, разные при разном
  Game.depthIndex = 0;
  RNG.seed(99); Game.computeRunMods(); const a1 = Game.runMods.anomalies.map(a => a.key).join(',');
  RNG.seed(99); Game.computeRunMods(); const a2 = Game.runMods.anomalies.map(a => a.key).join(',');
  out.anomalyDet = a1 === a2;
  out.anomalyCountD0 = Game.runMods.anomalies.length;

  // Глубина усиливает врагов и награду
  Game.depthIndex = 2; RNG.seed(99); Game.computeRunMods();
  out.depthHp = +Game.runMods.hp.toFixed(3);
  out.depthReward = +Game.runMods.reward.toFixed(3);
  out.depthLight = +Game.runMods.light.toFixed(3);

  // Вехи разблокировок на чистой мете
  const saved = Meta.data;
  Meta.data = { best: 0, gold: 0, upgrades: {}, maxDepth: 0, unlocks: {}, codex: {}, totalKills: 0 };
  Meta.recordRun({ time: 300, level: 5, kills: 10, killedBoss: false, won: false, depth: 0, seen: new Set(['chaser']) });
  out.beamBySurvive = !!Meta.data.unlocks.beam;
  out.lanternLockedYet = !Meta.data.unlocks.lantern;
  Meta.recordRun({ time: 100, level: 3, kills: 5, killedBoss: true, won: false, depth: 0, seen: new Set() });
  out.lanternByBoss = !!Meta.data.unlocks.lantern;
  Meta.recordRun({ time: 600, level: 9, kills: 99, killedBoss: true, won: true, depth: 0, seen: new Set() });
  out.maxDepthAfterWin = Meta.data.maxDepth;
  out.codexChaser = !!Meta.data.codex.chaser;
  Meta.data = saved;

  return out;
};

// v3 (Слой 2): боссы по глубине, рикошет, герои Угасающий/Зеркало, Рассеиватель, эдж-урон.
globalThis.__checkV3 = function() {
  const out = {}; let thrown = null;
  try {
    Game.viewW = 1280; Game.viewH = 720;
    // ростер боссов по глубине
    out.bossD0 = Spawner.bossKey(0, 0) + ',' + Spawner.bossKey(1, 0);
    out.bossD1 = Spawner.bossKey(0, 1) + ',' + Spawner.bossKey(1, 1);
    out.bossD3 = Spawner.bossKey(0, 3) + ',' + Spawner.bossKey(1, 3);

    // Сумеречный клинок: меньше света → больше урона снаряда
    RNG.seed(7); Game.init(); Game.selectedChar = 'spark'; Game.selectedDepth = 0; Game.start();
    let pd = Game.player; pd.weapons.length = 0; pd.addWeapon('duskblade'); pd.recalc();
    const dd = CONFIG.weapons.duskblade;
    Game.projectiles.clear(); pd.light = CONFIG.light.max; Weapons._bolt(pd, pd.weapons[0], dd, 0);
    const dmgBright = Game.projectiles.active[0] ? Game.projectiles.active[0].dmg : 0;
    Game.projectiles.clear(); pd.light = CONFIG.light.min; Weapons._bolt(pd, pd.weapons[0], dd, 0);
    const dmgDark = Game.projectiles.active[0] ? Game.projectiles.active[0].dmg : 0;
    out.duskBright = +dmgBright.toFixed(1); out.duskDark = +dmgDark.toFixed(1);
    out.duskEdge = dmgDark > dmgBright + 1;

    // Отражённый луч: отскакивает от кромки света
    Game.enemies.clear(); Game.projectiles.clear(); pd.light = 200;
    Game.projectiles.spawn((pp) => { pp.x = pd.x + 150; pp.y = pd.y; pp.vx = 400; pp.vy = 0;
      pp.kind = 'ricochet'; pp.dmg = 10; pp.radius = 5; pp.life = 3; pp.bounces = 2; pp.bounceGain = 0.25; pp.color = '#fff'; pp.hitIds = null; });
    const proj = Game.projectiles.active[0]; const b0 = proj.bounces;
    for (let s = 0; s < 40 && proj.bounces === b0; s++) Game.updateRicochet(proj, 1/60);
    out.ricochetBounced = proj.bounces < b0;

    // Угасающий: свет тает без убийств, убийство подливает
    RNG.seed(7); Game.init(); Game.selectedChar = 'umbra'; Game.selectedDepth = 0; Game.start();
    const pu = Game.player; out.umbraStart = Math.round(pu.light);
    pu.light = 400; Game.enemies.clear();
    for (let s = 0; s < 60; s++) { Input.keys = {}; Game.updatePlayer(1/60); }
    out.umbraAfterDecay = Math.round(pu.light); out.umbraDecays = pu.light < 400;
    const lb = pu.light;
    Spawner.spawnTypeAt('chaser', pu.x + 300, pu.y, Spawner.currentPhase(0), false);
    Game.killEnemy(Game.enemies.active.find(e => e.typeKey === 'chaser'));
    out.umbraKillRefill = pu.light > lb;

    // Зеркало: старт во тьме, осколки от убийств растят свет
    RNG.seed(7); Game.init(); Game.selectedChar = 'mirror'; Game.selectedDepth = 0; Game.start();
    const pm = Game.player; out.mirrorStart = Math.round(pm.light);
    Game.enemies.clear();
    for (let k = 0; k < 3; k++) { Spawner.spawnTypeAt('chaser', pm.x + 300, pm.y, Spawner.currentPhase(0), false);
      Game.killEnemy(Game.enemies.active.find(e => e.typeKey === 'chaser' && !e.dead)); Game.enemies.sweep(); }
    out.mirrorStacks = pm._mirrorStacks;
    pm._mirrorStacks = 15;
    for (let s = 0; s < 180; s++) { Input.keys = {}; Game.updatePlayer(1/60); }
    out.mirrorLightFromStacks = Math.round(pm.light); out.mirrorGrows = pm.light > 180;

    // Рассеиватель: глушит восстановление света, пока рядом
    RNG.seed(7); Game.init(); Game.selectedChar = 'spark'; Game.start();
    const ps = Game.player; Game.enemies.clear();
    Spawner.spawnTypeAt('leech', ps.x + 100, ps.y, Spawner.currentPhase(0), false);
    Game.updateEnemies(1/60);
    out.leechSuppress = Game._lightRecoverMul;

    // Нулевая Точка (boss4 на глубине 3): пульсирует кольцами тьмы
    RNG.seed(7); Game.init(); Game.selectedChar = 'spark'; Game.selectedDepth = 0; Game.start();
    Game.depthIndex = 3; Game.computeRunMods();
    Game.enemies.clear(); Game.projectiles.clear();
    Spawner.bossesSpawned = 1; Spawner.spawnBoss(0);
    const b4 = Game.enemies.active.find(e => e.ring);
    out.boss4IsRing = !!b4;
    if (b4) { b4.x = Game.player.x; b4.y = Game.player.y + 320;
      for (let s = 0; s < 260 && Game.projectiles.active.filter(p => p.hostile).length === 0; s++) Game.updateEnemies(1/60); }
    out.boss4Shots = Game.projectiles.active.filter(p => p.hostile).length;

    // смерть босса (boss3 на Глубине III): путь killEnemy для босса + якори при гибели
    RNG.seed(7); Game.init(); Game.selectedChar = 'spark'; Game.selectedDepth = 0; Game.start();
    Game.depthIndex = 3; Game.computeRunMods();
    Game.enemies.clear(); Game.darkZones.length = 0; Game.killedBoss = false;
    Spawner.bossesSpawned = 0; Spawner.spawnBoss(0);
    const b3 = Game.enemies.active.find(e => e.isBoss);
    out.boss3IsDrain = !!(b3 && b3.drainLight > 0);
    if (b3) Game.hitEnemy(b3, b3.hp + 100, 0, b3.x, b3.y);   // добить
    out.bossDeathClean = Game.killedBoss === true;
    out.boss3Anchors = Game.darkZones.length;

    // РЕГРЕСС hostile-bolt: болт не должен унаследовать hostile от переиспользованного
    // вражеского снаряда из пула (иначе спавнится на игроке и бьёт его — самоурон)
    RNG.seed(7); Game.init(); Game.selectedChar = 'spark'; Game.start();
    const pb = Game.player; pb.weapons.length = 0; pb.addWeapon('bolt');
    Game.enemies.clear(); Game.projectiles.clear();
    Game.projectiles.spawn((pr) => { pr.x = 1e4; pr.y = 1e4; pr.kind = 'eshot'; pr.hostile = true; pr.dmg = 99; pr.radius = 6; pr.life = 3; pr.hitIds = null; });
    Game.projectiles.active[0].dead = true; Game.projectiles.sweep();   // ушёл во free
    Weapons._bolt(pb, pb.weapons[0], CONFIG.weapons.bolt, 0);
    out.boltNotHostile = !Game.projectiles.active.some(p => p.kind === 'bolt' && p.hostile);
  } catch (e) { thrown = String((e && e.stack) || e); }
  out.thrown = thrown;
  return out;
};
`;

const sandbox = {
  window: { addEventListener() {}, devicePixelRatio: 1 },
  document: { getElementById: () => makeFakeCanvas(), createElement: () => makeFakeCanvas() },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  console,
  TESTCTX: makeFakeCtx(),
};
sandbox.window.localStorage = sandbox.localStorage;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
try {
  vm.runInContext(bundle + '\n' + driver, sandbox, { filename: 'lumen-bundle.js' });
} catch (e) {
  console.error('FAIL: ошибка загрузки бандла\n', e);
  process.exit(1);
}

// --- прогон и проверки ---
const fails = [];
const results = [];
const SECONDS = 380;

for (const seed of SEEDS) {
  const r = sandbox.__runSim(seed, SECONDS);
  results.push(r);
  if (r.thrown) fails.push(`seed ${seed}: исключение в логике → ${r.thrown.split('\n')[0]}`);
  if (r.renderErr) fails.push(`seed ${seed}: исключение в рендере → ${r.renderErr.split('\n')[0]}`);
  if (r.level < 6) fails.push(`seed ${seed}: прогрессия не работает (level ${r.level} < 6)`);
  if (r.maxEnemies < 100) fails.push(`seed ${seed}: эскалация слабая (maxEnemies ${r.maxEnemies} < 100)`);
  if (!r.sawHostile) fails.push(`seed ${seed}: дальники не стреляют (нет вражеских снарядов за забег)`);
}

// второй персонаж (Уголёк) — должен играться без ошибок и прогрессировать
const emb = sandbox.__runSim(SEEDS[0], SECONDS, 'ember');
if (emb.thrown) fails.push(`персонаж ember: исключение → ${emb.thrown.split('\n')[0]}`);
if (emb.renderErr) fails.push(`персонаж ember: рендер → ${emb.renderErr.split('\n')[0]}`);
if (emb.char !== 'ember') fails.push(`персонаж ember не применился (char=${emb.char})`);
if (emb.level < 6) fails.push(`персонаж ember: прогрессия не работает (level ${emb.level})`);

// детерминизм: один seed дважды (из одного снапшота Meta) → идентично
const detPair = sandbox.__detPair(SEEDS[0], SECONDS);
const d1 = detPair.a, d2 = detPair.b;
const detKeys = ['time', 'level', 'kills', 'weapons', 'maxEnemies'];
for (const k of detKeys) {
  if (d1[k] !== d2[k]) fails.push(`детерминизм нарушен по '${k}': ${d1[k]} != ${d2[k]}`);
}

// эволюция оружия — end-to-end (чуть длиннее: гарантированно довести bolt до ур.5)
const evo = sandbox.__runEvo(SEEDS[0], 480);
if (evo.thrown) fails.push(`эволюция: исключение → ${evo.thrown.split('\n')[0]}`);
if (!evo.evolved) fails.push(`эволюция не сработала (билд: ${evo.weapons}, lvl ${evo.level})`);
if (evo.evolved && !evo.evoFired) fails.push('эволюционировавшее оружие не стреляет');

// оба босса спавнятся, второй до конца забега
const bosses = sandbox.__checkBosses();
if (!bosses.win) fails.push('2-й босс на runDuration — не успеет заспавниться до победы');
if (bosses.b1 !== 'boss') fails.push(`1-й босс неверный (${bosses.b1})`);
if (bosses.b2 !== 'boss2') fails.push(`2-й босс не спавнится как boss2 (${bosses.b2})`);

// мета-прогрессия: покупка, применение статов, второе дыхание
const meta = sandbox.__checkMeta();
if (!meta.bought) fails.push('магазин: покупка апгрейда не прошла');
if (meta.goldAfter !== 4960) fails.push(`магазин: золото списано неверно (${meta.goldAfter}, ожидалось 4960)`);
if (meta.hpLv !== 1) fails.push(`магазин: уровень апгрейда не вырос (${meta.hpLv})`);
if (meta.stats.maxHp !== 136) fails.push(`мета-статы: maxHp ${meta.stats.maxHp}, ожидалось 136 (100+3*12)`);
if (meta.stats.dmg !== 1.1) fails.push(`мета-статы: dmg ${meta.stats.dmg}, ожидалось 1.1`);
if (meta.stats.light !== 40) fails.push(`мета-статы: lightBonus ${meta.stats.light}, ожидалось 40`);
if (meta.stats.revives !== 1) fails.push(`мета-статы: revives ${meta.stats.revives}, ожидалось 1`);
if (meta.afterRevive.state !== 'playing' || meta.afterRevive.hp <= 0) fails.push(`второе дыхание не сработало (${JSON.stringify(meta.afterRevive)})`);
if (meta.afterRevive.revives !== 0) fails.push(`второе дыхание не потратилось (${meta.afterRevive.revives})`);
if (meta.afterDeath !== 'gameover') fails.push(`после траты revive смерть не наступает (${meta.afterDeath})`);

// v2: свет-механики врагов, аномалии/глубины, вехи разблокировок
const v2 = sandbox.__checkV2();
if (v2.thrown) fails.push(`v2: исключение → ${String(v2.thrown).split('\n')[0]}`);
if (!v2.devourerDrains) fails.push(`Пожиратель не высасывает свет (без:${v2.lightNoDev} с:${v2.lightDev})`);
if (v2.splitChildren !== 3) fails.push(`Дробитель не делится на 3 осколка (детей: ${v2.splitChildren})`);
if (v2.darkZones !== 1) fails.push(`Якорь не роняет пятно тьмы (зон: ${v2.darkZones})`);
if (!v2.anomalyDet) fails.push('аномалии не детерминированы при равном seed');
if (v2.anomalyCountD0 !== 1) fails.push(`аномалий на Поверхности не 1 (${v2.anomalyCountD0})`);
if (!(v2.depthHp > 1.05)) fails.push(`глубина не усиливает HP врагов (${v2.depthHp})`);
if (!(v2.depthReward > 1.3)) fails.push(`глубина не повышает награду (${v2.depthReward})`);
if (!(v2.depthLight < 1)) fails.push(`глубина не сжимает свет (${v2.depthLight})`);
if (!v2.beamBySurvive) fails.push('разблокировка beam за выживание не сработала');
if (!v2.lanternLockedYet) fails.push('lantern открылся преждевременно');
if (!v2.lanternByBoss) fails.push('разблокировка lantern за босса не сработала');
if (v2.maxDepthAfterWin !== 1) fails.push(`победа не открыла Глубину I (maxDepth=${v2.maxDepthAfterWin})`);
if (!v2.codexChaser) fails.push('кодекс не записал убитого');

// v3 (Слой 2): боссы по глубине, рикошет, герои, Рассеиватель, эдж-урон
const v3 = sandbox.__checkV3();
if (v3.thrown) fails.push(`v3: исключение → ${String(v3.thrown).split('\n')[0]}`);
if (v3.bossD0 !== 'boss,boss2') fails.push(`ростер боссов на Поверхности неверен (${v3.bossD0})`);
if (v3.bossD3 !== 'boss3,boss4') fails.push(`ростер боссов на Глубине III неверен (${v3.bossD3})`);
if (!v3.duskEdge) fails.push(`Сумеречный клинок не усиливается у кромки тьмы (свет:${v3.duskBright} тьма:${v3.duskDark})`);
if (!v3.ricochetBounced) fails.push('Отражённый луч не отскакивает от кромки света');
if (!(v3.umbraStart > 500)) fails.push(`Угасающий стартует не с макс. света (${v3.umbraStart})`);
if (!v3.umbraDecays) fails.push(`Угасающий не тает (${v3.umbraAfterDecay})`);
if (!v3.umbraKillRefill) fails.push('Угасающий не получает свет за убийство');
if (!(v3.mirrorStart <= 130)) fails.push(`Зеркало стартует не во тьме (${v3.mirrorStart})`);
if (v3.mirrorStacks !== 3) fails.push(`Зеркало не копит осколки убийств (${v3.mirrorStacks})`);
if (!v3.mirrorGrows) fails.push(`Зеркало не растит свет из осколков (${v3.mirrorLightFromStacks})`);
if (v3.leechSuppress !== 0.3) fails.push(`Рассеиватель не глушит восстановление света (${v3.leechSuppress})`);
if (!v3.boss4IsRing) fails.push('Нулевая Точка не появляется на Глубине III');
if (!(v3.boss4Shots > 0)) fails.push(`Нулевая Точка не пускает кольца тьмы (${v3.boss4Shots})`);
if (!v3.boss3IsDrain) fails.push('Владыка Затмения без ауры высасывания света');
if (!v3.bossDeathClean) fails.push('путь смерти босса (killedBoss) не отработал');
if (v3.boss3Anchors !== 1) fails.push(`Владыка Затмения не роняет якорь при смерти (зон: ${v3.boss3Anchors})`);
if (!v3.boltNotHostile) fails.push('РЕГРЕСС: болт унаследовал hostile от пула (самоурон при рестарте)');

// рендер всех экранов без исключений
const renderErrs = sandbox.__renderStates();
for (const st in renderErrs) fails.push(`рендер экрана '${st}': ${renderErrs[st]}`);

// --- отчёт ---
console.log('\n=== LUMEN регресс-харнесс ===');
for (const r of results) {
  console.log(`seed ${String(r.seed).padStart(5)} | ${r.end.padEnd(8)} | t=${r.time}s | lvl ${r.level} | kills ${r.kills} | maxEn ${r.maxEnemies} | boss ${r.reachedBoss?'да':'нет'} | [${r.weapons}]`);
}
console.log(`детерминизм seed=${SEEDS[0]}: ${fails.some(f=>f.includes('детерминизм'))?'НАРУШЕН':'ОК'}`);
console.log(`эволюция: ${evo.evolved ? 'сработала ['+evo.weapons+']' : 'НЕ сработала'}, стреляет: ${evo.evoFired?'да':'нет'}`);
console.log(`дальники стреляют: ${results.every(r=>r.sawHostile)?'да':'НЕТ'}`);
console.log(`ember: ${emb.end} t=${emb.time}s lvl ${emb.level} kills ${emb.kills} boss ${emb.reachedBoss?'да':'нет'} [${emb.weapons}]`);
console.log(`боссы: 1=${bosses.b1} 2=${bosses.b2} (второй спавнится до победы: ${bosses.win?'да':'НЕТ'})`);
console.log(`мета: покупка ${meta.bought?'OK':'СБОЙ'}, maxHp ${meta.stats.maxHp}, dmg ${meta.stats.dmg}, второе дыхание ${meta.afterRevive.state==='playing'?'OK':'СБОЙ'}`);
console.log(`v2: свет−Пожиратель ${v2.devourerDrains?'OK':'СБОЙ'} (${v2.lightNoDev}→${v2.lightDev}), Дробитель ${v2.splitChildren} осколка, Якорь ${v2.darkZones} зона, аномалии ${v2.anomalyDet?'детерм.':'СБОЙ'}, глубина hp×${v2.depthHp}/свет×${v2.depthLight}, разблок ${[v2.beamBySurvive&&'beam',v2.lanternByBoss&&'lantern'].filter(Boolean).join('+')}, Глубина I ${v2.maxDepthAfterWin===1?'OK':'СБОЙ'}`);
console.log(`v3: боссы D0[${v3.bossD0}] D3[${v3.bossD3}], дусклинок ${v3.duskBright}→${v3.duskDark}, рикошет ${v3.ricochetBounced?'OK':'СБОЙ'}, Угасающий ${v3.umbraStart}→тает→килл+, Зеркало старт${v3.mirrorStart}/осколки${v3.mirrorStacks}→свет${v3.mirrorLightFromStacks}, Рассеиватель ×${v3.leechSuppress}, Нулевая Точка ${v3.boss4Shots} колец`);

if (fails.length) {
  console.log('\n❌ FAIL:');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('\n✅ PASS — все инварианты держатся');
  process.exit(0);
}
