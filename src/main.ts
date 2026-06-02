/* =====================================================================
   MAIN — загрузка, размер canvas (DPR), фикс-таймстеп цикл, ввод.
   Точка входа ESM-сборки (Vite / Electron).
   ===================================================================== */

import '../css/style.css';
import { CONFIG } from './config';
import { RNG, clamp } from './utils';
import { Meta } from './meta';
import { Audio2 } from './audio';
import { Input } from './input';
import { Game } from './game';
import { UI } from './ui';

let canvas: any, ctx: any, dpr = 1;

function resize() {
  const cssW = window.innerWidth, cssH = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Game.viewW = cssW;
  Game.viewH = cssH;
}

// попадание курсора в прямоугольник (для кликабельных UI-зон)
function hit(r: any) {
  return r && Input.mouseX >= r.x && Input.mouseX <= r.x + r.w &&
         Input.mouseY >= r.y && Input.mouseY <= r.y + r.h;
}

function handleInput() {
  const st = Game.state;
  if (st === 'menu') {
    if (Input.wasPressed('m')) Game.openShop();
    else if (Input.clicked && hit(Game._menuShopRect)) Game.openShop();
    else if (Input.wasPressed(' ') || Input.clicked) Game.openCharSelect();
  } else if (st === 'charselect') {
    const n = Object.keys(CONFIG.characters).length;
    if (Input.wasPressed('arrowleft') || Input.wasPressed('a')) { Game.charIndex = (Game.charIndex + n - 1) % n; Audio2.uiMove(); }
    if (Input.wasPressed('arrowright') || Input.wasPressed('d')) { Game.charIndex = (Game.charIndex + 1) % n; Audio2.uiMove(); }
    // выбор Глубины Тьмы (вверх/вниз), не выше открытой
    const maxD = (typeof Meta !== 'undefined') ? Meta.data.maxDepth : 0;
    if (Input.wasPressed('arrowup') || Input.wasPressed('w')) { Game.selectedDepth = clamp(Game.selectedDepth + 1, 0, maxD); Audio2.uiMove(); }
    if (Input.wasPressed('arrowdown') || Input.wasPressed('s')) { Game.selectedDepth = clamp(Game.selectedDepth - 1, 0, maxD); Audio2.uiMove(); }
    // клик по стрелкам выбора глубины
    let depthClicked = false;
    if (Input.clicked && Game._depthRects) {
      if (hit(Game._depthRects.left)) { Game.selectedDepth = clamp(Game.selectedDepth - 1, 0, maxD); Audio2.uiMove(); depthClicked = true; }
      else if (hit(Game._depthRects.right)) { Game.selectedDepth = clamp(Game.selectedDepth + 1, 0, maxD); Audio2.uiMove(); depthClicked = true; }
    }
    if (Game._charRects) {
      for (let i = 0; i < Game._charRects.length; i++) {
        const r = Game._charRects[i];
        if (Input.mouseX >= r.x && Input.mouseX <= r.x + r.w && Input.mouseY >= r.y && Input.mouseY <= r.y + r.h) {
          if (Game.charIndex !== i) { Game.charIndex = i; Audio2.uiMove(); }
        }
      }
    }
    if (Input.wasPressed('enter') || Input.wasPressed(' ')) Game.confirmChar();
    else if (Input.clicked && !depthClicked && Game._charRects) {
      for (let i = 0; i < Game._charRects.length; i++) {
        const r = Game._charRects[i];
        if (Input.mouseX >= r.x && Input.mouseX <= r.x + r.w && Input.mouseY >= r.y && Input.mouseY <= r.y + r.h) {
          Game.charIndex = i; Game.confirmChar(); break;
        }
      }
    }
  } else if (st === 'playing') {
    if (Input.wasPressed('escape') || Input.wasPressed('p')) Game.togglePause();
  } else if (st === 'paused') {
    if (Input.wasPressed('escape') || Input.wasPressed('p')) Game.togglePause();
    else if (Input.wasPressed('[')) Audio2.setVolume(Audio2.volume - 0.1);
    else if (Input.wasPressed(']')) Audio2.setVolume(Audio2.volume + 0.1);
    else if (Input.wasPressed('m')) Audio2.toggleMute();
    else if (Input.wasPressed('q')) Game.quitToMenu();
    else if (Input.clicked) {
      if (hit(Game._pauseRects && Game._pauseRects.resume)) Game.togglePause();
      else if (hit(Game._pauseRects && Game._pauseRects.quit)) Game.quitToMenu();
      else if (hit(Game._volRect)) Audio2.setVolume((Input.mouseX - Game._volRect.x) / Game._volRect.w);
    }
  } else if (st === 'levelup') {
    const n = Game.offers.length;
    if (Input.wasPressed('arrowleft') || Input.wasPressed('a')) { Game.selIndex = (Game.selIndex + n - 1) % n; Audio2.uiMove(); }
    if (Input.wasPressed('arrowright') || Input.wasPressed('d')) { Game.selIndex = (Game.selIndex + 1) % n; Audio2.uiMove(); }
    if (Game._cardRects) {
      for (let i = 0; i < Game._cardRects.length; i++) {
        const r = Game._cardRects[i];
        if (Input.mouseX >= r.x && Input.mouseX <= r.x + r.w && Input.mouseY >= r.y && Input.mouseY <= r.y + r.h) {
          if (Game.selIndex !== i) { Game.selIndex = i; Audio2.uiMove(); }
        }
      }
    }
    if (Input.wasPressed('1')) Game.chooseOffer(0);
    else if (Input.wasPressed('2')) Game.chooseOffer(1);
    else if (Input.wasPressed('3')) Game.chooseOffer(2);
    else if (Input.wasPressed('enter') || Input.wasPressed(' ')) Game.chooseOffer(Game.selIndex);
    else if (Input.clicked && Game._cardRects) {
      for (let i = 0; i < Game._cardRects.length; i++) {
        const r = Game._cardRects[i];
        if (Input.mouseX >= r.x && Input.mouseX <= r.x + r.w && Input.mouseY >= r.y && Input.mouseY <= r.y + r.h) {
          Game.chooseOffer(i); break;
        }
      }
    }
  } else if (st === 'gameover' || st === 'win') {
    if (Input.wasPressed('m')) Game.state = 'menu';                 // в меню (магазин/смена героя)
    else if (Input.clicked && hit(Game._resultMenuRect)) Game.state = 'menu';
    else if (Input.wasPressed(' ') || Input.clicked) Game.start();  // быстрый рестарт тем же героем
  } else if (st === 'shop') {
    const n = CONFIG.shop.length;
    if (Input.wasPressed('arrowup') || Input.wasPressed('w')) { Game.shopIndex = (Game.shopIndex + n - 1) % n; Audio2.uiMove(); }
    if (Input.wasPressed('arrowdown') || Input.wasPressed('s')) { Game.shopIndex = (Game.shopIndex + 1) % n; Audio2.uiMove(); }
    if (Game._shopRects) {
      for (let i = 0; i < Game._shopRects.length; i++) {
        const r = Game._shopRects[i];
        if (Input.mouseX >= r.x && Input.mouseX <= r.x + r.w && Input.mouseY >= r.y && Input.mouseY <= r.y + r.h) {
          if (Game.shopIndex !== i) { Game.shopIndex = i; Audio2.uiMove(); }
        }
      }
    }
    if (Input.clicked && hit(Game._shopBackRect)) {
      Game.state = 'menu';
    } else if (Input.wasPressed('enter') || Input.wasPressed(' ') || Input.clicked) {
      if (Meta.buy(CONFIG.shop[Game.shopIndex].key)) Audio2.uiPick(); else Audio2.hit();
    }
    if (Input.wasPressed('escape') || Input.wasPressed('m')) Game.state = 'menu';
  }
}

let acc = 0, last = 0;
const STEP = 1 / 60;

function frame(now: number) {
  if (!last) last = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  Game.clock += dt;

  // отладочная заморозка: рендерим кадр, но не обновляем мир и не читаем ввод
  if ((window as any).__freeze) { UI.render(ctx); Input.endFrame(); requestAnimationFrame(frame); return; }

  handleInput();

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) { Game.update(STEP); acc -= STEP; steps++; }
  if (acc > STEP * 5) acc = 0;

  UI.render(ctx);
  Input.endFrame();
  requestAnimationFrame(frame);
}

window.addEventListener('load', () => {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  // сид RNG: ?seed=N для детерминированных тестов, иначе по времени
  const params = new URLSearchParams(location.search);
  const sp = params.get('seed');
  const seed = sp !== null ? (parseInt(sp, 10) >>> 0) : (Date.now() >>> 0);
  RNG.seed(seed);
  (window as any).__seed = seed;
  Game.clock = 0;
  Meta.load();
  Audio2.volume = (Meta.data.volume != null) ? Meta.data.volume : 0.7;
  Audio2._lastVol = Audio2.volume || 0.7;
  Game.init();
  Input.init(canvas);
  resize();
  window.addEventListener('resize', resize);
  setupImmersive();
  // отладочные хуки для автотестов
  (window as any).GAME = Game;
  (window as any).RNG = RNG;
  requestAnimationFrame(frame);
});

// На тач-устройствах по первому жесту: полный экран + блокировка ландшафта.
// Требует пользовательского жеста; на iOS lock недоступен — там работает
// CSS-оверлей #rotate (просьба повернуть). Всё в try/catch — тихо деградирует.
function enterImmersive() {
  const el = document.documentElement as any;
  const fs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  const lock = () => {
    try { if ((screen as any).orientation && (screen as any).orientation.lock) (screen as any).orientation.lock('landscape').catch(() => {}); }
    catch (e) {}
  };
  try {
    if (!document.fullscreenElement && fs) {
      const r = fs.call(el);
      if (r && r.then) r.then(lock).catch(lock); else lock();
    } else { lock(); }
  } catch (e) { lock(); }
}

function setupImmersive() {
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouch) return;
  const once = () => {
    enterImmersive();
    window.removeEventListener('touchend', once);
    window.removeEventListener('pointerdown', once);
  };
  // первый жест включает иммерсивный режим (один раз)
  window.addEventListener('touchend', once, { passive: true });
  window.addEventListener('pointerdown', once, { passive: true });
  // если игрок вышел из полноэкранного и снова тапнул — попробовать вернуть ландшафт
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      const retry = () => { enterImmersive(); window.removeEventListener('touchend', retry); };
      window.addEventListener('touchend', retry, { passive: true, once: true } as any);
    }
  });
}
