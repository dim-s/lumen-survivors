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

// Порядок скриптов как в index.html
const FILES = [
  'js/config.js', 'js/utils.js', 'js/audio.js', 'js/input.js', 'js/render.js',
  'js/entities.js', 'js/weapons.js', 'js/spawner.js', 'js/ui.js', 'js/game.js', 'js/main.js',
];

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

const bundle = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

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

// Тест эволюции: воронка билда в одно оружие до ур.5 + пассивка → эволюция.
globalThis.__runEvo = function(seed, seconds) {
  RNG.seed(seed >>> 0);
  Game.viewW = 1280; Game.viewH = 720; Game.init(); Game.start();
  const STEP = 1/60; const steps = Math.round(seconds * 60);
  let evolved = false, evoFired = false, sawOffer = false, thrown = null;
  function pickEvo() {
    const o = Game.offers;
    let i = o.findIndex(x => x.type === 'evolve'); if (i >= 0) { sawOffer = true; return i; }
    i = o.findIndex(x => x.type === 'weapon' && x.key === 'bolt'); if (i >= 0) return i;
    i = o.findIndex(x => x.type === 'passive' && x.key === 'power'); if (i >= 0) return i;
    i = o.findIndex(x => x.type === 'weapon'); if (i >= 0) return i;
    return 0;
  }
  try {
    for (let s = 0; s < steps; s++) {
      if (Game.state === 'levelup') Game.chooseOffer(pickEvo());
      if (Game.state === 'gameover' || Game.state === 'win') break;
      const p = Game.player;
      let cx=0, cy=0, c=0;
      for (const e of Game.enemies.active) { if (e.dead) continue; const dd = dist2(p.x,p.y,e.x,e.y); if (dd < 240*240) { cx+=e.x; cy+=e.y; c++; } }
      let mx=0, my=0;
      if (c) { cx/=c; cy/=c; const ax=p.x-cx, ay=p.y-cy, d=Math.hypot(ax,ay)||1; mx=ax/d-ay/d*0.6; my=ay/d+ax/d*0.6; }
      Input.keys = {};
      if (mx>0.2) Input.keys.d=true; if (mx<-0.2) Input.keys.a=true;
      if (my>0.2) Input.keys.s=true; if (my<-0.2) Input.keys.w=true;
      Game.update(STEP);
      if (p.weapons.some(w => CONFIG.evolutions[w.key])) {
        evolved = true;
        if (Game.projectiles.active.length > 0 || Game.effects.length > 0) evoFired = true;
      }
    }
  } catch (e) { thrown = String((e && e.stack) || e); }
  const p = Game.player;
  return { evolved, evoFired, sawOffer, thrown, level: p.level,
           weapons: p.weapons.map(w => w.key+':'+w.level).join(',') };
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

// детерминизм: один seed дважды → идентично
const d1 = sandbox.__runSim(SEEDS[0], SECONDS);
const d2 = sandbox.__runSim(SEEDS[0], SECONDS);
const detKeys = ['time', 'level', 'kills', 'weapons', 'maxEnemies'];
for (const k of detKeys) {
  if (d1[k] !== d2[k]) fails.push(`детерминизм нарушен по '${k}': ${d1[k]} != ${d2[k]}`);
}

// эволюция оружия — end-to-end
const evo = sandbox.__runEvo(SEEDS[0], SECONDS);
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

if (fails.length) {
  console.log('\n❌ FAIL:');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('\n✅ PASS — все инварианты держатся');
  process.exit(0);
}
