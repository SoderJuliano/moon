// Som ambiente por proximidade (modo real). Cada corpo tem um "drone" grave
// SINTETIZADO na hora via Web Audio (ruído filtrado + sub-grave) — nada de mp3
// para baixar, fiel à ideia do projeto de rodar leve em qualquer aparelho.
// O volume sobe de 0 a 100% conforme a câmera se aproxima do corpo, como nos
// vídeos de "sons" de Júpiter/Saturno da NASA.
//
// Exceção: uma faixa pode usar um SAMPLE em loop (opts.sampleUrl) em vez do
// drone sintetizado — usado pro Sol, que toca a sonificação REAL da NASA
// (oscilações do SOHO tornadas audíveis pela Stanford). E opts.relativeToRadius
// interpreta near/far como MÚLTIPLOS do raio atual do corpo — necessário pro
// Sol, cujo raio infla ~40× na aproximação da nave (distâncias fixas não
// serviriam pra nave e pra câmera focada ao mesmo tempo).
//
// Autoplay: navegadores só deixam tocar áudio após um gesto do usuário. O
// AudioContext é criado/retomado em setEnabled(true), que é disparado pelo
// clique no toggle "Real" da HUD — gesto válido.

import * as THREE from "three";

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// buffer de ruído rosa/marrom (grave) reutilizado por todas as faixas
function makeNoiseBuffer(ctx, seconds = 4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // integra -> empurra energia pros graves
    data[i] = last * 3.2;
  }
  return buf;
}

export class SpaceAudio {
  constructor() {
    this.tracks = [];
    this.enabled = false;
    this.proximityLevel = 0; // 0..1: maior volume atual entre as vibrações
    this.ctx = null;
    this.noise = null;
    this.master = null;
    this._tmp = new THREE.Vector3();
  }

  // near = distância onde o volume chega a 100%; far = onde ainda é silêncio.
  // opts: { type, freq, q, sub, subGain } descreve o timbre sintetizado.
  add(bodyId, opts, near, far) {
    this.tracks.push({ bodyId, opts, near, far, nodes: null });
  }

  _ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.noise = makeNoiseBuffer(this.ctx);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return true;
  }

  _buildTrack(t) {
    const ctx = this.ctx;
    const o = t.opts || {};

    // faixa com sample em loop (ex.: sonificação real do Sol): o gain de
    // proximidade nasce mudo e o áudio entra quando o download/decodificação
    // termina — sem bloquear nada se a rede falhar (fica silencioso)
    if (o.sampleUrl) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      t.nodes = { src: null, filter: null, gain, osc: null };
      fetch(o.sampleUrl)
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(gain);
          src.start();
          t.nodes.src = src;
        })
        .catch(() => {});
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = o.type || "lowpass";
    filter.frequency.value = o.freq || 200;
    filter.Q.value = o.q ?? 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();

    let osc = null;
    if (o.sub) {
      osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = o.sub;
      const subGain = ctx.createGain();
      subGain.gain.value = o.subGain ?? 0.4;
      osc.connect(subGain);
      subGain.connect(gain); // entra no mesmo gain de proximidade
      osc.start();
    }

    t.nodes = { src, filter, gain, osc };
  }

  // abafa TODAS as vibrações de corpos (combate PvE: o som do encontro manda)
  setDucked(on) {
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(on ? 0.12 : 0.9, this.ctx.currentTime, 0.5);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      if (!this._ensureContext()) return;
      for (const t of this.tracks) if (!t.nodes) this._buildTrack(t);
    } else if (this.ctx) {
      // silencia tudo sem destruir os nós (reusados ao reabilitar)
      for (const t of this.tracks) {
        if (t.nodes) t.nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
    }
  }

  update(camera, bodyById) {
    if (!this.enabled || !this.ctx) {
      this.proximityLevel = 0;
      return;
    }
    const now = this.ctx.currentTime;
    let maxVol = 0;
    for (const t of this.tracks) {
      if (!t.nodes) continue;
      const body = bodyById.get(t.bodyId);
      if (!body) continue;
      body.worldPosition(this._tmp);
      const d = camera.position.distanceTo(this._tmp);
      // near/far absolutos, ou em múltiplos do raio ATUAL (acompanha a inflação)
      const r = t.opts && t.opts.relativeToRadius ? body.radius || 1 : 1;
      const vol = 1 - smoothstep(t.near * r, t.far * r, d); // 1 perto, 0 longe
      // rampa suave para evitar cliques
      t.nodes.gain.gain.setTargetAtTime(THREE.MathUtils.clamp(vol, 0, 1), now, 0.15);
      maxVol = Math.max(maxVol, vol);
    }
    // maior presença entre as vibrações — consumido pelo ducking da trilha
    this.proximityLevel = maxVol;
  }
}
