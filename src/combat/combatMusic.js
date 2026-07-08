// MÚSICA DE COMBATE — sintetizada via Web Audio, no espírito lofi do jogo mas
// FRENÉTICA e séria: é ela que orienta o jogador de que ENTROU em combate
// (sobe junto com o portal) e de que SAIU (esmaece e o ambiente volta).
//
// Construção (112 BPM, tudo agendado por lookahead no update):
//   • KICK surdo nos tempos 1 e 3 (seno mergulhando 110→40Hz) — o coração.
//   • BAIXO ostinato em colcheias na fundamental do acorde, com saltos de
//     oitava — a pressa.
//   • HATS de ruído curtinho nos contratempos — o nervosismo.
//   • STABS graves (fundamental+quinta) na cabeça do compasso, seguindo a
//     progressão andaluza Am → G → F → E — a seriedade/perigo.
//   • PAD escuro contínuo acompanhando o acorde por baixo de tudo.
//
// Prioridade sonora do PvE: este master toca ACIMA da trilha ambiente (que o
// gameMode silencia via duck) e das vibrações de planetas (abafadas pelo
// SpaceAudio.setDucked). Compartilha o AudioContext do jogo — o Esc pausa
// tudo junto, de graça.

const VOL = 0.26; // acima da trilha ambiente (0.16); efeitos de UI seguem no topo
const BPM = 112;
const EIGHTH = 60 / BPM / 2; // s por colcheia
const LOOKAHEAD = 0.35; // s de agendamento à frente

// progressão andaluza (fundamentais, Hz): Am → G → F → E, um acorde por compasso
const ROOTS = [55.0, 49.0, 43.65, 41.2];
// ostinato do baixo em múltiplos da fundamental (8 colcheias por compasso)
const BASS_PATTERN = [1, 1, 2, 1, 1, 2, 1, 1.5];

export class CombatMusic {
  constructor(getCtx) {
    this.getCtx = getCtx;
    this.active = false;
    this.started = false;
    this._next = 0; // ctx.currentTime da próxima colcheia
    this._count = 0; // colcheias desde o início
  }

  _start(ctx) {
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // "lofi": tudo passa por um passa-baixas quente antes do destino
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 2400;
    this.tone.connect(this.master);
    this.master.connect(ctx.destination);

    // ruído compartilhado dos hats
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // pad escuro contínuo (retonalizado a cada compasso)
    this.pad = ctx.createOscillator();
    this.pad.type = "sawtooth";
    this.pad.frequency.value = ROOTS[0] * 2;
    const padF = ctx.createBiquadFilter();
    padF.type = "lowpass";
    padF.frequency.value = 420;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.09;
    this.pad.connect(padF);
    padF.connect(this.padGain);
    this.padGain.connect(this.tone);
    this.pad.start();
  }

  setActive(on) {
    this.active = on;
    const ctx = this.getCtx();
    if (!ctx) return;
    if (!this.started) this._start(ctx);
    if (on) {
      // entra AGORA, alinhado: primeira batida imediata
      this._next = ctx.currentTime + 0.05;
      this._count = 0;
    }
    // sobe rápido (orienta a entrada), desce mais suave na saída
    this.master.gain.setTargetAtTime(on ? VOL : 0, ctx.currentTime, on ? 0.25 : 0.7);
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

  _scheduleEighth(ctx, t, count) {
    const e = count % 8; // colcheia dentro do compasso
    const bar = Math.floor(count / 8) % ROOTS.length;
    const root = ROOTS[bar];

    // kick nos tempos 1 e 3 (colcheias 0 e 4)
    if (e === 0 || e === 4) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(this.tone);
      o.start(t);
      o.stop(t + 0.2);
    }

    // hats nos contratempos (colcheias ímpares)
    if (e % 2 === 1) {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(hp);
      hp.connect(g);
      g.connect(this.tone);
      s.start(t);
      s.stop(t + 0.06);
    }

    // baixo ostinato: toda colcheia, curtinho e abafado
    {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = root * BASS_PATTERN[e];
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + EIGHTH * 0.95);
      o.connect(f);
      f.connect(g);
      g.connect(this.tone);
      o.start(t);
      o.stop(t + EIGHTH);
    }

    // stab (fundamental+quinta) na cabeça do compasso + retonaliza o pad
    if (e === 0) {
      for (const mult of [2, 3]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = root * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.15, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(g);
        g.connect(this.tone);
        o.start(t);
        o.stop(t + 0.65);
      }
      this.pad.frequency.setTargetAtTime(root * 2, t, 0.15);
    }
  }
}
