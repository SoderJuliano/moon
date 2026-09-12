// VELA PULSAR OBSERVATORY MODE (app/velaMode.js)
//
// Modo de observação contemplativa 3D de altíssima fidelidade do Pulsar de Vela (PSR B0833-45):
// - Estrela de nêutrons central hiperdensa, brilhante e ofuscante
// - Feixes relativísticos infinitos (bipolares: 1 para cima, 1 para baixo):
//   * Sem cortes ou limites visíveis: estendem-se por 150.000 unidades com dissolução suave no infinito
//   * Espessura encorpada com corpo luminoso sólido (núcleo branco incandescente + coroa ciano elétrica)
//   * Trepidação de alta energia: micro-vibrações elétricas, ondas de plasma velozes e pulsação a 11.2 Hz
//   * Rotação dinâmica enérgica sem ilusão de 4 asas
// - Sonificação clássica da NASA: alta, seca, potente e rítmica a 11.195 Hz (sem eco estranho)
// - Fundo espacial limpo de céu profundo
// - Câmera orbital livre e saída suave via tecla ESC ou gamepad.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { starDotTexture } from "../core/textures.js";
import { t } from "../core/i18n.js";

// --- Gerador de Textura de Brilho Radial da Estrela ------------------------
function createGlowTexture(edgeColor = "#00e5ff", coreColor = "#ffffff") {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, coreColor);
  g.addColorStop(0.14, coreColor);
  g.addColorStop(0.32, edgeColor);
  g.addColorStop(0.68, "rgba(0, 140, 255, 0.2)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Spike de difração anamorfo horizontal suave
function createFlareSpikeTexture() {
  const w = 1024;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.08, "#c8f2ff");
  g.addColorStop(0.26, "rgba(0, 229, 255, 0.65)");
  g.addColorStop(0.6, "rgba(0, 140, 255, 0.15)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 12, 0, 0, Math.PI * 2);
  ctx.fill();

  const lGrad = ctx.createLinearGradient(0, 0, w, 0);
  lGrad.addColorStop(0, "rgba(255,255,255,0)");
  lGrad.addColorStop(0.38, "rgba(255,255,255,0.7)");
  lGrad.addColorStop(0.5, "rgba(255,255,255,1)");
  lGrad.addColorStop(0.62, "rgba(255,255,255,0.7)");
  lGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = lGrad;
  ctx.fillRect(0, h / 2 - 1, w, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Geometria do Feixe Laser Cônico Infinito (Flared) ---------------------
// Comprimento massivo (150.000 unidades) para atravessar o cosmos sem corte
function createSingleFlaredBeamGeometry(rBase, rTop, length, radialSegments = 48, heightSegments = 140) {
  const geo = new THREE.BufferGeometry();
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let yStep = 0; yStep <= heightSegments; yStep++) {
    const t = yStep / heightSegments; // 0 na base (y=1.4), 1 no topo distante (y=1.4+length)
    // Curva de expansão suave: fininho na base e vai aumentando progressivamente
    const r = rBase + (rTop - rBase) * Math.pow(t, 0.82);
    const y = 1.4 + t * length;

    for (let xStep = 0; xStep <= radialSegments; xStep++) {
      const u = xStep / radialSegments;
      const theta = u * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      vertices.push(x, y, z);
      uvs.push(u, t);
    }
  }

  const stride = radialSegments + 1;
  for (let yStep = 0; yStep < heightSegments; yStep++) {
    for (let xStep = 0; xStep < radialSegments; xStep++) {
      const a = yStep * stride + xStep;
      const b = (yStep + 1) * stride + xStep;
      const c = (yStep + 1) * stride + (xStep + 1);
      const d = yStep * stride + (xStep + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Shader Customizado com Trepidação de Plasma de Alta Energia e Dissolução no Infinito
const BeamShader = {
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vY;

    void main() {
      vUv = uv;
      vY = position.y;

      // Micro-trepidação e oscilação de plasma elétrico ao longo do feixe
      vec3 pos = position;
      float wobble = sin(position.y * 0.06 - uTime * 45.0) * 0.035 * min(position.y * 0.05, 4.0);
      pos.x += wobble * sin(uTime * 75.0);
      pos.z += wobble * cos(uTime * 75.0);

      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColorCore;
    uniform vec3 uColorGlow;
    uniform float uLength;

    varying vec2 vUv;
    varying float vY;

    void main() {
      // vUv.x vai de 0 a 1 ao redor do cilindro
      float u = vUv.x;
      float distFromCenter = abs(u - 0.5) * 2.0;

      // Perfil gaussiano encorpado e denso
      float profile = exp(-pow(distFromCenter * 1.55, 2.0));

      // Trepidação de alta energia com ondas de plasma rápidas a ~11.2 Hz
      float waveFast = sin(vUv.y * 240.0 - uTime * 65.0);
      float waveUltra = sin(vUv.y * 700.0 - uTime * 140.0);
      float pulse11Hz = sin(uTime * 70.34); // 11.195 Hz * 2*PI
      float plasmaMod = 0.90 + 0.06 * waveFast + 0.04 * waveUltra + 0.07 * pulse11Hz;

      // Dissolução perfeita no espaço profundo (sem nunca apresentar ponta cortada)
      float distFade = 1.0 - smoothstep(uLength * 0.35, uLength * 0.95, vY);
      distFade = clamp(distFade, 0.0, 1.0);

      // Núcleo branco incandescente com transição ciano e azul elétrico
      vec3 color = mix(uColorCore, uColorGlow, smoothstep(0.0, 0.6, distFromCenter));
      if (distFromCenter < 0.36) {
        color = mix(vec3(1.0, 1.0, 1.0), color, distFromCenter / 0.36);
      }

      float alpha = profile * plasmaMod * distFade * 0.98;
      if (alpha < 0.002) discard;

      gl_FragColor = vec4(color, alpha);
    }
  `,
};

// --- Fundo de Céu Profundo Realista ----------------------------------------
function makeStarDome() {
  const dome = new THREE.Group();
  const R = 8000;
  const layers = [
    { count: 7000, size: 1.1, bright: 0.6 },
    { count: 2200, size: 2.0, bright: 0.85 },
    { count: 350, size: 3.0, bright: 1.0 },
  ];
  const sprite = starDotTexture();
  for (const { count, size, bright } of layers) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      pos[i * 3] = s * Math.cos(a) * R;
      pos[i * 3 + 1] = z * R;
      pos[i * 3 + 2] = s * Math.sin(a) * R;

      let r = 1, g = 1, b = 1;
      const rnd = Math.random();
      if (rnd < 0.3) { r = 0.75; g = 0.88; b = 1.0; } // azul celeste
      else if (rnd < 0.4) { r = 1.0; g = 0.88; b = 0.72; } // âmbar
      else if (rnd < 0.46) { r = 0.92; g = 0.78; b = 1.0; } // violeta

      const v = bright * (0.6 + Math.random() * 0.4);
      col[i * 3] = r * v;
      col[i * 3 + 1] = g * v;
      col[i * 3 + 2] = b * v;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: sprite,
        size,
        sizeAttenuation: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      })
    );
    pts.renderOrder = -2;
    pts.frustumCulled = false;
    pts.onBeforeRender = (renderer, sc, camera) => {
      pts.position.copy(camera.position);
      pts.updateMatrixWorld();
    };
    dome.add(pts);
  }

  // Poeira cósmica suave e elegante ao fundo (remota)
  const DUST_COUNT = 450;
  const dPos = new Float32Array(DUST_COUNT * 3);
  const dCol = new Float32Array(DUST_COUNT * 3);
  const cTeal = new THREE.Color("#006d88");
  const cBlue = new THREE.Color("#0b2559");
  const cTmp = new THREE.Color();

  for (let i = 0; i < DUST_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const dist = 1200 + Math.random() * 3000;

    dPos[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
    dPos[i * 3 + 1] = dist * Math.cos(phi) * 0.6;
    dPos[i * 3 + 2] = dist * Math.sin(phi) * Math.sin(theta);

    const rnd = Math.random();
    if (rnd < 0.6) cTmp.copy(cBlue);
    else cTmp.copy(cTeal);

    const intensity = 0.05 + Math.random() * 0.08;
    dCol[i * 3] = cTmp.r * intensity;
    dCol[i * 3 + 1] = cTmp.g * intensity;
    dCol[i * 3 + 2] = cTmp.b * intensity;
  }

  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute("color", new THREE.BufferAttribute(dCol, 3));
  const dMat = new THREE.PointsMaterial({
    map: sprite,
    size: 200.0,
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const cosmicDust = new THREE.Points(dGeo, dMat);
  dome.add(cosmicDust);

  return dome;
}

// --- Síntese de Áudio Profissional Fiel da NASA (Web Audio API) --------------
// Som clássico, seco, de alto volume e impacto sonoro original (~11.195 Hz)
function createPulsarAudio() {
  let ctx = null;
  let masterGain = null;
  let compressor = null;
  let timerId = null;
  let isMuted = false;
  let isRunning = false;

  const PULSE_INTERVAL_MS = 89.325; // ~11.195 Hz

  function initAudio() {
    if (ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();

      // Compressor de estúdio / Limiter: volume elevado, pegada enérgica e proteção contra clipping
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-5, ctx.currentTime);
      compressor.knee.setValueAtTime(4, ctx.currentTime);
      compressor.ratio.setValueAtTime(16, ctx.currentTime);
      compressor.attack.setValueAtTime(0.0003, ctx.currentTime);
      compressor.release.setValueAtTime(0.022, ctx.currentTime);

      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.5, ctx.currentTime);

      masterGain.connect(compressor);
      compressor.connect(ctx.destination);
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  function playTick() {
    if (!ctx || isMuted) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
      return;
    }
    const now = ctx.currentTime;

    // 1. Estalo de varredura de rádio cósmico cortante (o "tack" da NASA)
    const noiseLen = Math.floor(ctx.sampleRate * 0.022);
    const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      const decay = Math.exp(-i / (noiseLen * 0.2));
      noiseData[i] = (Math.random() * 2 - 1) * decay;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.setValueAtTime(2200, now);
    bpf.Q.setValueAtTime(2.6, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    noiseSource.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);

    // 2. Pulso tonal mecânico ressonante do motor do pulsar
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.026);

    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(1600, now);

    oscGain.gain.setValueAtTime(1.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(lpf);
    lpf.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.028);

    // 3. Batida de impacto subgrave
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(95, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.032);

    subGain.gain.setValueAtTime(0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

    sub.connect(subGain);
    subGain.connect(masterGain);
    sub.start(now);
    sub.stop(now + 0.035);
  }

  function start() {
    initAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    isRunning = true;
    if (!timerId) {
      timerId = setInterval(playTick, PULSE_INTERVAL_MS);
    }
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (!isMuted && ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return !isMuted;
  }

  function stop() {
    isRunning = false;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  }

  return {
    start,
    resume,
    stop,
    toggleMute,
    isMuted: () => isMuted,
  };
}

export function startVelaMode({ onExit } = {}) {
  // --- Cena Three.js --------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010308);
  scene.add(makeStarDome());

  const camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.1,
    250000
  );
  // Posição inicial cinematográfica
  camera.position.set(0, 14, 86);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 5;
  controls.maxDistance = 2500;
  controls.target.set(0, 0, 0);

  // Iluminação ambiente + luz pontual estelar
  const ambLight = new THREE.AmbientLight(0x050e1c, 1.0);
  scene.add(ambLight);

  const pulsarPointLight = new THREE.PointLight(0xbdf5ff, 15.0, 6000, 0.9);
  pulsarPointLight.position.set(0, 0, 0);
  scene.add(pulsarPointLight);

  // --- O SISTEMA DO PULSAR DE VELA ------------------------------------------
  const systemGroup = new THREE.Group();
  scene.add(systemGroup);

  // Texturas procedurais compartilhadas
  const glowCyanTex = createGlowTexture("#00e5ff", "#ffffff");
  const glowBlueTex = createGlowTexture("#0077ff", "#ffffff");
  const glowVioletTex = createGlowTexture("#6a00ff", "#ffffff");
  const flareSpikeTex = createFlareSpikeTexture();

  // 1. O NÚCLEO DA ESTRELA DE NÊUTRONS (Compacta, brilhante e incandescente)
  const coreGeo = new THREE.SphereGeometry(1.4, 64, 64);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  systemGroup.add(coreMesh);

  // Camadas de Bloom & Coroa estelar ofuscante (Sprites aditivos)
  // a) Brilho central intenso
  const coreGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowCyanTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 1.0,
      depthWrite: false,
    })
  );
  coreGlow.scale.set(11, 11, 1);
  systemGroup.add(coreGlow);

  // b) Coroa ciano elétrica
  const coronaCyan = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowCyanTex,
      color: 0x00f5ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  coronaCyan.scale.set(26, 26, 1);
  systemGroup.add(coronaCyan);

  // c) Aura atmosférica azul cobalto
  const coronaBlue = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowBlueTex,
      color: 0x0077ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.52,
      depthWrite: false,
    })
  );
  coronaBlue.scale.set(60, 60, 1);
  systemGroup.add(coronaBlue);

  // d) Névoa cósmica violeta difusa
  const coronaViolet = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowVioletTex,
      color: 0x7c22ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.2,
      depthWrite: false,
    })
  );
  coronaViolet.scale.set(130, 130, 1);
  systemGroup.add(coronaViolet);

  // e) Spike de difração horizontal anamorfo
  const flareSpikeHorizontal = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flareSpikeTex,
      color: 0xe0f7ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.88,
      depthWrite: false,
    })
  );
  flareSpikeHorizontal.scale.set(85, 2.8, 1);
  systemGroup.add(flareSpikeHorizontal);

  // 2. EIXO MAGNÉTICO E FEIXE RELATIVÍSTICO ÚNICO (Bipolar: 1 feixe para cima, 1 feixe para baixo)
  const magneticGroup = new THREE.Group();
  // Inclinação do eixo magnético em relação ao eixo de rotação (~20°)
  magneticGroup.rotation.z = THREE.MathUtils.degToRad(20);
  systemGroup.add(magneticGroup);

  // Comprimento que se estende por todo o cosmos (150.000 unidades)
  const BEAM_LENGTH = 150000;

  // Material com Shader Customizado para os feixes com trepidação
  const beamUniforms = {
    uTime: { value: 0 },
    uColorCore: { value: new THREE.Color("#e4f8ff") },
    uColorGlow: { value: new THREE.Color("#00a6ff") },
    uLength: { value: BEAM_LENGTH },
  };

  function createSingleJet(direction = 1) {
    const jetGroup = new THREE.Group();

    // Geometria única cônica flared infinita (rBase=0.22 -> rTop=110.0)
    const beamGeo = createSingleFlaredBeamGeometry(0.22, 110.0, BEAM_LENGTH, 48, 140);
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: BeamShader.vertexShader,
      fragmentShader: BeamShader.fragmentShader,
      uniforms: beamUniforms,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    jetGroup.add(beamMesh);

    // Ponto de luz polar de contato junto à superfície
    const polarFlare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowCyanTex,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    polarFlare.position.set(0, 1.4, 0);
    polarFlare.scale.set(7.5, 7.5, 1);
    jetGroup.add(polarFlare);

    if (direction < 0) {
      jetGroup.rotation.x = Math.PI; // Inverte para apontar para baixo (-Y)
    }

    return {
      group: jetGroup,
      geo: beamGeo,
      mat: beamMat,
    };
  }

  // APENAS 1 FEIXE PARA CIMA (+Y) E APENAS 1 FEIXE PARA BAIXO (-Y)
  const northJet = createSingleJet(1);
  const southJet = createSingleJet(-1);
  magneticGroup.add(northJet.group);
  magneticGroup.add(southJet.group);

  // 3. Partículas de Plasma Finas Fluindo ao Longo da Linha do Feixe
  const PARTICLE_COUNT = 200;
  const partPos = new Float32Array(PARTICLE_COUNT * 3);
  const partSpeed = new Float32Array(PARTICLE_COUNT);
  const partDist = new Float32Array(PARTICLE_COUNT);
  const partDir = new Int8Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    partDir[i] = Math.random() > 0.5 ? 1 : -1;
    partDist[i] = 1.4 + Math.random() * 600;
    partSpeed[i] = 350 + Math.random() * 550;

    const y = partDist[i] * partDir[i];
    partPos[i * 3] = (Math.random() - 0.5) * 0.35;
    partPos[i * 3 + 1] = y;
    partPos[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
  }

  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
  const partMat = new THREE.PointsMaterial({
    map: glowCyanTex,
    color: 0xebfaff,
    size: 2.4,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const jetParticles = new THREE.Points(partGeo, partMat);
  magneticGroup.add(jetParticles);

  // --- Interface Stealth HUD ------------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "vela-overlay";
  overlay.innerHTML = `
    <div class="vela-top-hud">
      <div class="vela-title-row">
        <span class="vela-beacon-dot"></span>
        <h1 class="vela-title">${t("vela.title") || "PULSAR DE VELA"}</h1>
      </div>
      <div class="vela-subtitle">${t("vela.sub") || "PSR B0833-45 • Remanescente de Supernova (Vela SNR)"}</div>
      <div class="vela-stats-grid">
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.velaType") || "Tipo de Objeto"}:</span>
          <span class="vela-stat-val">${t("menu.velaTypeValue") || "Estrela de Nêutrons (Pulsar)"}</span>
        </div>
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.velaDistance") || "Distância"}:</span>
          <span class="vela-stat-val">~950 - 1.000 anos-luz</span>
        </div>
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.velaRotation") || "Frequência Real"}:</span>
          <span class="vela-stat-val">11,195 rotações/seg (89,3 ms)</span>
        </div>
      </div>
    </div>
    <div class="vela-bottom-hud">
      <div class="vela-hint">
        <span class="vela-kbd">ESC</span> ${t("vela.hintEsc") || "Voltar à Via Láctea"}
      </div>
      <div class="vela-hint vela-audio-hint">
        <span class="vela-kbd">M</span> <span class="vela-mute-text">Áudio: Ativo (11.2 Hz)</span>
      </div>
    </div>
    <div class="vela-fade-layer"></div>
  `;
  document.body.appendChild(overlay);

  // Iniciar áudio sonificado
  const audio = createPulsarAudio();
  audio.start();

  const resumeAudio = () => {
    audio.resume();
    audio.start();
  };
  window.addEventListener("pointerdown", resumeAudio);
  window.addEventListener("click", resumeAudio);
  window.addEventListener("keydown", resumeAudio);
  window.addEventListener("touchstart", resumeAudio);

  const muteText = overlay.querySelector(".vela-mute-text");
  function updateMuteDisplay() {
    if (muteText) {
      muteText.textContent = audio.isMuted() ? "Áudio: Silenciado" : "Áudio: Ativo (11.2 Hz)";
    }
  }

  // --- Saída suave (Exit) ----------------------------------------------------
  let isDisposing = false;
  function handleExit() {
    if (isDisposing) return;
    isDisposing = true;

    const fade = overlay.querySelector(".vela-fade-layer");
    if (fade) fade.classList.add("on");

    audio.stop();

    setTimeout(() => {
      dispose();
      if (typeof onExit === "function") {
        onExit();
      }
    }, 600);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      handleExit();
    } else if (e.key === "m" || e.key === "M") {
      audio.toggleMute();
      updateMuteDisplay();
    }
  }
  window.addEventListener("keydown", onKeyDown);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  // --- Loop de Animação de Alto Desempenho -----------------------------------
  const clock = new THREE.Clock();
  let rafId = 0;
  let hiddenLoading = false;

  // Velocidade de rotação enérgica e dinâmica (~2.2 rotações por segundo)
  const ROTATION_RAD_PER_SEC = Math.PI * 2 * 2.2;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    controls.update();

    const time = performance.now() * 0.001;
    const pulse11Hz = Math.sin(time * Math.PI * 2 * 11.195);
    const jitterFast = Math.sin(time * 75.0) * 0.012;

    // 1. Rotação dinâmica com trepidação vibracional de alta energia
    systemGroup.rotation.y += (ROTATION_RAD_PER_SEC + 0.8 * pulse11Hz) * dt;
    magneticGroup.rotation.z = THREE.MathUtils.degToRad(20) + jitterFast;
    magneticGroup.rotation.x = Math.cos(time * 85.0) * 0.01;

    // 2. Atualização de tempo do shader dos feixes
    beamUniforms.uTime.value += dt;

    // 3. Modulação de pulso e brilho estelar a 11.2 Hz com micro-vibrações
    const pulseFactor = 0.88 + 0.12 * pulse11Hz + 0.03 * Math.sin(time * 95.0);
    coreGlow.scale.set(11 * pulseFactor, 11 * pulseFactor, 1);
    coronaCyan.scale.set(26 * pulseFactor, 26 * pulseFactor, 1);
    flareSpikeHorizontal.scale.set(85 * pulseFactor, 2.8 * pulseFactor, 1);
    pulsarPointLight.intensity = 15.0 * pulseFactor;

    // 4. Atualizar partículas de plasma ao longo dos feixes
    const positions = partGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      partDist[i] += partSpeed[i] * dt;
      if (partDist[i] > 600) {
        partDist[i] = 1.4 + Math.random() * 4.0;
      }
      const y = partDist[i] * partDir[i];
      positions[i * 3 + 1] = y;
    }
    partGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);

    if (!hiddenLoading) {
      document.getElementById("loading")?.remove();
      hiddenLoading = true;
    }
  }

  animate();

  // Limpeza de recursos e memória VRAM
  function dispose() {
    cancelAnimationFrame(rafId);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointerdown", resumeAudio);
    window.removeEventListener("click", resumeAudio);
    window.removeEventListener("keydown", resumeAudio);
    window.removeEventListener("touchstart", resumeAudio);

    controls.dispose();
    audio.stop();

    glowCyanTex.dispose();
    glowBlueTex.dispose();
    glowVioletTex.dispose();
    flareSpikeTex.dispose();

    coreGeo.dispose();
    coreMat.dispose();

    northJet.geo.dispose();
    northJet.mat.dispose();
    southJet.geo.dispose();
    southJet.mat.dispose();

    partGeo.dispose();
    partMat.dispose();

    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
  }
}
