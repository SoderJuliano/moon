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

// CANHÃO DO JOGADOR — turbolaser de caça: ataque de ruído + varredura de serra
// descendo rápido com corpo grave. Curto e com "soco", não um apito.
export function playCannonShot() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const master = c.createGain();
  master.gain.value = 0.32;
  master.connect(c.destination);

  const o = c.createOscillator(); // a "voz" do blaster
  o.type = "sawtooth";
  o.frequency.setValueAtTime(1500, t);
  o.frequency.exponentialRampToValueAtTime(210, t + 0.16);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(3200, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.16);
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.2);

  const th = c.createOscillator(); // soco grave do disparo
  th.type = "sine";
  th.frequency.setValueAtTime(160, t);
  th.frequency.exponentialRampToValueAtTime(55, t + 0.09);
  const gth = c.createGain();
  gth.gain.setValueAtTime(0.5, t);
  gth.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  th.connect(gth); gth.connect(master);
  th.start(t); th.stop(t + 0.12);

  const nz = c.createBufferSource(); // estalo de energia no bico
  nz.buffer = noiseBuf(c);
  nz.playbackRate.value = 1.6;
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = 2400;
  nf.Q.value = 1.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.35, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + 0.1);
}

// CANHÃO PESADO (boss) — turbolaser de nave capital: varredura mais grave e
// lenta, sub profundo e cauda de ruído — soa GRANDE mesmo à distância.
export function playHeavyCannon(vol = 1) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const master = c.createGain();
  master.gain.value = 0.5 * vol;
  master.connect(c.destination);

  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(1400, t);
  f.frequency.exponentialRampToValueAtTime(180, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.6);

  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(85, t);
  sub.frequency.exponentialRampToValueAtTime(30, t + 0.4);
  const gs = c.createGain();
  gs.gain.setValueAtTime(0.8, t);
  gs.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  sub.connect(gs); gs.connect(master);
  sub.start(t); sub.stop(t + 0.5);

  const nz = c.createBufferSource();
  nz.buffer = noiseBuf(c);
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = 900;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.3, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(t); nz.stop(t + 0.45);
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

// RUPTURA DO PORTAL DO BOSS — mais sinistra que a da navezinha: 5 pulsos
// dissonantes crescendo, um apito de tensão subindo por cima, e um BOM final
// bem mais profundo e longo, com o rasgo de ruído estendido.
export function playBossRupture() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.value = 0.85;
  master.connect(c.destination);

  for (let i = 0; i < 5; i++) { // pulsos graves acelerando
    const t = t0 + i * (0.62 - i * 0.05);
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(42 + i * 7, t);
    o.frequency.exponentialRampToValueAtTime(27, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4 + i * 0.13, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.6);

    const o2 = c.createOscillator(); // dissonância rasgada (trítono acima)
    o2.type = "sawtooth";
    o2.frequency.value = (42 + i * 7) * 1.414;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 300;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.16, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o2.connect(f); f.connect(g2); g2.connect(master);
    o2.start(t); o2.stop(t + 0.55);
  }

  const wh = c.createOscillator(); // apito de tensão subindo (o "algo vem aí")
  wh.type = "sine";
  wh.frequency.setValueAtTime(600, t0);
  wh.frequency.exponentialRampToValueAtTime(2400, t0 + 2.4);
  const gw = c.createGain();
  gw.gain.setValueAtTime(0.001, t0);
  gw.gain.exponentialRampToValueAtTime(0.09, t0 + 2);
  gw.gain.exponentialRampToValueAtTime(0.001, t0 + 2.6);
  wh.connect(gw); gw.connect(master);
  wh.start(t0); wh.stop(t0 + 2.7);

  const tb = t0 + 2.5; // o BOM — mais fundo e mais longo que o do portal comum
  const ob = c.createOscillator();
  ob.type = "sine";
  ob.frequency.setValueAtTime(80, tb);
  ob.frequency.exponentialRampToValueAtTime(22, tb + 2);
  const gb = c.createGain();
  gb.gain.setValueAtTime(0, tb);
  gb.gain.linearRampToValueAtTime(1, tb + 0.06);
  gb.gain.exponentialRampToValueAtTime(0.001, tb + 2.4);
  ob.connect(gb); gb.connect(master);
  ob.start(tb); ob.stop(tb + 2.5);

  const nz = c.createBufferSource(); // rasgo do espaço, estendido
  nz.buffer = noiseBuf(c);
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = 420;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.6, tb);
  ng.gain.exponentialRampToValueAtTime(0.001, tb + 1.6);
  nz.connect(nf); nf.connect(ng); ng.connect(master);
  nz.start(tb); nz.stop(tb + 1.7);
}
