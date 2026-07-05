// Trilha sonora "deep space lofi" SINTETIZADA via Web Audio (mesma filosofia
// do SpaceAudio/sfx: nada de mp3 pra baixar, roda leve em qualquer aparelho).
// Toca SÓ no Game Mode, ao entrar na cena.
//
// A construção, camada por camada:
//  • PADS: 4 osciladores triangle (detune sutil) tocando uma progressão lenta
//    de acordes menores/maj7 (Am7 → Fmaj7 → Cmaj7 → Gadd9), com crossfade de
//    ~5s a cada 16s — o "colchão" harmônico do lofi.
//  • SUB: seno uma oitava abaixo da fundamental do acorde — o peso do espaço.
//  • CRACKLE: estalinhos esparsos de vinil (buffer em loop, passa-altas) — o
//    "lo-fi" da coisa.
//  • PLUCK: de vez em quando, um sininho pentatônico curto e baixinho.
//
// DUCKING: o volume-alvo cai a ZERO quando alguma vibração de corpo
// (Júpiter/Saturno/Sol do SpaceAudio) sobe — a trilha dá lugar ao fenômeno e
// volta sozinha ao se afastar. O nível vem de fora (audio.proximityLevel).
//
// Volume: BASE bem abaixo dos efeitos de interface (playDiscovery usa ~0.5) —
// trilha é fundo, conquista é destaque.

const BASE = 0.16; // volume máximo da trilha (efeitos de UI ficam acima)
const CHORD_EVERY = 16; // s entre trocas de acorde
const XFADE = 5; // s de crossfade entre acordes
const FILTER_HZ = 750; // passa-baixas global dos pads (timbre abafado, lofi)

// progressão (Hz): registro grave, vozes abertas
const CHORDS = [
  [110.0, 164.81, 196.0, 261.63], // Am7  (A2 E3 G3 C4)
  [87.31, 130.81, 174.61, 220.0], // Fmaj7 (F2 C3 F3 A3)
  [130.81, 196.0, 246.94, 329.63], // Cmaj7 (C3 G3 B3 E4)
  [98.0, 146.83, 220.0, 246.94], // Gadd9 (G2 D3 A3 B3)
];
// notas de pluck por acorde (pentatônica, 2 oitavas acima da região do pad)
const PLUCKS = [
  [440, 523.25, 659.25], // sobre Am
  [440, 523.25, 698.46], // sobre F
  [523.25, 659.25, 783.99], // sobre C
  [493.88, 587.33, 783.99], // sobre G
];

export class DeepSpaceMusic {
  // getCtx: () => AudioContext|null — compartilha o contexto do SpaceAudio
  constructor(getCtx) {
    this.getCtx = getCtx;
    this.started = false;
    this._chord = 0;
    this._pad = null; // { gain, oscs } do acorde atual (pro fade-out)
    this._nextChord = 0;
    this._nextPluck = 0;
  }

  _start(ctx) {
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // sobe suave via ducking-target no update
    this.master.connect(ctx.destination);

    // passa-baixas dos pads com uma respiração lenta no corte (LFO ~0.05Hz)
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = FILTER_HZ;
    this.filter.Q.value = 0.4;
    this.filter.connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160; // corte respira ±160Hz
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    lfo.start();

    // sub contínuo: acompanha a fundamental do acorde, uma oitava abaixo
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = CHORDS[0][0] / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.3;
    this.sub.connect(subGain);
    subGain.connect(this.master);
    this.sub.start();

    // crackle de vinil: buffer esparso em loop por um passa-altas
    const len = Math.floor(ctx.sampleRate * 2.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < 110; i++) {
      const at = Math.floor(Math.random() * (len - 4));
      const amp = (Math.random() < 0.06 ? 0.5 : 0.14) * (Math.random() * 2 - 1);
      data[at] = amp;
      data[at + 1] = amp * 0.4;
    }
    const crackle = ctx.createBufferSource();
    crackle.buffer = buf;
    crackle.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.35;
    crackle.connect(hp);
    hp.connect(crackleGain);
    crackleGain.connect(this.master);
    crackle.start();

    const now = ctx.currentTime;
    this._nextChord = now; // primeiro acorde entra já
    this._nextPluck = now + 7;
  }

  // crossfade: pad novo entra em XFADE s enquanto o anterior sai e é desligado
  _playChord(ctx) {
    const now = ctx.currentTime;
    const freqs = CHORDS[this._chord % CHORDS.length];

    if (this._pad) {
      const old = this._pad;
      old.gain.gain.setTargetAtTime(0, now, XFADE / 4);
      for (const o of old.oscs) o.stop(now + XFADE + 2);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + XFADE);
    gain.connect(this.filter);
    const oscs = [];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.003); // detune sutil
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.34 : 0.22; // fundamental um pouco à frente
      osc.connect(g);
      g.connect(gain);
      osc.start(now);
      oscs.push(osc);
    });
    this._pad = { gain, oscs };

    this.sub.frequency.setTargetAtTime(freqs[0] / 2, now, XFADE / 3);
    this._chord += 1;
    this._nextChord = now + CHORD_EVERY;
  }

  // sininho pentatônico curto, baixinho — a "melodia" preguiçosa do lofi
  _pluck(ctx) {
    const now = ctx.currentTime;
    const notes = PLUCKS[(this._chord - 1 + PLUCKS.length) % PLUCKS.length];
    const f = notes[Math.floor(Math.random() * notes.length)];
    for (const [mult, vol] of [[1, 0.12], [2, 0.03]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 2.6);
    }
    this._nextPluck = now + 8 + Math.random() * 9;
  }

  // duck ∈ [0,1]: nível das vibrações de corpos (SpaceAudio.proximityLevel).
  // Qualquer presença relevante silencia a trilha; ela volta ao se afastar.
  update(duck) {
    const ctx = this.getCtx();
    if (!ctx) return;
    if (!this.started) this._start(ctx);
    const now = ctx.currentTime;
    if (now >= this._nextChord) this._playChord(ctx);
    if (now >= this._nextPluck) this._pluck(ctx);
    const target = BASE * (1 - Math.min(duck * 1.6, 1));
    this.master.gain.setTargetAtTime(target, now, 0.7); // fade suave (~2s)
  }
}
