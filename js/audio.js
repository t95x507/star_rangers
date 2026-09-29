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
// Several ambient themes rotate every couple of minutes; a separate battle track
// crossfades in while enemies are close and the ambience ducks underneath it.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const THEMES = [
  { name: 'Туманность', bar: 8, wave: 'sawtooth', cutoff: [500, 1300], padVol: 0.06, bellP: 0.28, bellRatio: 3.5, arp: null,
    chords: [[45, 57, 60, 64, 67, 71], [41, 53, 57, 60, 64], [48, 55, 59, 62, 64], [43, 55, 59, 62, 66], [50, 53, 57, 60, 64], [41, 53, 57, 60, 67], [40, 52, 55, 59, 62], [45, 57, 60, 64, 71]] },
  { name: 'Глубокий космос', bar: 11, wave: 'triangle', cutoff: [300, 800], padVol: 0.09, bellP: 0.12, bellRatio: 1.41, arp: null, drone: true,
    chords: [[38, 50, 57, 60, 65], [36, 48, 55, 60, 64], [34, 46, 53, 58, 62], [36, 48, 55, 58, 64]] },
  { name: 'Торговый путь', bar: 6, wave: 'sawtooth', cutoff: [700, 1800], padVol: 0.045, bellP: 0.1, bellRatio: 2, arp: [0, 2, 1, 3, 2, 4, 3, 1],
    chords: [[50, 62, 66, 69, 73], [52, 62, 66, 71, 76], [47, 59, 62, 66, 71], [55, 62, 67, 71, 74], [50, 62, 66, 69, 76], [45, 61, 64, 69, 73]] },
  { name: 'Чужие звёзды', bar: 9, wave: 'square', cutoff: [350, 900], padVol: 0.035, bellP: 0.35, bellRatio: 2.76, arp: null, glide: true,
    chords: [[40, 52, 53, 59, 64], [41, 53, 56, 60, 65], [40, 52, 55, 58, 63], [38, 50, 53, 56, 62]] },
];
const THEME_BARS = 14;

// battle: 132 bpm, A minor, four-on-the-floor with driving bass
const BPM = 132, STEP = 60 / BPM / 4; // 16th note
const BATTLE_PROG = [[45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62], [40, 52, 55, 59], [45, 57, 60, 64], [48, 55, 60, 64], [43, 55, 59, 62], [44, 56, 59, 64]];
const BASS_PAT = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const LEAD_PAT = [0, -1, 2, -1, 1, -1, 3, 2, 0, -1, 2, -1, 3, -1, 1, -1];

let tension = 0, ambGain, battleGain, reverbSend;
let theme = 0, themeBar = 0, nextBar = 0, nextArp = 0, nextStep = 0, bStep = 0;
const barTimes = [];

export function setTension(v) {
  if (!ctx || !!v === !!tension) { tension = v; return; }
  tension = v;
  const t = ctx.currentTime;
  ambGain.gain.setTargetAtTime(v ? 0.25 : 1, t, v ? 0.6 : 2.5);
  battleGain.gain.setTargetAtTime(v ? 1 : 0.0001, t, v ? 0.5 : 2.5);
  if (v) { nextStep = Math.max(nextStep, t + 0.05); }
}
export const currentTheme = () => THEMES[theme].name;

function pad(th, notes, t) {
  const len = th.bar;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
  f.frequency.setValueAtTime(th.cutoff[0], t); f.frequency.linearRampToValueAtTime(th.cutoff[1], t + len * 0.5); f.frequency.linearRampToValueAtTime(th.cutoff[0], t + len + 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(th.padVol, t + Math.min(3, len * 0.35));
  g.gain.setValueAtTime(th.padVol, t + len - 0.5);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 3);
  f.connect(g); g.connect(ambGain); g.connect(reverbSend);
  for (const n of notes.slice(1)) for (const det of [-8, 8]) {
    const o = ctx.createOscillator(); o.type = th.wave;
    o.frequency.value = mtof(n); o.detune.value = det;
    if (th.glide) { o.detune.setValueAtTime(det - 40, t); o.detune.linearRampToValueAtTime(det, t + 2.5); }
    o.connect(f); o.start(t); o.stop(t + len + 3.2);
  }
  const b = ctx.createOscillator(), bg = ctx.createGain();
  b.type = th.drone ? 'sine' : 'triangle'; b.frequency.value = mtof(notes[0] - 12);
  bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(th.drone ? 0.2 : 0.12, t + 1.5); bg.gain.linearRampToValueAtTime(0.0001, t + len + 1);
  b.connect(bg); bg.connect(ambGain); b.start(t); b.stop(t + len + 1.2);
  if (th.drone) { // slowly beating fifth above the drone
    const d = ctx.createOscillator(), dg = ctx.createGain();
    d.type = 'sine'; d.frequency.value = mtof(notes[0] - 5) * 1.003;
    dg.gain.setValueAtTime(0.0001, t); dg.gain.linearRampToValueAtTime(0.05, t + 3); dg.gain.linearRampToValueAtTime(0.0001, t + len + 2);
    d.connect(dg); dg.connect(ambGain); dg.connect(reverbSend); d.start(t); d.stop(t + len + 2.2);
  }
}

function bell(freq, t, vol, ratio, out = ambGain) { // two-operator FM bell
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * 2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.1, t + 1.5);
  mod.connect(mg); mg.connect(car.frequency);
  env(g, t, 0.005, vol, 2.5);
  car.connect(g); g.connect(out); g.connect(reverbSend);
  car.start(t); mod.start(t); car.stop(t + 2.6); mod.stop(t + 2.6);
}

function pluck(freq, t, vol) { // arpeggio pluck with a lowpass sweep
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = freq;
  f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.25);
  env(g, t, 0.004, vol, 0.35);
  o.connect(f); f.connect(g); g.connect(ambGain); g.connect(reverbSend);
  o.start(t); o.stop(t + 0.45);
}

// ---- battle track pieces
function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  env(g, t, 0.002, 0.55, 0.28);
  o.connect(g); g.connect(battleGain); o.start(t); o.stop(t + 0.35);
}
function snare(t) {
  noise(t, 0.18, 0.28, battleGain, 'highpass', 2500, 1200, 0.7);
  osc('triangle', 220, 160, t, 0.1, 0.15, battleGain);
}
function hat(t, open) { noise(t, open ? 0.14 : 0.04, open ? 0.1 : 0.07, battleGain, 'highpass', 8000, 7000, 0.7); }
function bassNote(m, t) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = mtof(m);
  f.type = 'lowpass'; f.Q.value = 8; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + STEP * 1.6);
  env(g, t, 0.003, 0.2, STEP * 1.8);
  o.connect(f); f.connect(g); g.connect(battleGain); o.start(t); o.stop(t + STEP * 2.2);
}
function stab(notes, t) {
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.3);
  env(g, t, 0.004, 0.06, 0.3);
  f.connect(g); g.connect(battleGain); g.connect(reverbSend);
  for (const n of notes.slice(1)) for (const det of [-10, 10]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n + 12); o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + 0.4);
  }
}
function lead(m, t) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'square'; o.frequency.value = mtof(m);
  f.type = 'lowpass'; f.frequency.value = 2200;
  env(g, t, 0.004, 0.045, STEP * 1.5);
  o.connect(f); f.connect(g); g.connect(battleGain); g.connect(reverbSend);
  o.start(t); o.stop(t + STEP * 2);
}

function battleStep(t, i) {
  const s = i % 16, chord = BATTLE_PROG[Math.floor(i / 16) % BATTLE_PROG.length];
  const phrase = Math.floor(i / 64) % 2; // every other 4-bar phrase the lead joins
  if (s % 4 === 0) kick(t);
  if (s === 4 || s === 12) snare(t);
  if (s % 2 === 0) hat(t, s % 8 === 6);
  if (BASS_PAT[s]) bassNote(chord[0] - (s === 15 ? -7 : 0), t);
  if (s === 2 || s === 10 || (s === 7 && phrase)) stab(chord, t);
  if (phrase && LEAD_PAT[s] >= 0) lead(chord[1 + LEAD_PAT[s] % (chord.length - 1)] + 12, t);
}

function startMusic() {
  ambGain = ctx.createGain(); ambGain.gain.value = 1; ambGain.connect(musicBus);
  battleGain = ctx.createGain(); battleGain.gain.value = 0.0001; battleGain.connect(musicBus);
  reverbSend = reverbIn;
  theme = Math.floor(Math.random() * THEMES.length);
  nextBar = ctx.currentTime + 0.3; nextArp = nextBar; nextStep = nextBar;
  setInterval(() => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime, horizon = now + 1.5;
    while (nextBar < horizon) {
      if (themeBar >= THEME_BARS) { themeBar = 0; theme = (theme + 1 + Math.floor(Math.random() * (THEMES.length - 1))) % THEMES.length; }
      const th = THEMES[theme], ch = th.chords[themeBar % th.chords.length];
      barTimes.push([nextBar, ch, th]);
      if (barTimes.length > 4) barTimes.shift();
      pad(th, ch, nextBar);
      nextBar += th.bar; themeBar++;
    }
    while (nextArp < horizon) {
      let ch = barTimes[0][1], th = barTimes[0][2];
      for (const [bt, c, tt] of barTimes) if (bt <= nextArp) { ch = c; th = tt; }
      const beat = th.bar / 8;
      if (th.arp) { // steady arpeggio pattern (two notes per beat)
        for (let k = 0; k < 2; k++) {
          const idx = th.arp[(Math.round(nextArp / (beat / 2)) + k) % th.arp.length];
          pluck(mtof(ch[1 + idx % (ch.length - 1)] + 12), nextArp + k * beat / 2, 0.035);
        }
      }
      if (Math.random() < (tension ? th.bellP * 0.5 : th.bellP)) {
        const n = ch[1 + Math.floor(Math.random() * (ch.length - 1))] + (Math.random() < 0.5 ? 12 : 24);
        bell(mtof(n), nextArp + (Math.random() < 0.3 ? beat / 2 : 0), 0.05 + Math.random() * 0.04, th.bellRatio);
      }
      nextArp += beat;
    }
    // battle track is only scheduled while it can be heard
    if (tension || battleGain.gain.value > 0.01) {
      if (nextStep < now) { nextStep = now + 0.05; bStep = Math.ceil(bStep / 16) * 16; } // restart on a bar line
      while (nextStep < horizon) { battleStep(nextStep, bStep); nextStep += STEP; bStep++; }
    }
  }, 200);
}
