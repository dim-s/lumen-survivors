/* =====================================================================
   AUDIO — синтез SFX через WebAudio (без файлов).
   Лениво инициализируется на первый пользовательский жест.
   ===================================================================== */

import { Meta } from './meta';

export const Audio2: any = {
  ctx: null,
  master: null,
  enabled: true,
  lastPlay: {},
  volume: 0.7,        // 0..1, базовый множитель громкости
  _lastVol: 0.7,

  ensure() {
    if (this.ctx) return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5 * this.volume;
    this.master.connect(this.ctx.destination);
  },

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.volume > 0) this._lastVol = this.volume;
    if (this.master) this.master.gain.value = 0.5 * this.volume;
    if (typeof Meta !== 'undefined') { Meta.data.volume = this.volume; Meta.save(); }
  },
  toggleMute() { this.setVolume(this.volume > 0 ? 0 : this._lastVol); },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  // базовый тон
  tone(freq: number, dur: number, type = 'sine', vol = 0.3, sweep = 0) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur: number, vol = 0.2, hp = 800) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  // троттлинг частых звуков
  _throttle(key: string, ms: number) {
    const now = (this.ctx ? this.ctx.currentTime * 1000 : performance.now());
    if (this.lastPlay[key] && now - this.lastPlay[key] < ms) return false;
    this.lastPlay[key] = now;
    return true;
  },

  shoot()   { if (this._throttle('shoot', 55)) this.tone(620, 0.07, 'square', 0.10, -260); },
  hit()     { if (this._throttle('hit', 28)) this.tone(180, 0.05, 'square', 0.07, -60); },
  kill()    { if (this._throttle('kill', 30)) this.noise(0.09, 0.10, 1200); },
  pickup()  { if (this._throttle('pickup', 40)) this.tone(880, 0.05, 'triangle', 0.07, 200); },
  levelup() { this.tone(523, 0.10, 'triangle', 0.22, 0); setTimeout(() => this.tone(784, 0.16, 'triangle', 0.22, 0), 90); },
  nova()    { this.tone(140, 0.30, 'sawtooth', 0.20, -90); this.noise(0.25, 0.12, 400); },
  hurt()    { this.tone(150, 0.18, 'sawtooth', 0.22, -80); this.noise(0.12, 0.10, 300); },
  boss()    { this.tone(70, 0.7, 'sawtooth', 0.28, 40); this.tone(110, 0.7, 'square', 0.12, 30); },
  bossDie() { this.tone(90, 0.9, 'sawtooth', 0.3, -50); this.noise(0.8, 0.22, 200); },
  death()   { this.tone(330, 0.6, 'sawtooth', 0.28, -260); this.noise(0.4, 0.15, 200); },
  uiMove()  { this.tone(440, 0.04, 'square', 0.05); },
  uiPick()  { this.tone(660, 0.07, 'triangle', 0.10, 120); },

  // атмосферный дрон-луп — низкий пэд с медленным движением фильтра
  music: null,
  startMusic() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || this.music) return;
    const t = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(0.5, t + 3);
    bus.connect(this.master);
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;    // A1
    const o2 = this.ctx.createOscillator(); o2.type = 'sine';     o2.frequency.value = 82.41;  // E2
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 5;
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.05;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 160;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    o1.connect(f); o2.connect(f); f.connect(bus);
    o1.start(t); o2.start(t); lfo.start(t);
    this.music = { bus, o1, o2, lfo };
  },
  stopMusic() {
    if (!this.music || !this.ctx) { this.music = null; return; }
    const t = this.ctx.currentTime;
    const m = this.music; this.music = null;
    try {
      m.bus.gain.cancelScheduledValues(t);
      m.bus.gain.setValueAtTime(m.bus.gain.value, t);
      m.bus.gain.linearRampToValueAtTime(0.0001, t + 0.7);
      m.o1.stop(t + 0.8); m.o2.stop(t + 0.8); m.lfo.stop(t + 0.8);
    } catch (e) {}
  },
};
