/* =====================================================================
   PIXI RENDERER — WebGL-рендер МИРА и ТЬМЫ (Фаза 2).
   Рисует под Canvas2D-оверлеем (UI.render): grid, враги, игрок, снаряды,
   частицы, эффекты, пятна Якорей, тьму/свет (fullscreen-меши-шейдеры),
   глинты. HUD/меню/числа урона остаются на 2D-оверлее (см. ui.ts).

   Камера = смещение мировых контейнеров. Тьма/ореол — экранные fullscreen
   clip-space меши с кастомными шейдерами (alpha-over тьма + аддитивный ореол),
   читают Game.shakeX/Y (их считает UI.render ДО pixi — общий кадр).
   ===================================================================== */

import { Application, Container, Sprite, Texture, Graphics, Mesh, Geometry, Shader } from 'pixi.js';
import { Game } from './game';
import { CONFIG } from './config';
import { Render } from './render';
import { TAU, clamp, dist } from './utils';

// ---------- текстуры из offscreen-canvas (переиспользуем генерацию render.ts) ----------
const texCache = new Map<string, Texture>();
function glowDotTex(color: string, radius: number): Texture {
  radius = Math.max(1, Math.round(radius));
  const key = 'dot|' + color + '|' + radius;
  let t = texCache.get(key);
  if (t) return t;
  t = Texture.from(Render.glowDot(color, radius));
  texCache.set(key, t);
  return t;
}
function glowShapeTex(color: string, radius: number, shape: string): Texture {
  radius = Math.max(1, Math.round(radius));
  const key = 'shape|' + color + '|' + radius + '|' + shape;
  let t = texCache.get(key);
  if (t) return t;
  t = Texture.from(Render.glowShape(color, radius, shape));
  texCache.set(key, t);
  return t;
}
// запечённый радиальный градиент (для пятен тьмы и зон фонаря) по списку стопов
function radialTex(key: string, stops: [number, string][]): Texture {
  const k = 'radial|' + key;
  let t = texCache.get(k);
  if (t) return t;
  const size = 128, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const cx = size / 2;
  const grd = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cx, cx, 0, TAU); g.fill();
  t = Texture.from(c);
  texCache.set(k, t);
  return t;
}
function darkZoneTex() {
  return radialTex('darkzone', [[0, 'rgba(2,2,8,0.74)'], [0.7, 'rgba(2,2,8,0.42)'], [1, 'rgba(2,2,8,0)']]);
}
function lanternTex() {
  return radialTex('lantern', [[0, 'rgba(255,224,150,0.20)'], [0.6, 'rgba(255,206,94,0.07)'], [1, 'rgba(255,176,80,0)']]);
}

// ---------- пул спрайтов в контейнере (покадровая реконсиляция) ----------
class SpritePool {
  container: Container;
  sprites: Sprite[] = [];
  idx = 0;
  constructor(container: Container) { this.container = container; }
  begin() { this.idx = 0; }
  next(tex: Texture): Sprite {
    let s = this.sprites[this.idx];
    if (!s) {
      s = new Sprite(tex); s.anchor.set(0.5);
      this.container.addChild(s); this.sprites.push(s);
    } else { s.texture = tex; }
    s.visible = true; s.alpha = 1; s.rotation = 0; s.scale.set(1); s.tint = 0xffffff;
    this.idx++;
    return s;
  }
  end() { for (let i = this.idx; i < this.sprites.length; i++) this.sprites[i].visible = false; }
}

// ---------- fullscreen clip-space шейдеры (тьма / ореол) ----------
// big-triangle, покрывающий экран; vUV в 0..1 (y-вниз как у canvas — см. flip)
const VERT = `
in vec2 aPosition;
out vec2 vUV;
void main(){
  vUV = vec2((aPosition.x + 1.0) * 0.5, (1.0 - aPosition.y) * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Работаем в UV-долях (0..1) с аспект-коррекцией — независимо от DPR/разрешения буфера.
// uCenter — UV (0.5±shake), uRadius — доля высоты экрана (light/H), uAspect — W/H.
// distV возвращает расстояние в «долях высоты», радиусы в тех же единицах.
const COMMON = `
float seg(float t, float t0, float t1, float a0, float a1){
  return mix(a0, a1, clamp((t - t0) / (t1 - t0), 0.0, 1.0));
}
float distV(vec2 uv, vec2 c, float aspect){
  vec2 q = (uv - c) * vec2(aspect, 1.0);
  return length(q);
}`;

// alpha-over оверлей: тьма игрока (радиал) + cycle-тинт + виньетка по HP. Выход премультиплен.
const DARK_FRAG = `
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uAspect;
uniform float uTime;
uniform float uHpFrac;
uniform float uCycle;
${COMMON}
vec4 over(vec4 dst, vec3 c, float a){            // dst премультиплен, (c,a) straight
  return vec4(c * a + dst.rgb * (1.0 - a), a + dst.a * (1.0 - a));
}
void main(){
  vec4 acc = vec4(0.0);

  // основная тьма (радиал вокруг игрока): ri=r*0.62 .. ro=r*1.28
  float d = distV(vUV, uCenter, uAspect);
  float r = uRadius;
  float t = clamp((d - r * 0.62) / (r * 1.28 - r * 0.62), 0.0, 1.0);
  float aDark;
  if (t <= 0.55) aDark = seg(t, 0.0, 0.55, 0.0, 0.45);
  else if (t <= 0.85) aDark = seg(t, 0.55, 0.85, 0.45, 0.86);
  else aDark = seg(t, 0.85, 1.0, 0.86, 0.975);
  vec3 darkCol = mix(vec3(3.0,4.0,10.0), vec3(1.0,2.0,6.0), t) / 255.0;
  acc = over(acc, darkCol, aDark);

  // cycle-тинт (плоский)
  if (abs(uCycle) >= 0.06){
    if (uCycle < 0.0) acc = over(acc, vec3(24.0,34.0,84.0)/255.0, 0.11 * (-uCycle));
    else acc = over(acc, vec3(255.0,176.0,80.0)/255.0, 0.05 * uCycle);
  }

  // виньетка по HP (экранно-центрированная: H*0.3 .. H*0.75 → доли высоты 0.3..0.75)
  if (uHpFrac < 0.35){
    float inten = (0.35 - uHpFrac) / 0.35;
    float pulse = 0.5 + 0.5 * sin(uTime * 6.0);
    float vd = distV(vUV, vec2(0.5, 0.5), uAspect);
    float vt = clamp((vd - 0.3) / 0.45, 0.0, 1.0);
    acc = over(acc, vec3(255.0,30.0,60.0)/255.0, 0.28 * inten * (0.6 + 0.4 * pulse) * vt);
  }

  finalColor = acc;
}`;

// аддитивный оверлей: тёплый ореол на кромке + красный пульс угрозы. Выход — премультипл. add.
const GLOW_FRAG = `
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uAspect;
uniform float uThreatA;
${COMMON}
void main(){
  float d = distV(vUV, uCenter, uAspect);
  float r = uRadius;
  vec3 add = vec3(0.0);

  // тёплый ореол: hi=r*0.86 .. ho=r*1.04, пик 0.05 на 0.7
  float ht = clamp((d - r * 0.86) / (r * 1.04 - r * 0.86), 0.0, 1.0);
  float ha = (ht <= 0.7) ? seg(ht, 0.0, 0.7, 0.0, 0.05) : seg(ht, 0.7, 1.0, 0.05, 0.0);
  add += vec3(255.0,170.0,72.0)/255.0 * ha;

  // пульс угрозы: красная полоса r*0.92 .. r*1.5, треугольный пик в центре
  if (uThreatA > 0.0){
    float pt = clamp((d - r * 0.92) / (r * 1.5 - r * 0.92), 0.0, 1.0);
    float band = clamp(1.0 - abs(pt - 0.5) / 0.5, 0.0, 1.0);
    add += vec3(255.0,40.0,70.0)/255.0 * (uThreatA * band);
  }

  finalColor = vec4(add, max(ha, uThreatA));
}`;

function makeFsMesh(frag: string, uniforms: any): Mesh {
  const geometry = new Geometry({ attributes: { aPosition: [-1, -1, 3, -1, -1, 3] } });
  const shader = Shader.from({ gl: { vertex: VERT, fragment: frag }, resources: { fsUniforms: uniforms } });
  const mesh = new Mesh({ geometry, shader } as any);
  return mesh;
}

export const PixiRenderer: any = {
  app: null,
  ready: false,
  W: 0, H: 0,

  async init(canvasEl: HTMLCanvasElement, w: number, h: number, dpr: number) {
    this.app = new Application();
    await this.app.init({
      canvas: canvasEl, width: w, height: h,
      background: CONFIG.colors.bg, backgroundAlpha: 1,
      antialias: true, resolution: dpr, autoDensity: true,
      preference: 'webgl', autoStart: false,
    });
    this.W = w; this.H = h;

    // ---- сцена ----
    const stage = this.app.stage;
    this.worldRoot = new Container();
    this.gridGfx = new Graphics();
    this.shapes = new Container();
    this.additive = new Container(); (this.additive as any).blendMode = 'add';
    this.effectsGfx = new Graphics(); (this.effectsGfx as any).blendMode = 'add';
    this.darkZones = new Container();
    this.additive.addChild(this.effectsGfx);
    this.worldRoot.addChild(this.gridGfx, this.shapes, this.additive, this.darkZones);

    this.glints = new Container(); (this.glints as any).blendMode = 'add';

    // ---- пулы ----
    this.poolShapes = new SpritePool(this.shapes);          // враги + силуэт игрока
    this.poolAdd = new SpritePool(this.additive);           // искры, снаряды, частицы, орбита, ядро, фонарь
    this.poolZones = new SpritePool(this.darkZones);        // пятна Якорей
    this.poolGlints = new SpritePool(this.glints);          // глинты
    this.zoneRings = new Graphics();
    this.darkZones.addChild(this.zoneRings);

    // ---- fullscreen меши тьмы/ореола (юниформы в UV-долях + аспект) ----
    this.darkU = { uCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' },
                   uRadius: { value: 0.3, type: 'f32' },
                   uAspect: { value: w / h, type: 'f32' },
                   uTime: { value: 0, type: 'f32' },
                   uHpFrac: { value: 1, type: 'f32' },
                   uCycle: { value: 0, type: 'f32' } };
    this.gloU = { uCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' },
                  uRadius: { value: 0.3, type: 'f32' },
                  uAspect: { value: w / h, type: 'f32' },
                  uThreatA: { value: 0, type: 'f32' } };
    this.darkMesh = makeFsMesh(DARK_FRAG, this.darkU);
    this.gloMesh = makeFsMesh(GLOW_FRAG, this.gloU); (this.gloMesh as any).blendMode = 'add';

    stage.addChild(this.worldRoot, this.darkMesh, this.gloMesh, this.glints);
    this.ready = true;
  },

  resize(w: number, h: number) {
    if (!this.ready) return;
    this.W = w; this.H = h;
    this.app.renderer.resize(w, h);
    this.darkU.uAspect.value = w / h;
    this.gloU.uAspect.value = w / h;
  },

  // ---- кадр ----
  render() {
    if (!this.ready) return;
    const st = Game.state;
    const showWorld = st === 'playing' || st === 'paused' || st === 'levelup' || st === 'gameover' || st === 'win';
    this.worldRoot.visible = showWorld;
    this.darkMesh.visible = showWorld;
    this.gloMesh.visible = showWorld;
    this.glints.visible = showWorld;
    if (showWorld) this.drawWorld();
    this.app.render();
  },

  drawWorld() {
    const p = Game.player, W = this.W, H = this.H, t = Game.time;
    const camX = W / 2 - p.x + Game.shakeX, camY = H / 2 - p.y + Game.shakeY;
    this.worldRoot.position.set(camX, camY);
    this.glints.position.set(camX, camY);

    this.drawGrid(p, W, H);

    this.poolShapes.begin(); this.poolAdd.begin(); this.poolZones.begin(); this.poolGlints.begin();
    this.effectsGfx.clear(); this.zoneRings.clear();

    // ---- искры (additive) ----
    for (const k of Game.pickups.active) {
      if (k.dead) continue;
      if (k.type === 'xp') {
        const fl = 0.7 + 0.3 * Math.sin(t * 9 + k.born * 7);
        const s = this.poolAdd.next(glowDotTex(k.color, 3)); s.position.set(k.x, k.y);
        s.scale.set(fl); s.alpha = 0.85 * fl + 0.1;
      } else {
        const s = this.poolAdd.next(glowDotTex(k.color, k.type === 'xpbig' ? 7 : 6));
        s.position.set(k.x, k.y); s.alpha = 0.95;
      }
    }

    // ---- nova-эффекты (additive, под врагами) ----
    for (const e of Game.effects) {
      if (e.kind !== 'nova') continue;
      const a = clamp(e.life / e.maxLife, 0, 1);
      this.effectsGfx.circle(e.x, e.y, e.r).stroke({ width: 3 + a * 7, color: colorNum(e.color), alpha: a * 0.8 });
    }

    // ---- враги (shapes) + флеш (additive) ----
    for (const e of Game.enemies.active) {
      if (e.dead) continue;
      const X = e.x - p.x + W / 2, Y = e.y - p.y + H / 2;   // экранная отбраковка
      if (X < -60 || X > W + 60 || Y < -60 || Y > H + 60) continue;
      const s = this.poolShapes.next(glowShapeTex(e.color, e.radius, e.shape));
      s.position.set(e.x, e.y);
      s.rotation = e.isBoss ? t * 0.4 : (e.wob + t * 0.8);
      if (e.flash > 0) {
        const f = this.poolAdd.next(glowDotTex('#ffffff', e.radius * 0.9));
        f.position.set(e.x, e.y); f.alpha = clamp(e.flash / CONFIG.feel.hitFlash, 0, 1) * 0.8;
      }
    }

    // ---- снаряды (additive) ----
    for (const pr of Game.projectiles.active) {
      if (pr.dead) continue;
      if (pr.kind === 'bolt') {
        const s = this.poolAdd.next(glowDotTex(pr.color, pr.radius));
        s.position.set(pr.x, pr.y); s.rotation = Math.atan2(pr.vy, pr.vx); s.scale.set(1.7, 0.8);
      } else if (pr.kind === 'mine') {
        const s = this.poolAdd.next(glowDotTex(pr.color, 5));
        s.position.set(pr.x, pr.y); s.scale.set(1 + Math.sin(Game.clock * 8) * 0.15); s.alpha = 0.95;
        this.effectsGfx.circle(pr.x, pr.y, pr.trigger).stroke({ width: 1, color: 0xffd27a, alpha: 0.14 });
      } else if (pr.kind === 'lantern') {
        const a = clamp(pr.life / (pr.maxLife || 1), 0, 1);
        const z = this.poolAdd.next(lanternTex());
        z.position.set(pr.x, pr.y); z.scale.set(pr.radius / 64); z.alpha = a;
        const core = this.poolAdd.next(glowDotTex(pr.color, 6));
        core.position.set(pr.x, pr.y); core.scale.set(1 + Math.sin(Game.clock * 6) * 0.2); core.alpha = a;
      } else {
        const s = this.poolAdd.next(glowDotTex(pr.color, pr.radius)); s.position.set(pr.x, pr.y);
      }
    }

    // ---- цепь-молния, хлыст (additive Graphics) ----
    for (const e of Game.effects) {
      if (e.kind === 'chain') {
        const a = clamp(e.life / e.maxLife, 0, 1);
        const g = this.effectsGfx; g.moveTo(e.pts[0].x, e.pts[0].y);
        for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i].x, e.pts[i].y);
        g.stroke({ width: 2.5, color: colorNum(e.color), alpha: a });
      } else if (e.kind === 'whip') {
        const a = clamp(e.life / e.maxLife, 0, 1);
        const dx = Math.cos(e.ang), dy = Math.sin(e.ang), nx = -dy, ny = dx;
        const bx = e.x, by = e.y;
        const p1x = bx + nx * e.wide * 0.3, p1y = by + ny * e.wide * 0.3;
        const cx1 = bx + dx * e.len * 0.6 - nx * e.wide, cy1 = by + dy * e.len * 0.6 - ny * e.wide;
        const ex = bx + dx * e.len, ey = by + dy * e.len;
        const cx2 = bx + dx * e.len * 0.6 + nx * e.wide, cy2 = by + dy * e.len * 0.6 + ny * e.wide;
        const p2x = bx - nx * e.wide * 0.3, p2y = by - ny * e.wide * 0.3;
        const g = this.effectsGfx;
        g.moveTo(p1x, p1y); g.quadraticCurveTo(cx1, cy1, ex, ey); g.quadraticCurveTo(cx2, cy2, p2x, p2y); g.closePath();
        g.fill({ color: colorNum(e.color), alpha: a * 0.6 });
      }
    }

    // ---- орбита (additive спрайты) и луч-маяк (Graphics) ----
    for (const w of p.weapons) {
      const def = wdef(w.key);
      if (w._nodes && def && def.kind === 'orbit') {
        const tex = glowShapeTex(def.color, def.radius, 'circle');
        for (let i = 0; i < w._nodeCount; i++) {
          const nd = w._nodes[i];
          const s = this.poolAdd.next(tex); s.position.set(nd.x, nd.y); s.rotation = t * 3; s.alpha = 0.95;
        }
      }
      if (w._beams && def && def.kind === 'beam') {
        const hw = def.beamWide * 0.5;
        const al = 0.45 + Math.sin(Game.clock * 18) * 0.1;
        for (const b of w._beams) {
          const dx = Math.cos(b.ang), dy = Math.sin(b.ang), nx = -dy, ny = dx;
          const ax = p.x, ay = p.y, ex = p.x + dx * b.len, ey = p.y + dy * b.len;
          const g = this.effectsGfx;
          g.moveTo(ax + nx * hw, ay + ny * hw).lineTo(ex + nx * hw, ey + ny * hw)
           .lineTo(ex - nx * hw, ey - ny * hw).lineTo(ax - nx * hw, ay - ny * hw).closePath()
           .fill({ color: colorNum(def.color), alpha: al });
          g.moveTo(ax + nx * 2, ay + ny * 2).lineTo(ex + nx * 2, ey + ny * 2)
           .lineTo(ex - nx * 2, ey - ny * 2).lineTo(ax - nx * 2, ay - ny * 2).closePath()
           .fill({ color: 0xfffdf0, alpha: 0.7 });
        }
      }
    }

    // ---- игрок (силуэт + ядро) ----
    const ch = CONFIG.characters[p.charKey] || CONFIG.characters.spark;
    let pAlpha = 1;
    if (p.invuln > 0) pAlpha = (Math.floor(t * 20) % 2) ? 0.35 : 1;
    const sil = this.poolShapes.next(glowShapeTex(ch.color || CONFIG.colors.player, p.radius, ch.shape || 'diamond'));
    sil.position.set(p.x, p.y); sil.rotation = Math.atan2(p.lastDir.y, p.lastDir.x) + Math.PI / 2; sil.alpha = pAlpha;
    const core = this.poolAdd.next(glowDotTex(CONFIG.colors.playerCore, 5));
    core.position.set(p.x, p.y); core.scale.set((5 + Math.sin(t * 6) * 1.2) / 5); core.alpha = pAlpha;

    // ---- частицы (additive) ----
    for (const pt of Game.particles.active) {
      if (pt.dead) continue;
      const s = this.poolAdd.next(glowDotTex(pt.color, pt.size));
      s.position.set(pt.x, pt.y); s.scale.set(pt.fade); s.alpha = pt.fade;
    }

    // ---- пятна Якорей (под тьмой) ----
    for (const z of Game.darkZones) {
      const a = clamp(z.life / z.maxLife, 0, 1);
      const s = this.poolZones.next(darkZoneTex());
      s.position.set(z.x, z.y); s.scale.set(z.r / 64); s.alpha = a;
      this.zoneRings.circle(z.x, z.y, z.r).stroke({ width: 2, color: 0x783cdc, alpha: 0.22 * a });
    }

    // ---- ТЬМА: юниформы (UV-доли) ----
    const cuX = 0.5 + Game.shakeX / W, cuY = 0.5 + Game.shakeY / H, rad = p.light / H;
    this.darkU.uCenter.value[0] = cuX; this.darkU.uCenter.value[1] = cuY;
    this.darkU.uRadius.value = rad;
    this.darkU.uTime.value = t;
    this.darkU.uHpFrac.value = p.hp / p.maxHp;
    this.darkU.uCycle.value = Game.dayNightMult ? (Game.dayNightMult() - 1) / CONFIG.cycle.swing : 0;
    this.gloU.uCenter.value[0] = cuX; this.gloU.uCenter.value[1] = cuY;
    this.gloU.uRadius.value = rad;

    // ---- глинты (поверх тьмы) + подсчёт угрозы ----
    this.drawGlints(p, W, H, t);

    this.poolShapes.end(); this.poolAdd.end(); this.poolZones.end(); this.poolGlints.end();
  },

  drawGrid(p: any, W: number, H: number) {
    const g = this.gridGfx, gap = 64;
    g.clear();
    const left = p.x - W / 2, top = p.y - H / 2;
    const fx = Math.floor(left / gap) * gap, fy = Math.floor(top / gap) * gap;
    for (let x = fx; x < left + W + gap; x += gap) g.moveTo(x, top - gap).lineTo(x, top + H + gap);
    for (let y = fy; y < top + H + gap; y += gap) g.moveTo(left - gap, y).lineTo(left + W + gap, y);
    g.stroke({ width: 1, color: 0x3c5aa0, alpha: 0.08 });
  },

  drawGlints(p: any, W: number, H: number, t: number) {
    const L = CONFIG.light;
    const phase = Game.time % L.flashPeriod;
    const flashI = phase < L.flashDur ? Math.sin(phase / L.flashDur * Math.PI) : 0;
    let darkThreat = 0;
    const tr = L.threatRange;
    for (const e of Game.enemies.active) {
      if (e.dead) continue;
      const X = e.x - p.x + W / 2, Y = e.y - p.y + H / 2;
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      const inDark = d > p.light;
      if (inDark && d < p.light + tr) darkThreat++;
      if (e.isBoss) {
        const s = this.poolGlints.next(glowDotTex(e.color, L.glintRadius * 2.4));
        s.position.set(e.x, e.y); s.alpha = inDark ? 0.4 : L.glintAlpha;
      } else if (inDark && flashI > 0.01) {
        const r = e.radius > 18 ? L.glintRadius * 1.6 : L.glintRadius;
        const s = this.poolGlints.next(glowDotTex(e.color, r));
        s.position.set(e.x, e.y); s.alpha = L.glintAlpha * flashI;
      }
    }
    // пульс угрозы (в шейдере ореола): a = (0.05+0.12*inten)*(0.5+0.5*puls)
    let threatA = 0;
    if (darkThreat > 0) {
      const inten = Math.min(1, darkThreat / 16);
      const puls = 0.5 + 0.5 * Math.sin(Game.time * 5);
      threatA = (0.05 + 0.12 * inten) * (0.5 + 0.5 * puls);
    }
    this.gloU.uThreatA.value = threatA;

    // искры и снаряды видны в темноте
    for (const k of Game.pickups.active) {
      if (k.dead) continue;
      const X = k.x - p.x + W / 2, Y = k.y - p.y + H / 2;
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const s = this.poolGlints.next(glowDotTex(k.color, k.type === 'xpbig' ? 5 : k.type === 'gold' ? 4 : 3));
      s.position.set(k.x, k.y); s.alpha = 0.85;
    }
    for (const pr of Game.projectiles.active) {
      if (pr.dead || pr.kind === 'mine' || pr.kind === 'lantern') continue;
      const X = pr.x - p.x + W / 2, Y = pr.y - p.y + H / 2;
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const s = this.poolGlints.next(glowDotTex(pr.color, L.glintRadius));
      s.position.set(pr.x, pr.y); s.alpha = pr.hostile ? L.shotGlintAlpha : L.glintAlpha;
    }
  },
};

// '#rrggbb' → 0xRRGGBB
const _colorCache = new Map<string, number>();
function colorNum(c: string): number {
  let n = _colorCache.get(c);
  if (n !== undefined) return n;
  n = (c[0] === '#') ? parseInt(c.slice(1), 16) : 0xffffff;
  if (c.length === 4) { // #rgb
    const r = parseInt(c[1], 16), g = parseInt(c[2], 16), b = parseInt(c[3], 16);
    n = (r * 17 << 16) | (g * 17 << 8) | (b * 17);
  }
  _colorCache.set(c, n);
  return n;
}
function wdef(key: string): any { return CONFIG.weapons[key] || CONFIG.evolutions[key]; }
