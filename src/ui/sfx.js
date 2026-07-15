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

// RUPTURA DE PORTAL — o "glow… glow… glow… BOM" grave da chegada alien.
// Três pulsos sub-graves crescentes (seno descendo + serra rasgada filtrada)
// e o estouro final: sub mergulhando de 90→28Hz com um burst de ruído grave.
// Casa com a animação do portal (~1.6s abrindo + presença).
export function playPortalRupture() {
  const c = ctx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 0.75;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.02;

  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.55;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(46 + i * 9, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 + i * 0.15, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.6);

    const o2 = c.createOscillator(); // camada "rasgada"
    o2.type = "sawtooth";
    o2.frequency.value = 58 + i * 14;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.14, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o2.connect(f);
    f.connect(g2);
    g2.connect(master);
    o2.start(t);
    o2.stop(t + 0.55);
  }

  const tb = t0 + 1.7; // BOM
  const ob = c.createOscillator();
  ob.type = "sine";
  ob.frequency.setValueAtTime(90, tb);
  ob.frequency.exponentialRampToValueAtTime(28, tb + 1.2);
  const gb = c.createGain();
  gb.gain.setValueAtTime(0, tb);
  gb.gain.linearRampToValueAtTime(0.9, tb + 0.05);
  gb.gain.exponentialRampToValueAtTime(0.001, tb + 1.5);
  ob.connect(gb);
  gb.connect(master);
  ob.start(tb);
  ob.stop(tb + 1.6);

  const len = Math.floor(c.sampleRate * 0.8); // burst de ruído do rasgo
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.05 * w) / 1.05;
    d[i] = last * 4;
  }
  const nz = c.createBufferSource();
  nz.buffer = buf;
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = 500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.55, tb);
  ng.gain.exponentialRampToValueAtTime(0.001, tb + 0.8);
  nz.connect(nf);
  nf.connect(ng);
  ng.connect(master);
  nz.start(tb);
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
