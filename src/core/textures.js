// Geradores de textura procedural via canvas 2D.
//
// Tudo desenhado em tempo de execução em canvas pequenos (512x256). Resulta em
// ~0.5MB de VRAM por corpo — seguro até em tablet de 4GB e sem nenhum download.
// Cada planeta (em src/bodies/*.js) chama um destes helpers com sua paleta.

import * as THREE from "three";

const W = 512;
const H = 256;

function newCanvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

function finish(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// PRNG determinístico para texturas reproduzíveis.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Planeta rochoso: base + manchas + crateras -----------------------------
export function rockyTexture({ base, dark, light, seed = 1, craters = 40 }) {
  const c = newCanvas();
  const ctx = c.getContext("2d");
  const rng = mulberry32(seed);

  // gradiente polo->equador->polo
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, dark);
  g.addColorStop(0.5, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // manchas de continente/terreno
  for (let i = 0; i < 120; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 4 + rng() * 26;
    ctx.globalAlpha = 0.06 + rng() * 0.12;
    ctx.fillStyle = rng() > 0.5 ? light : dark;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rng()), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // crateras
  for (let i = 0; i < craters; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 1.5 + rng() * 5;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

// --- helpers de cor e ruído fractal (para gigantes gasosos realistas) -------
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Ruído de valor com lattice PERIÓDICO no eixo X (período = wrap), para a
// textura fechar sem costura ao envolver a esfera.
function makeNoise(seed) {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const lattice = (ix, iy, wrap) => {
    ix = ((ix % wrap) + wrap) % wrap;
    return p[(ix + p[iy & 255]) & 255] / 255;
  };
  // x,y em "células"; wrap = nº de células ao redor da circunferência
  return (x, y, wrap) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);
    const v00 = lattice(x0, y0, wrap);
    const v10 = lattice(x0 + 1, y0, wrap);
    const v01 = lattice(x0, y0 + 1, wrap);
    const v11 = lattice(x0 + 1, y0 + 1, wrap);
    return (v00 + (v10 - v00) * fx) * (1 - fy) + (v01 + (v11 - v01) * fx) * fy;
  };
}
function fbm(noise, x, y, wrap, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise(x * f, y * f, wrap * f);
    f *= 2;
    amp *= 0.5;
  }
  return v;
}

// --- Gigante gasoso: bandas onduladas com turbulência (FBM) -----------------
// `bands` é tratado como uma paleta repetida ao longo da latitude; o ruído
// fractal ondula as faixas e adiciona redemoinhos, dando um ar bem mais real.
export function gasGiantTexture({ bands, seed = 1, spot = null }) {
  const GW = 1024;
  const GH = 512;
  const BANDS = 13; // nº de faixas claras/escuras
  const WRAP = 6; // células do ruído ao redor (periódico)
  const c = document.createElement("canvas");
  c.width = GW;
  c.height = GH;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(GW, GH);
  const data = img.data;

  const pal = bands.map(hexToRgb);
  const warpN = makeNoise(seed);
  const turbN = makeNoise(seed + 777);
  const spotRgb = spot ? hexToRgb(spot.color) : null;

  let ptr = 0;
  for (let y = 0; y < GH; y++) {
    const lat = y / GH;
    for (let x = 0; x < GW; x++) {
      const u = (x / GW) * WRAP;
      // ondula a latitude com ruído -> faixas tortas, não retas
      const warp = (fbm(warpN, u, lat * 3, WRAP) - 0.5) * 0.12;
      const fb = (lat + warp) * BANDS;
      const bi = Math.floor(fb);
      const frac = smoothstep(fb - bi);
      const c0 = pal[((bi % pal.length) + pal.length) % pal.length];
      const c1 = pal[(((bi + 1) % pal.length) + pal.length) % pal.length];

      // turbulência -> variação de brilho dentro das faixas (redemoinhos)
      const turb = fbm(turbN, u * 2, lat * 10, WRAP * 2, 4);
      const shade = 0.78 + turb * 0.44;
      // escurecimento polar
      const polar = 1 - 0.28 * Math.pow(Math.abs(lat - 0.5) * 2, 3);

      let r = (c0[0] + (c1[0] - c0[0]) * frac) * shade * polar;
      let g = (c0[1] + (c1[1] - c0[1]) * frac) * shade * polar;
      let b = (c0[2] + (c1[2] - c0[2]) * frac) * shade * polar;

      // Grande Mancha (Júpiter): elipse com redemoinho
      if (spotRgb) {
        let dx = x / GW - spot.x;
        dx -= Math.round(dx); // distância periódica em X
        const dy = lat - spot.y;
        const ex = dx / (spot.r * 0.085);
        const ey = dy / (spot.r * 0.05);
        const d = ex * ex + ey * ey;
        if (d < 1) {
          const swirl = 0.5 + 0.5 * Math.sin(Math.atan2(ey, ex) * 3 + (1 - d) * 7);
          const k = (1 - d) * (0.55 + 0.45 * swirl);
          r += (spotRgb[0] - r) * k;
          g += (spotRgb[1] - g) * k;
          b += (spotRgb[2] - b) * k;
        }
      }

      data[ptr++] = r;
      data[ptr++] = g;
      data[ptr++] = b;
      data[ptr++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// --- Mundo gelado: claro com fraturas -------------------------------------
export function icyTexture({ base, dark, light, seed = 1 }) {
  const c = newCanvas();
  const ctx = c.getContext("2d");
  const rng = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) {
    ctx.globalAlpha = 0.05 + rng() * 0.1;
    ctx.fillStyle = rng() > 0.5 ? light : dark;
    const x = rng() * W;
    const y = rng() * H;
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + rng() * 30, 4 + rng() * 14, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // fraturas/linhas (estilo Europa/Plutão)
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = dark;
  for (let i = 0; i < 25; i++) {
    ctx.lineWidth = 0.5 + rng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(rng() * W, rng() * H);
    for (let s = 0; s < 4; s++) ctx.lineTo(rng() * W, rng() * H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

// --- Estrela (Sol): granulação radiante ------------------------------------
export function starTexture({ core = "#fff6d0", mid = "#ffcc55", edge = "#ff8a2b", seed = 7 }) {
  const c = newCanvas();
  const ctx = c.getContext("2d");
  const rng = mulberry32(seed);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, edge);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // granulação
  for (let i = 0; i < 1400; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 1 + rng() * 4;
    ctx.globalAlpha = 0.08 + rng() * 0.18;
    ctx.fillStyle = rng() > 0.4 ? core : edge;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

// --- Glow radial (sprite do Sol e brilho de seleção) -----------------------
export function radialGlowTexture(color = "#ffdd88") {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.2, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Chama/proeminência: língua de fogo (base larga e quente embaixo, afina e
// esfria pra cima). Usada nas labaredas do Sol pra NÃO parecerem discos. -----
export function flameTexture() {
  const w = 128;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  // gradiente vertical: base branco-amarelada quente -> topo laranja-vermelho -> transparente
  for (let y = 0; y < h; y++) {
    const t = y / h; // 0 base, 1 topo
    // largura afunila pra cima
    const halfW = (w / 2) * (1 - t) * (0.85 + 0.15 * Math.sin(t * 9));
    const cx = w / 2 + Math.sin(t * 6) * (w * 0.06); // leve ondulação
    const r = Math.round(255);
    const g = Math.round(230 - t * 150);
    const b = Math.round(150 - t * 150);
    const alpha = (1 - t) * (1 - t); // some no topo
    const grad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, `rgba(${r},${g},${Math.max(b, 0)},${alpha})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - 1 - y, w, 1); // base no rodapé do canvas
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Anel (Saturno/Urano): faixas radiais com transparência ----------------
export function ringTexture({ inner = "#caa97a", outer = "#9c8559", seed = 3 }) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = 8;
  const ctx = c.getContext("2d");
  const rng = mulberry32(seed);
  for (let x = 0; x < size; x++) {
    const t = x / size;
    const lerp = rng() > 0.5 ? inner : outer;
    ctx.globalAlpha = 0.3 + rng() * 0.6 * (1 - Math.abs(t - 0.5));
    ctx.fillStyle = lerp;
    ctx.fillRect(x, 0, 1, 8);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// --- Campo de estrelas de fundo (skybox barato) ----------------------------
export function starfieldTexture(seed = 99) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000005";
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(seed);
  for (let i = 0; i < 1200; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rng() * 1.3;
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.fillStyle = rng() > 0.92 ? "#cfe0ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
