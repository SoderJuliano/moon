// SONS DE BATALHA — exceção AUTORIZADA à regra "sem som de mundo".
//
// A regra do projeto continua valendo pro jogo em geral (vácuo = silêncio;
// só música e feedback de HUD). O usuário liberou uma experiência: durante a
// BATALHA ÉPICA (invasão + bosses) os canhões soam estilo STAR WARS — sensação
// de canhão de verdade, nada de "pew pew" fininho — e a passagem de uma nave
// capital perto da nossa ronca como um cargueiro passando por um bote.
//
// Tudo sintetizado via Web Audio (filosofia do projeto: nada de mp3), num
// contexto próprio pausável junto com o Esc (setBattleSfxPaused).

let _ctx = null;
function ctx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

export function setBattleSfxPaused(on) {
  if (!_ctx) return;
  (on ? _ctx.suspend() : _ctx.resume()).catch(() => {});
}

// ruído reutilizável (branco levemente amarronzado — corpo, não chiado)
let _noiseBuf = null;
function noiseBuf(c) {
  if (_noiseBuf) return _noiseBuf;
  const len = Math.floor(c.sampleRate * 2);
  _noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = _noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.18 * w) / 1.18;
    d[i] = last * 3.2;
  }
  return _noiseBuf;
}

// ==============================================================================
// CANHÃO REAL DE ARTILHARIA (Disparo Principal) — Som autêntico de canhão militar:
// 1. Detonação de pólvora explosiva (estouro supersônico denso em 380Hz)
// 2. Concussão sub-grave maciça de deslocamento de ar (soco no peito de 98Hz→38Hz)
// 3. Ressonância metálica do tubo e culatra de aço pesado ("KABOOM" oco)
// 4. Eco sísmico rolando no espaço como trovão distante
// ==============================================================================
export function playCannonShot() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.003;

  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-3, t);
  comp.knee.setValueAtTime(6, t);
  comp.ratio.setValueAtTime(6.0, t);
  comp.attack.setValueAtTime(0.001, t);
  comp.release.setValueAtTime(0.2, t);
  comp.connect(c.destination);

  const master = c.createGain();
  master.gain.setValueAtTime(0.85, t);
  master.connect(comp);

  // 1. Detonação explosiva de pólvora (estouro encorpado — zero agudo de brinquedo)
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nzLp = c.createBiquadFilter();
  nzLp.type = "lowpass";
  nzLp.frequency.setValueAtTime(1400, t);
  nzLp.frequency.exponentialRampToValueAtTime(350, t + 0.12);
  const nzBp = c.createBiquadFilter();
  nzBp.type = "bandpass";
  nzBp.frequency.setValueAtTime(380, t);
  nzBp.Q.value = 1.4;
  const nzG = c.createGain();
  nzG.gain.setValueAtTime(1.0, t);
  nzG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  nz.connect(nzLp);
  nzLp.connect(nzBp);
  nzBp.connect(nzG);
  nzG.connect(master);
  nz.start(t);
  nz.stop(t + 0.16);

  // 2. Concussão sub-grave do projétil saindo da boca (soco no peito de 98Hz -> 38Hz)
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(98, t);
  sub.frequency.exponentialRampToValueAtTime(38, t + 0.07);
  sub.frequency.exponentialRampToValueAtTime(28, t + 0.28);
  const shaper = c.createWaveShaper();
  shaper.curve = getBossSoftClipCurve();
  const subG = c.createGain();
  subG.gain.setValueAtTime(0.0, t);
  subG.gain.linearRampToValueAtTime(1.0, t + 0.005);
  subG.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  sub.connect(shaper);
  shaper.connect(subG);
  subG.connect(master);
  sub.start(t);
  sub.stop(t + 0.35);

  // 3. Ressonância metálica do cano de artilharia (o "KABOOM" de aço oco)
  const tube = c.createOscillator();
  tube.type = "triangle";
  tube.frequency.setValueAtTime(165, t);
  tube.frequency.exponentialRampToValueAtTime(52, t + 0.18);
  const tubeF = c.createBiquadFilter();
  tubeF.type = "bandpass";
  tubeF.frequency.setValueAtTime(180, t);
  tubeF.Q.value = 3.0;
  const tubeG = c.createGain();
  tubeG.gain.setValueAtTime(0.7, t);
  tubeG.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  tube.connect(tubeF);
  tubeF.connect(tubeG);
  tubeG.connect(master);
  tube.start(t);
  tube.stop(t + 0.25);

  // 4. Eco sísmico do disparo rolando no espaço
  const roll = c.createBufferSource();
  roll.buffer = noiseBuf(c);
  const rollF = c.createBiquadFilter();
  rollF.type = "lowpass";
  rollF.frequency.setValueAtTime(220, t);
  rollF.frequency.exponentialRampToValueAtTime(80, t + 0.7);
  const rollG = c.createGain();
  rollG.gain.setValueAtTime(0.0, t);
  rollG.gain.linearRampToValueAtTime(0.65, t + 0.04);
  rollG.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  roll.connect(rollF);
  rollF.connect(rollG);
  rollG.connect(master);
  roll.start(t);
  roll.stop(t + 0.9);
}

// CANHÃO PESADO NAVAL (Boss / Nave Capital) — Bateria pesada de 406mm:
// Explosão de artilharia colossal, 20Hz infrassônico e eco sísmico prolongado
export function playHeavyCannon(vol = 1) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.005;

  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-3, t);
  comp.ratio.setValueAtTime(6.0, t);
  comp.connect(c.destination);

  const master = c.createGain();
  master.gain.value = 0.95 * vol;
  master.connect(comp);

  // Explosão colossal de artilharia pesada naval
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nzF = c.createBiquadFilter();
  nzF.type = "lowpass";
  nzF.frequency.setValueAtTime(950, t);
  nzF.frequency.exponentialRampToValueAtTime(140, t + 0.4);
  const nzG = c.createGain();
  nzG.gain.setValueAtTime(1.0, t);
  nzG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  nz.connect(nzF);
  nzF.connect(nzG);
  nzG.connect(master);
  nz.start(t);
  nz.stop(t + 0.55);

  // Concussão profunda de 75Hz -> 20Hz infrassônica
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(75, t);
  sub.frequency.exponentialRampToValueAtTime(20, t + 0.45);
  const shaper = c.createWaveShaper();
  shaper.curve = getBossSoftClipCurve();
  const subG = c.createGain();
  subG.gain.setValueAtTime(0.0, t);
  subG.gain.linearRampToValueAtTime(1.0, t + 0.01);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  sub.connect(shaper);
  shaper.connect(subG);
  subG.connect(master);
  sub.start(t);
  sub.stop(t + 0.7);

  // Eco sísmico longo
  const roll = c.createBufferSource();
  roll.buffer = noiseBuf(c);
  const rollF = c.createBiquadFilter();
  rollF.type = "lowpass";
  rollF.frequency.value = 160;
  const rollG = c.createGain();
  rollG.gain.setValueAtTime(0.5, t + 0.05);
  rollG.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  roll.connect(rollF);
  rollF.connect(rollG);
  rollG.connect(master);
  roll.start(t);
  roll.stop(t + 1.3);
}

// IMPACTO NO ESCUDO — respingo de energia: ping metálico + chiado de campo
export function playShieldHit() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const master = c.createGain();
  master.gain.value = 0.3;
  master.connect(c.destination);

  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(620, t);
  o.frequency.exponentialRampToValueAtTime(190, t + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.3);

  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  nz.playbackRate.value = 2.2;
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.setValueAtTime(1600, t);
  nf.frequency.exponentialRampToValueAtTime(600, t + 0.2);
  nf.Q.value = 2.5;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + 0.25);
}

// ESCUDO QUEBRANDO — vidro de energia: cascata de "cacos" agudos descendo,
// queda de sub e um chiado longo do campo se dissipando
export function playShieldBreak() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.01;
  const master = c.createGain();
  master.gain.value = 0.55;
  master.connect(c.destination);

  for (let i = 0; i < 7; i++) { // cacos: pings curtos em queda
    const t = t0 + i * 0.045;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = 1900 - i * 210 + Math.random() * 160;
    const g = c.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.25);
  }

  const sub = c.createOscillator(); // o "estouro" da bolha
  sub.type = "sine";
  sub.frequency.setValueAtTime(120, t0);
  sub.frequency.exponentialRampToValueAtTime(32, t0 + 0.6);
  const gs = c.createGain();
  gs.gain.setValueAtTime(0.85, t0);
  gs.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
  sub.connect(gs); gs.connect(master);
  sub.start(t0); sub.stop(t0 + 0.75);

  const nz = c.createBufferSource(); // dissipação do campo
  nz.buffer = noiseBuf(c);
  nz.playbackRate.value = 1.8;
  const nf = c.createBiquadFilter();
  nf.type = "highpass";
  nf.frequency.setValueAtTime(900, t0);
  nf.frequency.exponentialRampToValueAtTime(4200, t0 + 0.8);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.3, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t0); nz.stop(t0 + 1);
}

// EXPLOSÃO GRANDE (morte de um boss) — boom profundo com cauda longa
export function playExplosionBig() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const master = c.createGain();
  master.gain.value = 0.7;
  master.connect(c.destination);

  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(110, t);
  sub.frequency.exponentialRampToValueAtTime(24, t + 1.6);
  const gs = c.createGain();
  gs.gain.setValueAtTime(1, t);
  gs.gain.exponentialRampToValueAtTime(0.001, t + 2);
  sub.connect(gs); gs.connect(master);
  sub.start(t); sub.stop(t + 2.1);

  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.setValueAtTime(1100, t);
  nf.frequency.exponentialRampToValueAtTime(120, t + 1.8);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.7, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + 2);
}

// PASSAGEM DA NAVE CAPITAL — o cargueiro roçando no bote: ronco grave que
// incha e passa (doppler leve), com sub que faz "tremer" — amedrontador.
export function playFlybyRumble() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const DUR = 2.6;
  const master = c.createGain();
  master.gain.value = 0.85;
  master.connect(c.destination);

  const nz = c.createBufferSource(); // o corpo do ronco
  nz.buffer = noiseBuf(c);
  nz.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.setValueAtTime(160, t);
  nf.frequency.linearRampToValueAtTime(320, t + DUR * 0.4); // chegando
  nf.frequency.exponentialRampToValueAtTime(90, t + DUR); // passou
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.exponentialRampToValueAtTime(0.9, t + DUR * 0.38);
  ng.gain.exponentialRampToValueAtTime(0.001, t + DUR);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + DUR + 0.1);

  const sub = c.createOscillator(); // o tremor (motores gigantes)
  sub.type = "sawtooth";
  sub.frequency.setValueAtTime(38, t);
  sub.frequency.linearRampToValueAtTime(44, t + DUR * 0.4); // doppler chegando
  sub.frequency.exponentialRampToValueAtTime(26, t + DUR); // se afastando
  const sf = c.createBiquadFilter();
  sf.type = "lowpass";
  sf.frequency.value = 90;
  const gs = c.createGain();
  gs.gain.setValueAtTime(0.001, t);
  gs.gain.exponentialRampToValueAtTime(0.8, t + DUR * 0.4);
  gs.gain.exponentialRampToValueAtTime(0.001, t + DUR);
  sub.connect(sf); sf.connect(gs); gs.connect(master);
  sub.start(t); sub.stop(t + DUR + 0.1);
}

// Curva de saturação analógica suave para enriquecer o sub-grave do boss
let _bossSoftClipCurve = null;
function getBossSoftClipCurve() {
  if (_bossSoftClipCurve) return _bossSoftClipCurve;
  const n = 256;
  _bossSoftClipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    _bossSoftClipCurve[i] = Math.tanh(x * 2.2);
  }
  return _bossSoftClipCurve;
}

// RUPTURA DO PORTAL DO BOSS — escala colossal de nave capital / buraco negro massivo:
// 1. Pulsos de sucção gravitacional com dissonância e tensão crescente
// 2. Transiente cortante de fissura no tecido espaço-tempo
// 3. Sub-grave sísmico devastador (160Hz mergulhando até 18Hz infrassônico com saturação)
// 4. Ondas gravitacionais duplas com modulação cruzada (7.5Hz e 11Hz)
// 5. Reverberação sísmica cósmica prolongada de 3.5s
export function playBossRupture() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.015;

  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-4, t0);
  comp.knee.setValueAtTime(6, t0);
  comp.ratio.setValueAtTime(5.5, t0);
  comp.attack.setValueAtTime(0.002, t0);
  comp.release.setValueAtTime(0.28, t0);
  comp.connect(c.destination);

  const master = c.createGain();
  master.gain.setValueAtTime(0.95, t0);
  master.connect(comp);

  // --- 1. SUCÇÃO GRAVITACIONAL ESCALONADA (Pulsos dissonantes de tensão) ---
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.38;
    const dur = 0.34;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(38 + i * 12, t);
    o.frequency.exponentialRampToValueAtTime(140 + i * 40, t + dur * 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.35 + i * 0.16, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);

    // Camada dissonante (trítono / tensão alienígena)
    const o2 = c.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.setValueAtTime((38 + i * 12) * 1.414, t);
    o2.frequency.exponentialRampToValueAtTime((140 + i * 40) * 1.414, t + dur * 0.9);
    const f2 = c.createBiquadFilter();
    f2.type = "lowpass";
    f2.frequency.value = 340;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.001, t);
    g2.gain.linearRampToValueAtTime(0.18 + i * 0.08, t + dur * 0.85);
    g2.gain.linearRampToValueAtTime(0.0001, t + dur);
    o2.connect(f2);
    f2.connect(g2);
    g2.connect(master);
    o2.start(t);
    o2.stop(t + dur + 0.02);
  }

  // --- 2. O DESABROCHAR SÍSMICO COLOSSAL DO BOSS (tHit = t0 + 1.18s — sem martelada, pura gravidade) ---
  const tHit = t0 + 1.18;

  // A. Sub-grave sísmico colossal (52Hz -> 18Hz infrassônico profundo, ataque aveludado de 60ms)
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(54, tHit);
  sub.frequency.exponentialRampToValueAtTime(32, tHit + 0.45);
  sub.frequency.exponentialRampToValueAtTime(18, tHit + 3.0);
  const subG = c.createGain();
  subG.gain.setValueAtTime(0.0, tHit);
  subG.gain.linearRampToValueAtTime(1.0, tHit + 0.06); // subida aveludada de 60ms
  subG.gain.exponentialRampToValueAtTime(0.7, tHit + 0.5);
  subG.gain.exponentialRampToValueAtTime(0.001, tHit + 3.4);
  sub.connect(subG);
  subG.connect(master);
  sub.start(tHit);
  sub.stop(tHit + 3.5);

  // B. Sub saturado analógico quente para tremer fones e caixas
  const sat = c.createOscillator();
  sat.type = "triangle";
  sat.frequency.setValueAtTime(44, tHit);
  sat.frequency.exponentialRampToValueAtTime(20, tHit + 1.4);
  const shaper = c.createWaveShaper();
  shaper.curve = getBossSoftClipCurve();
  const satG = c.createGain();
  satG.gain.setValueAtTime(0.0, tHit);
  satG.gain.linearRampToValueAtTime(0.65, tHit + 0.07);
  satG.gain.exponentialRampToValueAtTime(0.001, tHit + 2.0);
  sat.connect(shaper);
  shaper.connect(satG);
  satG.connect(master);
  sat.start(tHit);
  sat.stop(tHit + 2.1);

  // C. Ressonância fluida de cavidade cósmica profunda (tensão superficial cósmica)
  const cavity = c.createOscillator();
  cavity.type = "sine";
  cavity.frequency.setValueAtTime(98, tHit);
  cavity.frequency.exponentialRampToValueAtTime(45, tHit + 1.2);
  const cavityF = c.createBiquadFilter();
  cavityF.type = "bandpass";
  cavityF.frequency.setValueAtTime(210, tHit);
  cavityF.frequency.exponentialRampToValueAtTime(70, tHit + 1.4);
  cavityF.Q.value = 3.5;
  const cavityG = c.createGain();
  cavityG.gain.setValueAtTime(0.0, tHit);
  cavityG.gain.linearRampToValueAtTime(0.7, tHit + 0.06);
  cavityG.gain.exponentialRampToValueAtTime(0.001, tHit + 1.6);
  cavity.connect(cavityF);
  cavityF.connect(cavityG);
  cavityG.connect(master);
  cavity.start(tHit);
  cavity.stop(tHit + 1.7);

  // D. ONDAS GRAVITACIONAIS DUPLAS (Ondulações cantadas com modulação cruzada — 6.5Hz e 9.0Hz)
  // Onda 1: Varredura aveludada de 280Hz -> 85Hz
  const chirp1 = c.createOscillator();
  chirp1.type = "triangle";
  chirp1.frequency.setValueAtTime(110, tHit);
  chirp1.frequency.exponentialRampToValueAtTime(50, tHit + 2.0);
  const bp1 = c.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.Q.value = 4.5;
  bp1.frequency.setValueAtTime(280, tHit);
  bp1.frequency.exponentialRampToValueAtTime(85, tHit + 1.8);
  const lfo1 = c.createOscillator();
  lfo1.frequency.setValueAtTime(6.5, tHit);
  const lfoG1 = c.createGain();
  lfoG1.gain.value = 65;
  lfo1.connect(lfoG1);
  lfoG1.connect(bp1.frequency);
  lfo1.start(tHit);
  lfo1.stop(tHit + 2.1);

  const chirpG1 = c.createGain();
  chirpG1.gain.setValueAtTime(0.0, tHit);
  chirpG1.gain.linearRampToValueAtTime(0.65, tHit + 0.07);
  chirpG1.gain.exponentialRampToValueAtTime(0.001, tHit + 2.0);
  chirp1.connect(bp1);
  bp1.connect(chirpG1);
  chirpG1.connect(master);
  chirp1.start(tHit);
  chirp1.stop(tHit + 2.1);

  // Onda 2: Varredura harmônica secundária de 420Hz -> 140Hz
  const chirp2 = c.createOscillator();
  chirp2.type = "sine";
  chirp2.frequency.setValueAtTime(160, tHit);
  chirp2.frequency.exponentialRampToValueAtTime(70, tHit + 1.6);
  const bp2 = c.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.Q.value = 5.0;
  bp2.frequency.setValueAtTime(420, tHit);
  bp2.frequency.exponentialRampToValueAtTime(140, tHit + 1.6);
  const lfo2 = c.createOscillator();
  lfo2.frequency.setValueAtTime(9.0, tHit);
  const lfoG2 = c.createGain();
  lfoG2.gain.value = 80;
  lfo2.connect(lfoG2);
  lfoG2.connect(bp2.frequency);
  lfo2.start(tHit);
  lfo2.stop(tHit + 1.8);

  const chirpG2 = c.createGain();
  chirpG2.gain.setValueAtTime(0.0, tHit);
  chirpG2.gain.linearRampToValueAtTime(0.45, tHit + 0.07);
  chirpG2.gain.exponentialRampToValueAtTime(0.001, tHit + 1.8);
  chirp2.connect(bp2);
  bp2.connect(chirpG2);
  chirpG2.connect(master);
  chirp2.start(tHit);
  chirp2.stop(tHit + 1.9);

  // E. Ruído sísmico e eco do rasgo dimensional
  const tear = c.createBufferSource();
  tear.buffer = noiseBuf(c);
  const tearF = c.createBiquadFilter();
  tearF.type = "lowpass";
  tearF.frequency.setValueAtTime(320, tHit);
  tearF.frequency.exponentialRampToValueAtTime(65, tHit + 2.8);
  const tearG = c.createGain();
  tearG.gain.setValueAtTime(0.55, tHit + 0.1);
  tearG.gain.exponentialRampToValueAtTime(0.001, tHit + 3.2);
  tear.connect(tearF);
  tearF.connect(tearG);
  tearG.connect(master);
  tear.start(tHit);
  tear.stop(tHit + 3.3);
}

// PULSO ELETROMAGNÉTICO (EMP) — onda de choque magnética da quebra de escudo
export function playEmpShockwave() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const master = c.createGain();
  master.gain.value = 0.85;
  master.connect(c.destination);

  // Zumbido elétrico agudo modulado
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
  o.frequency.exponentialRampToValueAtTime(60, t + 1.8);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(600, t);
  f.frequency.exponentialRampToValueAtTime(3200, t + 0.4);
  f.frequency.exponentialRampToValueAtTime(200, t + 2.0);
  f.Q.value = 3.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.75, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t); o.stop(t + 2.3);

  // Subgrave de choque e explosão
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(140, t);
  sub.frequency.exponentialRampToValueAtTime(25, t + 1.4);
  const gs = c.createGain();
  gs.gain.setValueAtTime(1.0, t);
  gs.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
  sub.connect(gs); gs.connect(master);
  sub.start(t); sub.stop(t + 1.9);

  // Descarga elétrica e estática ruidosa
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  nz.playbackRate.value = 2.2;
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.setValueAtTime(2800, t);
  nf.frequency.exponentialRampToValueAtTime(300, t + 1.6);
  nf.Q.value = 2.5;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.65, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + 1.9);
}

// CANHÃO PESADO ALIENÍGENA (Mini-chefe) — 4 disparos de plasma denso e explosivo
export function playAlienQuadShot() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.003;
  const master = c.createGain();
  master.gain.value = 0.65;
  master.connect(c.destination);

  for (let i = 0; i < 4; i++) {
    const t = t0 + i * 0.055;

    // Detonação explosiva de plasma
    const nz = c.createBufferSource();
    nz.buffer = noiseBuf(c);
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.setValueAtTime(420, t);
    nf.Q.value = 1.6;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.7, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    nz.connect(nf); nf.connect(ng); ng.connect(master);
    nz.start(t); nz.stop(t + 0.14);

    // Baque sub-grave alienígena (130Hz -> 36Hz)
    const sub = c.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(130, t);
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.09);
    const gsub = c.createGain();
    gsub.gain.setValueAtTime(0.8, t);
    gsub.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    sub.connect(gsub); gsub.connect(master);
    sub.start(t); sub.stop(t + 0.15);
  }
}

// CANHÃO DO CAÇA ESTELAR (SW-X) — Autocanhão pesado rotativo de 30mm:
// Dois disparos escalonados de artilharia rápida com detonação de pólvora real
export function playFighterCannonShot() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.003;
  const master = c.createGain();
  master.gain.value = 0.85;
  master.connect(c.destination);

  for (let i = 0; i < 2; i++) {
    const t = t0 + i * 0.065; // cadência pesada de canhão duplo

    // Estouro de pólvora do autocanhão
    const nz = c.createBufferSource();
    nz.buffer = noiseBuf(c);
    const nFilt = c.createBiquadFilter();
    nFilt.type = "lowpass";
    nFilt.frequency.setValueAtTime(1200, t);
    nFilt.frequency.exponentialRampToValueAtTime(320, t + 0.1);
    const nG = c.createGain();
    nG.gain.setValueAtTime(0.9, t);
    nG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    nz.connect(nFilt); nFilt.connect(nG); nG.connect(master);
    nz.start(t); nz.stop(t + 0.14);

    // Soco de pressão no peito (105Hz -> 38Hz)
    const sub = c.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(105, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.06);
    const shaper = c.createWaveShaper();
    shaper.curve = getBossSoftClipCurve();
    const subG = c.createGain();
    subG.gain.setValueAtTime(0.95, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    sub.connect(shaper); shaper.connect(subG); subG.connect(master);
    sub.start(t); sub.stop(t + 0.24);

    // Ressonância de aço da culatra
    const tube = c.createOscillator();
    tube.type = "triangle";
    tube.frequency.setValueAtTime(175, t);
    tube.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const tubeG = c.createGain();
    tubeG.gain.setValueAtTime(0.55, t);
    tubeG.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    tube.connect(tubeG); tubeG.connect(master);
    tube.start(t); tube.stop(t + 0.16);
  }
}

// CANHÃO DA NAVE TECNOLÓGICA (XR-07) — Canhão Railgun cinético de hipervelocidade:
// Detonação explosiva intensa + soco de impacto cinético + eco metálico
export function playBaseTechShot() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.003;
  const master = c.createGain();
  master.gain.value = 0.9;
  master.connect(c.destination);

  // Detonação eletromagnética / pólvora hipersônica
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nLp = c.createBiquadFilter();
  nLp.type = "lowpass";
  nLp.frequency.setValueAtTime(1600, t);
  nLp.frequency.exponentialRampToValueAtTime(380, t + 0.14);
  const nG = c.createGain();
  nG.gain.setValueAtTime(1.0, t);
  nG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  nz.connect(nLp); nLp.connect(nG); nG.connect(master);
  nz.start(t); nz.stop(t + 0.18);

  // Soco sísmico cinético (115Hz -> 34Hz)
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(115, t);
  sub.frequency.exponentialRampToValueAtTime(34, t + 0.08);
  const shaper = c.createWaveShaper();
  shaper.curve = getBossSoftClipCurve();
  const subG = c.createGain();
  subG.gain.setValueAtTime(1.0, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  sub.connect(shaper); shaper.connect(subG); subG.connect(master);
  sub.start(t); sub.stop(t + 0.3);

  // Ressonância metálica do cano longo
  const ring = c.createOscillator();
  ring.type = "triangle";
  ring.frequency.setValueAtTime(190, t);
  ring.frequency.exponentialRampToValueAtTime(60, t + 0.16);
  const ringG = c.createGain();
  ringG.gain.setValueAtTime(0.65, t);
  ringG.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  ring.connect(ringG); ringG.connect(master);
  ring.start(t); ring.stop(t + 0.22);
}

// CANHÃO DO ÔNIBUS ESPACIAL (Shuttle) — Obuseiro pesado de 155mm:
// Detonação sísmica colossal com soco violento de ar e eco rolando
export function playShuttleShot() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.003;
  const master = c.createGain();
  master.gain.value = 0.95;
  master.connect(c.destination);

  // Explosão pesada de 155mm
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nLp = c.createBiquadFilter();
  nLp.type = "lowpass";
  nLp.frequency.setValueAtTime(1100, t);
  nLp.frequency.exponentialRampToValueAtTime(240, t + 0.2);
  const nG = c.createGain();
  nG.gain.setValueAtTime(1.0, t);
  nG.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  nz.connect(nLp); nLp.connect(nG); nG.connect(master);
  nz.start(t); nz.stop(t + 0.26);

  // Concussão de ar maciça (78Hz -> 28Hz)
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(78, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 0.12);
  const shaper = c.createWaveShaper();
  shaper.curve = getBossSoftClipCurve();
  const subG = c.createGain();
  subG.gain.setValueAtTime(1.0, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  sub.connect(shaper); shaper.connect(subG); subG.connect(master);
  sub.start(t); sub.stop(t + 0.48);

  // Eco de artilharia rolando no horizonte
  const roll = c.createBufferSource();
  roll.buffer = noiseBuf(c);
  const rollF = c.createBiquadFilter();
  rollF.type = "lowpass";
  rollF.frequency.value = 150;
  const rollG = c.createGain();
  rollG.gain.setValueAtTime(0.65, t + 0.04);
  rollG.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
  roll.connect(rollF); rollF.connect(rollG); rollG.connect(master);
  roll.start(t); roll.stop(t + 1.0);
}

// IMPACTO NA BLINDAGEM / CASCO — batida metálica seca com estalo e vibração interna
export function playArmorImpact() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.004;
  const master = c.createGain();
  master.gain.value = 0.55;
  master.connect(c.destination);

  // Clang metálico
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.28);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1400;
  f.Q.value = 3.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.32);

  // Ruído de atrito e estalo de blindagem
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.setValueAtTime(3200, t);
  nf.frequency.exponentialRampToValueAtTime(400, t + 0.18);
  nf.Q.value = 2.0;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.55, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + 0.22);

  // Eco de choque estrutural
  const th = c.createOscillator();
  th.type = "sine";
  th.frequency.setValueAtTime(110, t);
  th.frequency.exponentialRampToValueAtTime(28, t + 0.35);
  const gth = c.createGain();
  gth.gain.setValueAtTime(0.8, t);
  gth.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  th.connect(gth); gth.connect(master);
  th.start(t); th.stop(t + 0.4);
}
