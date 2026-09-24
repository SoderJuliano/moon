// Portal alienígena — o rasgo no espaço-tempo por onde a nave inimiga chega e foge.
//
// Efeito visual inspirado em ONDAS GRAVITACIONAIS (dinâmica de fluidos macro /
// rompimento de tensão superficial / black hole singularity, estilo Thomas Blanchard):
// - Núcleo negro (buraco negro central / horizonte de eventos com NormalBlending)
// - Anel de lente gravitacional (photon ring / shimmer quântico)
// - Trem de ondas gravitacionais concêntricas (múltiplas frentes de onda propagando
//   e desacelerando pelo vácuo cósmico com dispersão cromática e atenuação)
// - Fagulhas orbitais que sofrem perturbação ondulatória na passagem da crista
// - Pulso de contração pré-singularidade (implosão rápida) seguido de detonação elástica

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";

// Cache de texturas procedurais para não recriar canvas desnecessariamente
const _multiWaveCache = new Map();
const _singleWaveCache = new Map();

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#") return `rgba(255,255,255,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const num = parseInt(h, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Textura com MÚLTIPLAS CRISTAS CONCÊNTRICAS (ondas gravitacionais com refração)
function getGravitationalMultiWaveTexture(colors) {
  const key = `${colors.rim}_${colors.halo}_${colors.spark}`;
  if (_multiWaveCache.has(key)) return _multiWaveCache.get(key);

  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const half = size / 2;

  // Centro completamente transparente (buraco negro / vácuo interno)
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0.0, "rgba(0,0,0,0)");
  g.addColorStop(0.44, "rgba(0,0,0,0)");

  // Crista 3 (ondulação terciária interna mais suave)
  g.addColorStop(0.52, hexToRgba(colors.halo, 0.0));
  g.addColorStop(0.58, hexToRgba(colors.halo, 0.32));
  g.addColorStop(0.64, hexToRgba(colors.halo, 0.0));

  // Crista 2 (ondulação secundária)
  g.addColorStop(0.69, hexToRgba(colors.rim, 0.0));
  g.addColorStop(0.76, hexToRgba(colors.rim, 0.68));
  g.addColorStop(0.82, hexToRgba(colors.rim, 0.0));

  // Crista 1 (CRISTA PRINCIPAL DE CHOQUE GRAVITACIONAL — brilhante e hiper-definida)
  g.addColorStop(0.85, hexToRgba(colors.spark, 0.15));
  g.addColorStop(0.895, "rgba(255,255,255,0.96)"); // núcleo branco super luminoso
  g.addColorStop(0.92, hexToRgba(colors.rim, 0.88));
  g.addColorStop(0.97, hexToRgba(colors.halo, 0.22));
  g.addColorStop(1.0, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _multiWaveCache.set(key, tex);
  return tex;
}

// Textura de CRISTA ÚNICA NÍTIDA (frente de onda individual cortante)
function getSingleWaveTexture(color, highlight = "#ffffff") {
  const key = `${color}_${highlight}`;
  if (_singleWaveCache.has(key)) return _singleWaveCache.get(key);

  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const half = size / 2;

  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0.0, "rgba(0,0,0,0)");
  g.addColorStop(0.72, "rgba(0,0,0,0)");
  g.addColorStop(0.82, hexToRgba(color, 0.35));
  g.addColorStop(0.88, hexToRgba(highlight, 0.95)); // pico afiado
  g.addColorStop(0.93, hexToRgba(color, 0.72));
  g.addColorStop(0.98, hexToRgba(color, 0.12));
  g.addColorStop(1.0, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _singleWaveCache.set(key, tex);
  return tex;
}

export class Portal {
  constructor(scene, { colors = null, sparks = 8, shockwave = true } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const pal = colors || {
      core: "#04060c",
      veil: "#16205e",
      halo: "#3a2b8f",
      rim: "#5a7dff",
      spark: "#9ec5ff",
    };
    this.pal = pal;

    const mkSprite = (tex, scale, opacity, blending) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity,
          blending,
          depthWrite: false,
        })
      );
      s.scale.setScalar(scale);
      this.group.add(s);
      return s;
    };

    // 1. Núcleo negro (horizonte de eventos que realmente esconde estrelas/fundo)
    this.core = mkSprite(radialGlowTexture(pal.core), 1.0, 0.98, THREE.NormalBlending);

    // 2. Anel de lente gravitacional (borda de fótons no horizonte de eventos)
    const singleTex = getSingleWaveTexture(pal.rim, pal.spark);
    this.lensingRing = mkSprite(singleTex, 1.06, 0.75, THREE.AdditiveBlending);

    // 3. Véus e halos de distorção de vácuo
    this.veil = mkSprite(radialGlowTexture(pal.veil), 1.55, 0.75, THREE.AdditiveBlending);
    this.halo = mkSprite(radialGlowTexture(pal.halo), 1.95, 0.52, THREE.AdditiveBlending);
    this.rim = mkSprite(radialGlowTexture(pal.rim), 2.2, 0.42, THREE.AdditiveBlending);

    // 4. Fagulhas orbitais do vórtice gravitacional
    this.sparks = [];
    for (let i = 0; i < sparks; i++) {
      const s = mkSprite(radialGlowTexture(pal.spark), 0.16 + Math.random() * 0.14, 0.88, THREE.AdditiveBlending);
      this.sparks.push({
        s,
        a: (i / sparks) * Math.PI * 2,
        r: 0.96 + Math.random() * 0.16,
        baseR: 0.96 + Math.random() * 0.16,
        w: 2.3 + Math.random() * 1.5,
      });
    }

    // 5. SISTEMA DE ONDAS GRAVITACIONAIS (Ondulações concêntricas expansivas)
    this.shockwaveEnabled = shockwave;
    this.wavePool = [];
    const multiTex = getGravitationalMultiWaveTexture(pal);

    // Pool de ondas gravitacionais: alterna entre crista única e múltiplas cristas
    const POOL_SIZE = 7;
    for (let i = 0; i < POOL_SIZE; i++) {
      const isMulti = i % 2 === 0;
      const waveSprite = mkSprite(isMulti ? multiTex : singleTex, 0.1, 0, THREE.AdditiveBlending);
      waveSprite.visible = false;
      this.wavePool.push({
        sprite: waveSprite,
        active: false,
        t: 0,
        delay: 0,
        duration: 1.8,
        maxScale: 9.0,
        peakOpacity: 0.85,
        rotSpeed: (Math.random() - 0.5) * 0.4,
      });
    }

    // Compatibilidade com código legado que checava portal.wave / _waveT
    this.wave = this.wavePool[0].sprite;
    this._waveT = -1;

    this._t = 0; // 0..1 abertura suave
    this._target = 0;
    this._size = 1;
    this._openTimer = 0;
    this._ambientTimer = 0;
  }

  // Dispara uma cascata de ondas gravitacionais (como gotas caindo na tinta / ruptura)
  emitWaveBurst(count = 5, { maxScale = 9.5, intensity = 1.0, duration = 1.85 } = {}) {
    if (!this.shockwaveEnabled) return;
    let spawned = 0;
    for (let i = 0; i < this.wavePool.length && spawned < count; i++) {
      const w = this.wavePool[i];
      if (!w.active) {
        w.active = true;
        w.t = 0;
        w.delay = spawned * 0.13; // ondas concêntricas defasadas
        w.duration = duration + spawned * 0.12;
        w.maxScale = (maxScale - spawned * 0.65) * Math.max(0.8, intensity);
        w.peakOpacity = Math.min(1.0, (0.88 - spawned * 0.08) * intensity);
        w.sprite.visible = true;
        w.sprite.material.opacity = 0;
        w.sprite.scale.setScalar(0.1);
        w.sprite.material.rotation = Math.random() * Math.PI * 2;
        spawned++;
      }
    }
    this._waveT = 0;
  }

  // Pulso secundário (ex: quando a nave atravessa o horizonte de eventos ou fecha)
  pulse(intensity = 0.85) {
    this.emitWaveBurst(3, { maxScale: 7.0, intensity, duration: 1.5 });
  }

  openAt(pos, size = 1.6) {
    this.group.position.copy(pos);
    this._size = size;
    this._target = 1;
    this._openTimer = 0;
    this._ambientTimer = 0;
    this.group.visible = true;

    // Dispara cascata inicial de ondas gravitacionais concêntricas
    this.emitWaveBurst(5, {
      maxScale: 9.8 * (size > 2.5 ? 1.35 : 1.0),
      intensity: size > 2.5 ? 1.15 : 0.95,
      duration: size > 2.5 ? 2.4 : 1.85,
    });
  }

  close() {
    this._target = 0;
    // Pulso suave de colapso gravitacional
    this.pulse(0.6);
  }

  get openness() {
    return this._t;
  }

  _resetWaves() {
    for (const w of this.wavePool) {
      w.active = false;
      w.sprite.visible = false;
      w.sprite.material.opacity = 0;
    }
    this._waveT = -1;
  }

  update(dt) {
    if (!this.group.visible) return;

    this._t += (this._target - this._t) * Math.min(1, dt * 3.5);
    if (this._target === 0 && this._t < 0.02) {
      this.group.visible = false;
      this._t = 0;
      this._resetWaves();
      return;
    }

    this._openTimer += dt;

    // Dinâmica elástica de abertura: leve contração gravitacional antes do estouro
    let openFactor = this._t;
    if (this._target === 1 && this._openTimer < 0.45) {
      const p = this._openTimer / 0.45;
      // Curva com overshoot (snap elástico de ruptura de superfície)
      const dipAndBurst = Math.sin(p * Math.PI * 0.7);
      openFactor = Math.max(0.02, this._t * dipAndBurst * 1.12);
    }
    this.group.scale.setScalar(this._size * (0.04 + 0.96 * openFactor));

    const now = performance.now() * 0.001;
    const pulse = 1 + Math.sin(now * 5) * 0.07;
    this.veil.scale.setScalar(1.55 * pulse);
    this.rim.material.opacity = (0.34 + Math.sin(now * 7) * 0.14) * this._t;

    // Anel de lente gravitacional piscando em alta frequência quântica
    if (this.lensingRing) {
      const lensPulse = 1.05 + Math.sin(now * 9) * 0.04;
      this.lensingRing.scale.setScalar(lensPulse);
      this.lensingRing.material.opacity = (0.7 + Math.sin(now * 15) * 0.22) * this._t;
    }

    // Movimento orbital das fagulhas com perturbação ondulatória gravitacional
    for (const p of this.sparks) {
      p.a += p.w * dt;
      // As partículas oscilam radialmente como se estivessem surfando a onda
      const waveDrift = Math.sin(p.a * 3 + now * 8) * 0.08;
      p.r = p.baseR + waveDrift;
      p.s.position.set(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r, 0.02);
    }

    // Ondulações gravitacionais ambientes contínuas enquanto o portal estiver aberto
    if (this._target === 1 && this._t > 0.85) {
      this._ambientTimer += dt;
      if (this._ambientTimer >= 1.6) {
        this._ambientTimer = 0;
        this.emitWaveBurst(1, { maxScale: 6.2, intensity: 0.45, duration: 1.7 });
      }
    }

    // ATUALIZAÇÃO DO TREM DE ONDAS GRAVITACIONAIS (Ondas concêntricas que expandem e dissipam)
    let anyActive = false;
    for (const w of this.wavePool) {
      if (!w.active) continue;

      if (w.delay > 0) {
        w.delay -= dt;
        continue;
      }

      w.t += dt / w.duration;
      if (w.t >= 1) {
        w.active = false;
        w.sprite.visible = false;
        w.sprite.material.opacity = 0;
      } else {
        anyActive = true;
        // Expansão rápida inicial desacelerando suavemente (física de onda de choque cúbica)
        const progress = w.t;
        const easeOut = 1 - Math.pow(1 - progress, 2.4);
        const currentScale = this._size * (0.35 + easeOut * w.maxScale);
        w.sprite.scale.setScalar(currentScale);

        // Curva de opacidade: sobe nos primeiros 12% da propagação e decai suavemente
        let alpha = 0;
        if (progress < 0.12) {
          alpha = (progress / 0.12) * w.peakOpacity;
        } else {
          const fadeProgress = (progress - 0.12) / 0.88;
          alpha = w.peakOpacity * Math.pow(1 - fadeProgress, 1.8);
        }
        w.sprite.material.opacity = Math.max(0, alpha);
        w.sprite.material.rotation += w.rotSpeed * dt;
      }
    }

    if (!anyActive && this._waveT >= 0) {
      this._waveT = -1;
    }
  }
}
