// Procedural sound effects and generative ambient music (Web Audio, no asset files).

const KEY = 'star-rangers-audio';
const settings = { music: 0.5, sfx: 0.7 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }

let ctx = null, sfxBus, musicBus, reverbIn, noiseBuf;
let recent = []; // start times of recent sfx, to avoid a wall of noise in big fights

export function getSettings() { return { ...settings }; }
export const audioState = () => (ctx ? ctx.state : 'none');
export function setVolume(kind, v) {
  settings[kind] = v;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  if (!ctx) return;
  const bus = kind === 'music' ? musicBus : sfxBus;
  bus.gain.setTargetAtTime(kind === 'music' ? v * 0.55 : v, ctx.currentTime, 0.05);
}

// Must be called from a user gesture (browsers block audio until then).
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14; master.ratio.value = 4;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = settings.music * 0.55; musicBus.connect(master);
  // shared reverb (generated impulse response)
  const conv = ctx.createConvolver();
  const len = ctx.sampleRate * 3.5, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  conv.buffer = ir;
  reverbIn = ctx.createGain(); reverbIn.gain.value = 0.9;
  reverbIn.connect(conv); conv.connect(musicBus);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  startMusic();
}

// ---------------------------------------------------------------- building blocks

function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
function osc(type, f0, f1, t, dur, peak, out, a = 0.005) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, a, peak, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}
function noise(t, dur, peak, out, type = 'lowpass', f0 = 2000, f1 = 200, q = 0.7, a = 0.005) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}
function voice(vol) {
  if (!ctx || ctx.state !== 'running' || vol <= 0.01) return null;
  const now = ctx.currentTime;
  recent = recent.filter(x => now - x < 0.12);
  if (recent.length > 6) return null;
  recent.push(now);
  const g = ctx.createGain(); g.gain.value = vol;
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = (Math.random() - 0.5) * 0.5; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
  return { out: g, t: now + 0.01 };
}

// ---------------------------------------------------------------- effects

const WEAPON_SFX = {
  w1(o, t) { osc('square', 1800, 260, t, 0.16, 0.18, o); osc('sine', 3600, 900, t, 0.08, 0.08, o); },
  w2(o, t) { for (let i = 0; i < 3; i++) noise(t + i * 0.05, 0.07, 0.35, o, 'bandpass', 3000, 900, 2); osc('square', 220, 90, t, 0.1, 0.1, o); },
  w3(o, t) { osc('sawtooth', 520, 70, t, 0.35, 0.16, o); osc('sine', 260, 40, t, 0.4, 0.3, o); noise(t, 0.25, 0.12, o, 'bandpass', 1800, 300, 4); },
  w4(o, t) { noise(t, 0.45, 0.3, o, 'bandpass', 400, 2500, 1.5, 0.08); osc('sine', 120, 45, t + 0.3, 0.3, 0.4, o); },
  w5(o, t) { osc('sawtooth', 70, 1400, t, 0.5, 0.18, o, 0.05); osc('sine', 55, 30, t, 0.7, 0.45, o); noise(t + 0.1, 0.5, 0.18, o, 'highpass', 6000, 1500, 0.7); },
};
export function weapon(w, vol = 1) { const v = voice(vol * 0.7); if (v) (WEAPON_SFX[w] || WEAPON_SFX.w1)(v.out, v.t); }

export function explosion(big = 1, vol = 1) {
  const v = voice(vol); if (!v) return;
  const d = 0.9 + big * 0.5;
  noise(v.t, d, 0.9, v.out, 'lowpass', 2400, 60, 0.8, 0.01);
  osc('sine', 90, 28, v.t, d * 0.8, 0.9, v.out);
  noise(v.t + 0.05, 0.3, 0.3, v.out, 'highpass', 5000, 2000);
}

const UI_SFX = {
  click: (o, t) => osc('sine', 1400, 1100, t, 0.04, 0.12, o),
  order: (o, t) => { osc('sine', 880, 880, t, 0.06, 0.1, o); osc('sine', 1320, 1320, t + 0.05, 0.08, 0.08, o); },
  coin: (o, t) => { osc('triangle', 1568, 1568, t, 0.1, 0.18, o); osc('triangle', 2093, 2093, t + 0.07, 0.25, 0.16, o); },
  buyEq: (o, t) => { for (const [i, f] of [523, 659, 784, 1046].entries()) osc('triangle', f, f, t + i * 0.07, 0.25, 0.14, o); noise(t, 0.2, 0.1, o, 'bandpass', 800, 3000, 3); },
  error: (o, t) => { osc('square', 200, 160, t, 0.12, 0.12, o); osc('square', 150, 120, t + 0.12, 0.15, 0.12, o); },
  land: (o, t) => { noise(t, 0.9, 0.25, o, 'lowpass', 2500, 200, 1, 0.1); osc('sine', 300, 90, t, 0.8, 0.2, o, 0.1); osc('sine', 660, 660, t + 0.7, 0.3, 0.08, o); },
  takeoff: (o, t) => { noise(t, 1.0, 0.25, o, 'lowpass', 200, 3000, 1, 0.2); osc('sawtooth', 80, 260, t, 1.0, 0.1, o, 0.2); },
  jump: (o, t) => { osc('sawtooth', 60, 2400, t, 1.4, 0.14, o, 0.3); osc('sine', 120, 3000, t + 0.2, 1.3, 0.18, o, 0.2); noise(t, 1.6, 0.2, o, 'bandpass', 300, 6000, 5, 0.4); },
  arrive: (o, t) => { osc('sine', 2400, 110, t, 1.0, 0.2, o, 0.02); noise(t, 0.8, 0.2, o, 'bandpass', 5000, 300, 4); },
  alert: (o, t) => { for (let i = 0; i < 2; i++) { osc('square', 880, 880, t + i * 0.22, 0.12, 0.12, o); osc('square', 660, 660, t + i * 0.22 + 0.11, 0.1, 0.1, o); } },
  pickup: (o, t) => { for (const [i, f] of [784, 988, 1175, 1568].entries()) osc('sine', f, f, t + i * 0.05, 0.12, 0.15, o); },
  victory: (o, t) => { for (const [i, f] of [523, 659, 784, 1046, 784, 1046].entries()) osc('triangle', f, f, t + i * 0.14, 0.4, 0.18, o); },
  bad: (o, t) => { for (const [i, f] of [392, 370, 311, 262].entries()) osc('sawtooth', f, f * 0.98, t + i * 0.25, 0.4, 0.1, o); },
};
export function ui(name, vol = 1) { const v = voice(vol); if (v && UI_SFX[name]) UI_SFX[name](v.out, v.t); }

// ---------------------------------------------------------------- generative music

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// A minor-ish progression, each chord lasts one bar
const CHORDS = [
  [45, 57, 60, 64, 67, 71], // Am9
  [41, 53, 57, 60, 64],     // Fmaj7
  [48, 55, 59, 62, 64],     // Cmaj9
  [43, 55, 59, 62, 66],     // G(maj7)
  [50, 53, 57, 60, 64],     // Dm9
  [41, 53, 57, 60, 67],     // Fadd9
  [40, 52, 55, 59, 62],     // Em7
  [45, 57, 60, 64, 71],     // Am(add9)
];
const BAR = 8;
let tension = 0, tensionGain, nextBar = 0, bar = 0, nextStep = 0;
const barTimes = [];

export function setTension(v) {
  tension = v;
  if (tensionGain) tensionGain.gain.setTargetAtTime(v ? 0.9 : 0.0001, ctx.currentTime, v ? 1.2 : 3);
}

function pad(notes, t) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
  f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1300, t + BAR * 0.5); f.frequency.linearRampToValueAtTime(600, t + BAR + 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 2.5);
  g.gain.setValueAtTime(0.06, t + BAR - 0.5);
  g.gain.linearRampToValueAtTime(0.0001, t + BAR + 3);
  f.connect(g); g.connect(musicBus); g.connect(reverbIn);
  for (const n of notes.slice(1)) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.value = mtof(n); o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + BAR + 3.2);
  }
  // soft sub bass on the root
  const b = ctx.createOscillator(), bg = ctx.createGain();
  b.type = 'triangle'; b.frequency.value = mtof(notes[0] - 12);
  bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.12, t + 1.5); bg.gain.linearRampToValueAtTime(0.0001, t + BAR + 1);
  b.connect(bg); bg.connect(musicBus); b.start(t); b.stop(t + BAR + 1.2);
}

function bell(freq, t, vol) { // two-operator FM bell into the reverb
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * 3.5;
  mg.gain.setValueAtTime(freq * 2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.1, t + 1.5);
  mod.connect(mg); mg.connect(car.frequency);
  env(g, t, 0.005, vol, 2.5);
  car.connect(g); g.connect(musicBus); g.connect(reverbIn);
  car.start(t); mod.start(t); car.stop(t + 2.6); mod.stop(t + 2.6);
}

function pulse(notes, t) { // tension layer: filtered bass eighths and a soft kick
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 6;
  f.connect(tensionGain);
  for (let i = 0; i < 16; i++) {
    const tt = t + i * BAR / 16;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(notes[0] - (i % 4 === 3 ? 5 : 12));
    env(g, tt, 0.005, 0.12, 0.2);
    o.connect(g); g.connect(f); o.start(tt); o.stop(tt + 0.3);
    if (i % 4 === 0) {
      const k = ctx.createOscillator(), kg = ctx.createGain();
      k.frequency.setValueAtTime(110, tt); k.frequency.exponentialRampToValueAtTime(40, tt + 0.25);
      env(kg, tt, 0.003, 0.35, 0.3);
      k.connect(kg); kg.connect(tensionGain); k.start(tt); k.stop(tt + 0.4);
    }
  }
}

function startMusic() {
  tensionGain = ctx.createGain(); tensionGain.gain.value = 0.0001; tensionGain.connect(musicBus);
  nextBar = ctx.currentTime + 0.3; nextStep = nextBar;
  setInterval(() => {
    if (ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 1.5;
    while (nextBar < horizon) {
      const ch = CHORDS[bar % CHORDS.length];
      barTimes.push([nextBar, ch]);
      if (barTimes.length > 4) barTimes.shift();
      pad(ch, nextBar);
      pulse(ch, nextBar);
      nextBar += BAR; bar++;
    }
    while (nextStep < horizon) {
      let ch = CHORDS[0];
      for (const [bt, c] of barTimes) if (bt <= nextStep) ch = c;
      // sparse arpeggio; busier when there is danger around
      if (Math.random() < (tension ? 0.45 : 0.28)) {
        const n = ch[1 + Math.floor(Math.random() * (ch.length - 1))] + (Math.random() < 0.5 ? 12 : 24);
        bell(mtof(n), nextStep + (Math.random() < 0.3 ? BAR / 16 : 0), 0.05 + Math.random() * 0.04);
      }
      nextStep += BAR / 8;
    }
  }, 250);
}
