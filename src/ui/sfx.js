// Efeitos sonoros de INTERFACE sintetizados via Web Audio (mesma filosofia do
// SpaceAudio: nada de mp3 pra baixar, roda leve em qualquer aparelho).
//
// Sons de mundo (tiros, impactos, explosões) NÃO existem de propósito: som não
// se propaga no vácuo. Só a interface "fala" com o jogador.
//
//  • playDiscovery(): jingle de "nova descoberta" estilo No Man's Sky — arpejo
//    maior ascendente com sinos suaves e um delay que deixa o rabo brilhando.
//
// O AudioContext é criado no primeiro uso, sempre depois de um gesto do usuário
// (a tela de tecnologia só fecha com clique — gesto válido).

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

// IMPORTANTE: NÃO existem sons de MUNDO (tiro, impacto, explosão) — no vácuo o
// som não se propaga. Só música/trilha e feedback de INTERFACE (jingle de
// conquista, chime de entrega/missão) tocam.

// CHIME de entrega/agradecimento (UI): dois sininhos ascendentes suaves
// (positivo, menos pomposo que a conquista) — feedback de HUD, não de mundo.
export function playChime() {
  const c = ctx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);
  const t = c.currentTime + 0.01;
  bell(c, master, 784, t, 0.6, 0.16); // G5
  bell(c, master, 1046.5, t + 0.1, 0.7, 0.14); // C6
}

// sino suave: seno + parcial em 2f bem baixinho, ataque curto, cauda longa
function bell(c, dest, freq, when, dur, vol) {
  for (const [mult, gainMul] of [[1, 1], [2, 0.25]]) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol * gainMul, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
}

// ruído sintetizado para o rasgo e sucção do portal
let _portalNoiseBuf = null;
function getPortalNoise(c) {
  if (_portalNoiseBuf) return _portalNoiseBuf;
  const len = Math.floor(c.sampleRate * 2.8);
  _portalNoiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = _portalNoiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.16 * w) / 1.16;
    d[i] = last * 3.4;
  }
  return _portalNoiseBuf;
}

// Curva de saturação analógica suave (warm soft-clipping) para enriquecer o sub-grave
let _softClipCurve = null;
function getSoftClipCurve() {
  if (_softClipCurve) return _softClipCurve;
  const n = 256;
  _softClipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    _softClipCurve[i] = Math.tanh(x * 2.0);
  }
  return _softClipCurve;
}

// RUPTURA DE PORTAL — impacto cinematográfico estilo "ondas gravitacionais" /
// rompimento de tensão superficial cósmico (inspirado no sound design de Thomas Blanchard):
// 1. Sucção/implosão gravitacional prévia (vórtice que puxa o espaço-tempo — Audio Black Hole)
// 2. Transiente percussivo cortante (a ruptura física da membrana do continuum)
// 3. Sub-grave sísmico visceral com saturação harmônica (soco no peito de 135Hz a 25Hz)
// 4. Chirp ressonante de ondas gravitacionais com modulação ondulatória em 9Hz
// 5. Thump secundário de deslocamento de massa na saída da nave alienígena (~1.5s)
// RUPTURA DE PORTAL — impacto orgânico e aveludado de ONDAS GRAVITACIONAIS
// (fiel à macrocinematografia fluida de Thomas Blanchard — sem estalo/martelada):
// 1. Sucção suave e aveludada do vácuo cósmico (whoosh de baixa frequência)
// 2. Desabrochar sísmico fluido (ataque arredondado de 50ms, mergulho suave de 58Hz→24Hz)
// 3. Ressonância de cavidade fluida (filtro passa-banda quente em 240Hz→90Hz)
// 4. Ondas gravitacionais cantantes (ondulação hipnótica e aveludada em 6.8Hz)
// 5. Deslocamento fluido na emergência da nave alienígena (~1.5s)
export function playPortalRupture() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.01;

  // Compressor de dinâmica para colar as camadas e manter a maciez
  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-4, t0);
  comp.knee.setValueAtTime(8, t0);
  comp.ratio.setValueAtTime(4.0, t0);
  comp.attack.setValueAtTime(0.005, t0);
  comp.release.setValueAtTime(0.28, t0);
  comp.connect(c.destination);

  const master = c.createGain();
  master.gain.setValueAtTime(0.9, t0);
  master.connect(comp);

  // --- 1. SUCÇÃO PRÉVIA SUAVE (t0 -> t0 + 0.42s: vácuo aveludado sem estridência) ---
  const suckNoise = c.createBufferSource();
  suckNoise.buffer = getPortalNoise(c);
  const suckFilter = c.createBiquadFilter();
  suckFilter.type = "bandpass";
  suckFilter.frequency.setValueAtTime(110, t0);
  suckFilter.frequency.exponentialRampToValueAtTime(520, t0 + 0.4);
  suckFilter.Q.value = 2.0;
  const suckGain = c.createGain();
  suckGain.gain.setValueAtTime(0.001, t0);
  suckGain.gain.exponentialRampToValueAtTime(0.38, t0 + 0.38);
  suckGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.42); // respiro antes do bloom
  suckNoise.connect(suckFilter);
  suckFilter.connect(suckGain);
  suckGain.connect(master);
  suckNoise.start(t0);
  suckNoise.stop(t0 + 0.44);

  const suckTone = c.createOscillator();
  suckTone.type = "sine";
  suckTone.frequency.setValueAtTime(36, t0);
  suckTone.frequency.exponentialRampToValueAtTime(95, t0 + 0.4);
  const suckToneGain = c.createGain();
  suckToneGain.gain.setValueAtTime(0.001, t0);
  suckToneGain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.38);
  suckToneGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.42);
  suckTone.connect(suckToneGain);
  suckToneGain.connect(master);
  suckTone.start(t0);
  suckTone.stop(t0 + 0.44);

  // --- 2. O DESABROCHAR SÍSMICO FLUIDO (tHit = t0 + 0.42s — sem martelada, pura gravidade) ---
  const tHit = t0 + 0.42;

  // A. Sub-grave profundo com ataque arredondado (sem estalo seco)
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(62, tHit);
  sub.frequency.exponentialRampToValueAtTime(38, tHit + 0.35);
  sub.frequency.exponentialRampToValueAtTime(22, tHit + 2.4);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(0.0, tHit);
  subGain.gain.linearRampToValueAtTime(0.95, tHit + 0.055); // subida aveludada de 55ms
  subGain.gain.exponentialRampToValueAtTime(0.6, tHit + 0.4);
  subGain.gain.exponentialRampToValueAtTime(0.001, tHit + 2.8);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(tHit);
  sub.stop(tHit + 2.9);

  // B. Calor harmônico encorpado (curva suave de saturação para tremer o peito)
  const satSub = c.createOscillator();
  satSub.type = "triangle";
  satSub.frequency.setValueAtTime(48, tHit);
  satSub.frequency.exponentialRampToValueAtTime(26, tHit + 1.2);
  const shaper = c.createWaveShaper();
  shaper.curve = getSoftClipCurve();
  const satGain = c.createGain();
  satGain.gain.setValueAtTime(0.0, tHit);
  satGain.gain.linearRampToValueAtTime(0.5, tHit + 0.06);
  satGain.gain.exponentialRampToValueAtTime(0.001, tHit + 1.8);
  satSub.connect(shaper);
  shaper.connect(satGain);
  satGain.connect(master);
  satSub.start(tHit);
  satSub.stop(tHit + 1.9);

  // C. Ressonância fluida de cavidade (o som de gota densa expandindo)
  const cavity = c.createOscillator();
  cavity.type = "sine";
  cavity.frequency.setValueAtTime(118, tHit);
  cavity.frequency.exponentialRampToValueAtTime(64, tHit + 0.8);
  const cavityFilter = c.createBiquadFilter();
  cavityFilter.type = "bandpass";
  cavityFilter.frequency.setValueAtTime(240, tHit);
  cavityFilter.frequency.exponentialRampToValueAtTime(85, tHit + 1.0);
  cavityFilter.Q.value = 3.2;
  const cavityGain = c.createGain();
  cavityGain.gain.setValueAtTime(0.0, tHit);
  cavityGain.gain.linearRampToValueAtTime(0.65, tHit + 0.05);
  cavityGain.gain.exponentialRampToValueAtTime(0.001, tHit + 1.1);
  cavity.connect(cavityFilter);
  cavityFilter.connect(cavityGain);
  cavityGain.connect(master);
  cavity.start(tHit);
  cavity.stop(tHit + 1.2);

  // D. ONDAS GRAVITACIONAIS (Ondulação cantada e aveludada do vácuo — 6.8Hz)
  const rippleTone = c.createOscillator();
  rippleTone.type = "triangle";
  rippleTone.frequency.setValueAtTime(96, tHit);
  rippleTone.frequency.exponentialRampToValueAtTime(54, tHit + 1.6);
  const rippleFilter = c.createBiquadFilter();
  rippleFilter.type = "bandpass";
  rippleFilter.Q.value = 4.5;
  rippleFilter.frequency.setValueAtTime(320, tHit);
  rippleFilter.frequency.exponentialRampToValueAtTime(110, tHit + 1.5);

  const lfo = c.createOscillator();
  lfo.frequency.setValueAtTime(6.8, tHit);
  lfo.frequency.linearRampToValueAtTime(4.5, tHit + 1.5);
  const lfoG = c.createGain();
  lfoG.gain.value = 75; // ondulação suave de filtro
  lfo.connect(lfoG);
  lfoG.connect(rippleFilter.frequency);
  lfo.start(tHit);
  lfo.stop(tHit + 1.8);

  const rippleGain = c.createGain();
  rippleGain.gain.setValueAtTime(0.0, tHit);
  rippleGain.gain.linearRampToValueAtTime(0.55, tHit + 0.07);
  rippleGain.gain.exponentialRampToValueAtTime(0.001, tHit + 1.7);
  rippleTone.connect(rippleFilter);
  rippleFilter.connect(rippleGain);
  rippleGain.connect(master);
  rippleTone.start(tHit);
  rippleTone.stop(tHit + 1.8);

  // --- 3. DESLOCAMENTO DE MASSA DA CHEGADA DA NAVE (tArrive = tHit + 1.15s ≈ t0 + 1.53s) ---
  const tArrive = tHit + 1.15;

  const arrSub = c.createOscillator();
  arrSub.type = "sine";
  arrSub.frequency.setValueAtTime(92, tArrive);
  arrSub.frequency.exponentialRampToValueAtTime(32, tArrive + 0.5);
  const arrGain = c.createGain();
  arrGain.gain.setValueAtTime(0.0, tArrive);
  arrGain.gain.linearRampToValueAtTime(0.68, tArrive + 0.03);
  arrGain.gain.exponentialRampToValueAtTime(0.001, tArrive + 0.6);
  arrSub.connect(arrGain);
  arrGain.connect(master);
  arrSub.start(tArrive);
  arrSub.stop(tArrive + 0.65);

  const arrNoise = c.createBufferSource();
  arrNoise.buffer = getPortalNoise(c);
  const arrNoiseFilter = c.createBiquadFilter();
  arrNoiseFilter.type = "lowpass";
  arrNoiseFilter.frequency.setValueAtTime(380, tArrive);
  arrNoiseFilter.frequency.exponentialRampToValueAtTime(90, tArrive + 0.6);
  const arrNoiseGain = c.createGain();
  arrNoiseGain.gain.setValueAtTime(0.48, tArrive);
  arrNoiseGain.gain.exponentialRampToValueAtTime(0.001, tArrive + 0.65);
  arrNoise.connect(arrNoiseFilter);
  arrNoiseFilter.connect(arrNoiseGain);
  arrNoiseGain.connect(master);
  arrNoise.start(tArrive);
  arrNoise.stop(tArrive + 0.7);

  // --- 4. CAUDA DE VÁCUO CÓSMICO (dissipação lenta no espaço) ---
  const tailNoise = c.createBufferSource();
  tailNoise.buffer = getPortalNoise(c);
  const tailFilter = c.createBiquadFilter();
  tailFilter.type = "lowpass";
  tailFilter.frequency.value = 190;
  const tailGain = c.createGain();
  tailGain.gain.setValueAtTime(0.38, tHit + 0.1);
  tailGain.gain.exponentialRampToValueAtTime(0.001, tHit + 2.4);
  tailNoise.connect(tailFilter);
  tailFilter.connect(tailGain);
  tailGain.connect(master);
  tailNoise.start(tHit);
  tailNoise.stop(tHit + 2.5);
}

// PING DE SCANNER (UI): pulso de sonar estilo No Man's Sky. Um "wob" senoidal
// que varre de agudo pra grave com eco realimentado — casa com o clarão do
// scanner na tela. É feedback de INTERFACE (equipamento da nave "falando" com o
// piloto), não som de mundo: toca no vácuo por ser diegético do HUD.
export function playScanPulse() {
  const c = ctx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);

  // eco curto pra dar o "rabo" espacial do ping
  const delay = c.createDelay(0.5);
  delay.delayTime.value = 0.19;
  const fb = c.createGain();
  fb.gain.value = 0.38;
  delay.connect(fb);
  fb.connect(delay);
  const wet = c.createGain();
  wet.gain.value = 0.35;
  delay.connect(wet);
  wet.connect(c.destination);
  master.connect(delay);

  const t = c.currentTime + 0.02;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(1320, t);
  o.frequency.exponentialRampToValueAtTime(360, t + 0.4); // varredura descendente
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 4;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.6, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(bp);
  bp.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.5);

  // "sino" agudo curtíssimo no ataque, dá o clique do disparo
  bell(c, master, 1760, t, 0.18, 0.12);
}

// pausa/retoma o contexto dos efeitos junto com o jogo (cauda de jingle
// tocando no momento do Esc congela e volta de onde parou)
export function setSfxPaused(on) {
  if (!_ctx) return;
  (on ? _ctx.suspend() : _ctx.resume()).catch(() => {});
}

// arpejo de descoberta: E5 → G#5 → B5 → E6 (acorde maior subindo) com delay
// realimentado — o "brilho" que fica soando depois das notas, estilo NMS.
export function playDiscovery() {
  const c = ctx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);

  const delay = c.createDelay(1);
  delay.delayTime.value = 0.23;
  const fb = c.createGain();
  fb.gain.value = 0.34;
  delay.connect(fb);
  fb.connect(delay);
  const wet = c.createGain();
  wet.gain.value = 0.4;
  delay.connect(wet);
  wet.connect(c.destination);
  master.connect(delay);

  const t0 = c.currentTime + 0.03;
  const notes = [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6
  notes.forEach((f, i) => bell(c, master, f, t0 + i * 0.15, 1.6, 0.22));
  bell(c, master, 1975.53, t0 + notes.length * 0.15 + 0.1, 2.2, 0.1); // B6: floreio final
}
