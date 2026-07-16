// MÚSICA DE BOSS — o tema dos Gêmeos, estilo Dark Souls: quando ela sobe, o
// jogador SABE que é um chefe. Sintetizada via Web Audio (filosofia do jogo),
// mais lenta e mais pesada que a batida de combate comum.
//
// Construção (76 BPM, agendamento por lookahead):
//   • TAIKOS — tambores de guerra profundos nos tempos 1 e 3, com um toque
//     sincopado no fim do compasso (o coração do gigante).
//   • CORO ESCURO — 3 serras destunadas (fundamental, quinta, terça menor)
//     por um passa-baixas que respira devagar — o "coral" do chefe.
//   • SINO fúnebre a cada 2 compassos — o dobre.
//   • OSTINATO agudo de tensão em colcheias (fundamental↔quinta) — a pressa
//     por baixo da solenidade.
//   • SUB contínuo na fundamental — o peso.
//
// Progressão: Dm → Bb → Gm → A (lamento em ré menor — solene e ameaçador).

const VOL = 0.3; // acima da batida comum (0.26); efeitos de UI seguem no topo
const BPM = 76;
const EIGHTH = 60 / BPM / 2;
const LOOKAHEAD = 0.4;

// fundamentais (Hz): D2 → Bb1 → G1 → A1
const ROOTS = [73.42, 58.27, 49.0, 55.0];
// terça de cada acorde (menor, maior, menor, maior) como razão da fundamental
const THIRDS = [1.189, 1.26, 1.189, 1.26];

export class BossMusic {
  constructor(getCtx) {
    this.getCtx = getCtx;
    this.active = false;
    this.started = false;
    this._next = 0;
    this._count = 0;
  }

  _start(ctx) {
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 2600;
    this.tone.connect(this.master);
    this.master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // coro escuro contínuo: 3 vozes retonalizadas por compasso
    this.choirF = ctx.createBiquadFilter();
    this.choirF.type = "lowpass";
    this.choirF.frequency.value = 520;
    this.choirG = ctx.createGain();
    this.choirG.gain.value = 0.07;
    this.choirF.connect(this.choirG);
    this.choirG.connect(this.tone);
    this.choir = [0, 1, 2].map((i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = (i - 1) * 7; // leve destune: a "massa" do coral
      o.frequency.value = ROOTS[0] * 2;
      o.connect(this.choirF);
      o.start();
      return o;
    });

    // sub contínuo na fundamental — o peso do gigante
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = ROOTS[0];
    this.subG = ctx.createGain();
    this.subG.gain.value = 0.16;
    this.sub.connect(this.subG);
    this.subG.connect(this.tone);
    this.sub.start();
  }

  setActive(on) {
    this.active = on;
    const ctx = this.getCtx();
    if (!ctx) return;
    if (!this.started) this._start(ctx);
    if (on) {
      this._next = ctx.currentTime + 0.05;
      this._count = 0;
    }
    // o tema do chefe ENTRA devagar e imponente; sai suave
    this.master.gain.setTargetAtTime(on ? VOL : 0, ctx.currentTime, on ? 0.8 : 0.9);
  }

  update() {
    const ctx = this.getCtx();
    if (!ctx || !this.started || !this.active) return;
    while (this._next < ctx.currentTime + LOOKAHEAD) {
      this._scheduleEighth(ctx, this._next, this._count);
      this._next += EIGHTH;
      this._count += 1;
    }
  }

  _taiko(ctx, t, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g);
    g.connect(this.tone);
    o.start(t);
    o.stop(t + 0.36);
    // o "couro" do tambor: sopro grave junto do impacto
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 340;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(f);
    f.connect(ng);
    ng.connect(this.tone);
    s.start(t);
    s.stop(t + 0.14);
  }

  _scheduleEighth(ctx, t, count) {
    const e = count % 8;
    const bar = Math.floor(count / 8) % ROOTS.length;
    const root = ROOTS[bar];

    // taikos: 1, 3 e o toque sincopado na última colcheia
    if (e === 0) this._taiko(ctx, t, 1.0);
    if (e === 4) this._taiko(ctx, t, 0.8);
    if (e === 7) this._taiko(ctx, t, 0.45);

    // ostinato de tensão: colcheias alternando fundamental↔quinta, agudo e seco
    {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = root * (e % 2 === 0 ? 4 : 6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + EIGHTH * 0.9);
      o.connect(g);
      g.connect(this.tone);
      o.start(t);
      o.stop(t + EIGHTH);
    }

    if (e === 0) {
      // retonaliza coro (fundamental, quinta, terça) + sub
      const third = THIRDS[bar];
      this.choir[0].frequency.setTargetAtTime(root * 2, t, 0.3);
      this.choir[1].frequency.setTargetAtTime(root * 3, t, 0.3);
      this.choir[2].frequency.setTargetAtTime(root * 2 * third, t, 0.3);
      this.sub.frequency.setTargetAtTime(root, t, 0.25);
      // a respiração do filtro do coro (2 compassos pra cima, 2 pra baixo)
      const breathe = Math.floor(count / 16) % 2 === 0 ? 760 : 420;
      this.choirF.frequency.setTargetAtTime(breathe, t, 1.2);

      // sino fúnebre a cada 2 compassos
      if (Math.floor(count / 8) % 2 === 0) {
        for (const [mult, vol] of [[1, 0.16], [2.76, 0.05]]) {
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = root * 8 * mult;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(vol, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
          o.connect(g);
          g.connect(this.tone);
          o.start(t);
          o.stop(t + 2.5);
        }
      }
    }
  }
}
