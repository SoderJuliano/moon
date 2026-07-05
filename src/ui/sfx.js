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
