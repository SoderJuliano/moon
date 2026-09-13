// SAGITTARIUS A* SUPERMASSIVE BLACK HOLE OBSERVATORY MODE (src/app/sgrAMode.js)
//
// Simulação física e visual 3D em tempo real de Sagitário A* (Sgr A*):
// - Lente Gravitacional de Schwarzschild (Gravitational Lensing) calculada em GLSL
// - Disco de Acreção Relativístico no plano equatorial (visível na frente e curvado por cima/baixo da sombra)
// - Efeito Doppler Relativístico (Beaming): lado que se aproxima é intensificado/azulado, lado que se afasta é atenuado/avermelhado
// - Anel de Fótons (Photon Ring) finíssimo e brilhante na borda da sombra do horizonte de eventos (r ≈ 2.6 rs)
// - Horizonte de Eventos (Event Horizon) perfeitamente negro (absorção total da luz)
// - Campo estelar cósmico com deflexão gravitacional de Einstein no fundo
// - Partículas orbitais de plasma e ventos de radiação
// - Sonificação atmosférica gravitacional sintetizada (Infrassom QPO a ~42 Hz)
// - Interface Stealth HUD 100% responsiva, acessível e sem cortes

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { starDotTexture } from "../core/textures.js";
import { t } from "../core/i18n.js";

// --- Sintetizador de Áudio Gravitacional (Web Audio API) --------------------
function createBlackHoleAudio() {
  let ctx = null;
  let subOsc = null;
  let lfoOsc = null;
  let noiseNode = null;
  let noiseFilter = null;
  let masterGain = null;
  let isMuted = false;
  let isStarted = false;

  function init() {
    if (ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = new AudioContext();

      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.connect(ctx.destination);

      // 1. Sub-bass gravitacional profundo (42 Hz)
      subOsc = ctx.createOscillator();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(42, ctx.currentTime);

      // LFO de modulação de amplitude (oscilações quase-periódicas QPO a 0.12 Hz)
      lfoOsc = ctx.createOscillator();
      lfoOsc.type = "sine";
      lfoOsc.frequency.setValueAtTime(0.12, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.35, ctx.currentTime);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.45, ctx.currentTime);
      lfoOsc.connect(subGain.gain);

      subOsc.connect(subGain);
      subGain.connect(masterGain);

      // 2. Ruído de plasma contínuo caindo no horizonte de eventos
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02; // Ruído Browniano
        lastOut = output[i];
        output[i] *= 3.5;
      }

      noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;

      noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(140, ctx.currentTime);
      noiseFilter.Q.setValueAtTime(3.0, ctx.currentTime);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, ctx.currentTime);

      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      subOsc.start();
      lfoOsc.start();
      noiseNode.start();
    } catch {
      // Navegadores que bloqueiam áudio automático
    }
  }

  function start() {
    if (!ctx) init();
    if (!ctx || isStarted) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    isStarted = true;
    if (masterGain && ctx) {
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(isMuted ? 0.0001 : 0.65, ctx.currentTime + 1.6);
    }
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (masterGain && ctx) {
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(isMuted ? 0.0001 : 0.65, ctx.currentTime + 0.2);
    }
    return isMuted;
  }

  function stop() {
    if (!ctx || !isStarted) return;
    try {
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      }
      setTimeout(() => {
        try {
          subOsc?.stop();
          lfoOsc?.stop();
          noiseNode?.stop();
          ctx?.close();
        } catch {}
      }, 550);
    } catch {}
  }

  return { start, resume, toggleMute, isMuted: () => isMuted, stop };
}

// --- Shader de Lente Gravitacional e Disco de Acreção (GLSL) -----------------
const BlackHoleShader = {
  uniforms: {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uViewMatrixInverse: { value: new THREE.Matrix4() },
    uProjectionMatrixInverse: { value: new THREE.Matrix4() },
    uResolution: { value: new THREE.Vector2() },
    uRs: { value: 1.65 }, // Raio de Schwarzschild do buraco negro
    uRin: { value: 4.25 }, // Raio interno do disco (ISCO / photon orbit)
    uRout: { value: 24.0 }, // Raio externo do disco de acreção
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform mat4 uViewMatrixInverse;
    uniform mat4 uProjectionMatrixInverse;
    uniform vec2 uResolution;
    uniform float uRs;
    uniform float uRin;
    uniform float uRout;

    #define PI 3.14159265359
    #define TWO_PI 6.28318530718

    // Função de ruído procedural pseudo-aleatório
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // FBM (Fractal Brownian Motion) para turbulência do plasma
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.02 + vec2(1.6, 3.2);
        a *= 0.5;
      }
      return v;
    }

    // Gradiente de cor de plasma superaquecido (de branco incandescente a âmbar/vermelho escuro)
    vec3 plasmaColor(float t, float doppler) {
      vec3 core = vec3(1.0, 0.98, 0.92);   // Branco superquente
      vec3 mid = vec3(1.0, 0.62, 0.18);    // Dourado / Âmbar
      vec3 outer = vec3(0.85, 0.22, 0.04); // Laranja avermelhado
      vec3 cold = vec3(0.35, 0.05, 0.02);  // Borda fria

      vec3 col = mix(cold, outer, smoothstep(0.0, 0.35, t));
      col = mix(col, mid, smoothstep(0.35, 0.72, t));
      col = mix(col, core, smoothstep(0.72, 1.0, t));

      // Modulação de cor por Doppler relativístico
      if (doppler > 1.0) {
        col = mix(col, vec3(0.85, 0.95, 1.2) * col, min(1.0, (doppler - 1.0) * 0.8));
      } else {
        col = mix(col, vec3(1.1, 0.45, 0.3) * col, min(1.0, (1.0 - doppler) * 0.7));
      }

      return col;
    }

    // Campo de estrelas cósmicas procedurais de fundo com distorção gravitacional
    vec3 getBackgroundStars(vec3 dir) {
      vec2 skyCoord = vec2(atan(dir.z, dir.x) / TWO_PI + 0.5, dir.y * 0.5 + 0.5);
      float starGrid = hash(floor(skyCoord * 450.0));
      float star = 0.0;
      if (starGrid > 0.988) {
        vec2 starCenter = (floor(skyCoord * 450.0) + 0.5) / 450.0;
        float d = length(skyCoord - starCenter) * 450.0;
        star = smoothstep(0.45, 0.0, d) * (0.6 + 0.4 * fract(starGrid * 842.1));
      }

      // Brilho difuso galáctico ao redor
      float galaxyGlow = pow(max(0.0, 1.0 - abs(dir.y)), 4.0) * 0.035;
      vec3 nebColor = vec3(0.04, 0.08, 0.18) * galaxyGlow + vec3(star * 0.95, star * 0.96, star * 1.05);
      return nebColor;
    }

    void main() {
      // Posição inicial e direção do raio da câmera
      vec3 rayOrigin = uCameraPos;
      vec3 rayDir = normalize(vWorldPosition - uCameraPos);

      // Trajetória do raio de luz curvada pela gravidade de Schwarzschild (Geodesic Marching)
      vec3 pos = rayOrigin;
      vec3 dir = rayDir;

      vec3 accumulatedColor = vec3(0.0);
      float accumulatedAlpha = 0.0;

      // Parâmetros do Buraco Negro
      float rs = uRs;
      float rShadow = rs * 1.55; // Raio da sombra do horizonte de eventos aparente

      const int MAX_STEPS = 64;
      float stepSize = 0.35;

      bool hitEventHorizon = false;

      for (int i = 0; i < MAX_STEPS; i++) {
        float r = length(pos);

        // Se atingiu o horizonte de eventos (buraco negro absorve 100% da luz)
        if (r < rs * 1.05) {
          hitEventHorizon = true;
          break;
        }

        // Se afastou demais do sistema
        if (r > uRout * 1.8 && dot(pos, dir) > 0.0) {
          break;
        }

        // 1. Deflexão gravitacional de Einstein sobre o vetor de direção da luz
        // Aceleração em direção ao centro: a = -1.5 * rs / r^3 * (pos - dot(pos, dir) * dir)
        vec3 gravityForce = - (1.5 * rs / (r * r * r)) * (pos - dot(pos, dir) * dir);
        dir = normalize(dir + gravityForce * stepSize);

        // Posição anterior para testar travessia do plano equatorial (y = 0)
        vec3 prevPos = pos;
        pos += dir * stepSize;

        // 2. Interseção com o disco de acreção (plano y = 0)
        // O disco reside no plano XZ com espessura suave
        if ((prevPos.y * pos.y <= 0.0) || (abs(pos.y) < 0.65)) {
          // Ponto de interseção interpolado no plano y = 0
          float tPlane = prevPos.y / (prevPos.y - pos.y + 0.00001);
          vec3 hitP = mix(prevPos, pos, clamp(tPlane, 0.0, 1.0));
          float hitR = length(hitP.xz);

          if (hitR >= uRin && hitR <= uRout) {
            // Ângulo azimutal no disco de acreção
            float phi = atan(hitP.z, hitP.x);

            // Velocidade orbital Kepleriana: omega(r) = sqrt(GM / r^3)
            float omega = 3.2 / pow(hitR, 1.25);
            float rotatedPhi = phi - uTime * omega;

            // Turbulência de plasma via FBM com estiramento azimutal
            vec2 discCoord = vec2(rotatedPhi * 2.5, hitR * 0.85);
            float plasmaNoise = fbm(discCoord);
            float density = smoothstep(uRin, uRin + 1.2, hitR) * (1.0 - smoothstep(uRout - 3.5, uRout, hitR));
            density *= pow(plasmaNoise, 1.6) * 1.8;

            // Efeito Doppler Relativístico (Beaming):
            // Vetor velocidade do plasma v = (-sin(phi), 0, cos(phi))
            vec3 vPlasma = vec3(-sin(phi), 0.0, cos(phi));
            float beta = 0.58 * sqrt(uRin / hitR); // Velocidade relativística v/c
            float cosTheta = dot(normalize(vPlasma), -dir);
            // Fator de Doppler: delta = 1 / (gamma * (1 - beta * cosTheta))
            float gamma = 1.0 / sqrt(max(0.01, 1.0 - beta * beta));
            float doppler = 1.0 / (gamma * (1.0 - beta * cosTheta));
            float beaming = pow(doppler, 3.2);

            // Brilho e cor da amostra
            float tempFactor = (1.0 - (hitR - uRin) / (uRout - uRin));
            vec3 col = plasmaColor(tempFactor, doppler) * density * beaming * 1.7;

            // Espessura e opacidade
            float heightFalloff = exp(-abs(hitP.y) * 2.8);
            float sampleAlpha = clamp(density * heightFalloff * 0.75, 0.0, 1.0);

            accumulatedColor += col * (1.0 - accumulatedAlpha) * sampleAlpha;
            accumulatedAlpha += sampleAlpha * (1.0 - accumulatedAlpha);

            if (accumulatedAlpha > 0.98) break;
          }
        }

        // Ajuste dinâmico do passo (menor perto do centro para precisão, maior longe)
        stepSize = clamp(r * 0.08, 0.12, 1.4);
      }

      // 3. Anel de Fótons (Photon Ring) finíssimo e super brilhante próximo a rShadow
      float closestR = length(pos - dot(pos, dir) * dir);
      float photonRing = exp(-pow((closestR - rShadow * 1.02) * 12.0, 2.0)) * 2.2;
      vec3 photonCol = vec3(1.0, 0.92, 0.75) * photonRing;
      accumulatedColor += photonCol * (1.0 - accumulatedAlpha);

      // 4. Se o raio caiu no horizonte de eventos, é preto absoluto
      if (hitEventHorizon) {
        // Absorção total
        gl_FragColor = vec4(accumulatedColor, 1.0);
        return;
      }

      // 5. Fundo cósmico com distorção gravitacional de Einstein
      vec3 bgStars = getBackgroundStars(dir);
      vec3 finalCol = accumulatedColor + bgStars * (1.0 - clamp(accumulatedAlpha, 0.0, 1.0));

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `,
};

export function startSgrAMode({ onExit } = {}) {
  // --- Cena, Câmera e Renderizador ------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#000205");

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);
  camera.position.set(0, 18, 55);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.appendChild(renderer.domElement);

  // --- Controles de Câmera 3D -----------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.85;
  controls.minDistance = 8.0;
  controls.maxDistance = 250.0;
  controls.target.set(0, 0, 0);

  // --- Malha de Renderização Volumétrica do Buraco Negro ---------------------
  // Esfera de raio grande envolvendo o buraco negro e o disco de acreção
  const bhGeo = new THREE.SphereGeometry(60, 64, 64);
  const bhMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(BlackHoleShader.uniforms),
    vertexShader: BlackHoleShader.vertexShader,
    fragmentShader: BlackHoleShader.fragmentShader,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: false,
  });
  bhMat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

  const blackHoleMesh = new THREE.Mesh(bhGeo, bhMat);
  scene.add(blackHoleMesh);

  // Esfera física interna do Horizonte de Eventos (opacidade total para depth buffer)
  const horizonGeo = new THREE.SphereGeometry(1.65, 32, 32);
  const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
  scene.add(horizonMesh);

  // --- Partículas de Plasma e Poeira Orbital --------------------------------
  const PARTICLE_COUNT = 900;
  const partGeo = new THREE.BufferGeometry();
  const partPositions = new Float32Array(PARTICLE_COUNT * 3);
  const partColors = new Float32Array(PARTICLE_COUNT * 3);
  const partRadii = new Float32Array(PARTICLE_COUNT);
  const partAngles = new Float32Array(PARTICLE_COUNT);
  const partSpeeds = new Float32Array(PARTICLE_COUNT);
  const partVerticalOffsets = new Float32Array(PARTICLE_COUNT);

  const colCore = new THREE.Color("#fff2d6");
  const colMid = new THREE.Color("#ff9e2c");
  const colOuter = new THREE.Color("#d93b0b");
  const tempColor = new THREE.Color();

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = 4.3 + Math.pow(Math.random(), 1.6) * 20.0;
    const angle = Math.random() * Math.PI * 2;
    const speed = (2.2 / Math.sqrt(r)) * (0.85 + Math.random() * 0.3);
    const vOffset = (Math.random() - 0.5) * (0.2 + r * 0.04);

    partRadii[i] = r;
    partAngles[i] = angle;
    partSpeeds[i] = speed;
    partVerticalOffsets[i] = vOffset;

    partPositions[i * 3] = Math.cos(angle) * r;
    partPositions[i * 3 + 1] = vOffset;
    partPositions[i * 3 + 2] = Math.sin(angle) * r;

    const tNorm = (r - 4.3) / 20.0;
    if (tNorm < 0.35) {
      tempColor.copy(colCore).lerp(colMid, tNorm / 0.35);
    } else {
      tempColor.copy(colMid).lerp(colOuter, (tNorm - 0.35) / 0.65);
    }

    partColors[i * 3] = tempColor.r;
    partColors[i * 3 + 1] = tempColor.g;
    partColors[i * 3 + 2] = tempColor.b;
  }

  partGeo.setAttribute("position", new THREE.BufferAttribute(partPositions, 3));
  partGeo.setAttribute("color", new THREE.BufferAttribute(partColors, 3));

  const partMat = new THREE.PointsMaterial({
    map: starDotTexture(),
    vertexColors: true,
    size: 0.9,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const plasmaParticles = new THREE.Points(partGeo, partMat);
  scene.add(plasmaParticles);

  // --- Interface Stealth HUD ------------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "vela-overlay sgra-overlay";
  overlay.innerHTML = `
    <div class="vela-top-hud sgra-top-hud">
      <div class="vela-title-row">
        <span class="sgra-beacon-dot" aria-hidden="true"></span>
        <h1 class="vela-title">${t("sgra.title") || "SAGITÁRIO A*"}</h1>
      </div>
      <div class="vela-subtitle">${t("sgra.sub") || "Buraco Negro Supermassivo • Sombra do Horizonte de Eventos"}</div>
      <div class="vela-stats-grid">
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.sgrAType") || "Tipo de Objeto"}:</span>
          <span class="vela-stat-val">${t("menu.sgrATypeValue") || "Buraco Negro Supermassivo (SMBH)"}</span>
        </div>
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.sgrADistance") || "Distância"}:</span>
          <span class="vela-stat-val">${t("menu.sgrADistanceValue") || "~26.673 anos-luz (Centro)"}</span>
        </div>
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.sgrAMass") || "Massa Real"}:</span>
          <span class="vela-stat-val">${t("menu.sgrAMassValue") || "~4,154 milhões M☉ (8,26 × 10³⁶ kg)"}</span>
        </div>
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.sgrARadius") || "Raio Schwarzschild"}:</span>
          <span class="vela-stat-val">${t("menu.sgrARadiusValue") || "~12,27 milhões km (~0,08 UA)"}</span>
        </div>
        <div class="vela-stat-item">
          <span class="vela-stat-label">${t("menu.sgrAShadow") || "Raio da Sombra"}:</span>
          <span class="vela-stat-val">${t("menu.sgrAShadowValue") || "~31,9 milhões km (~52 μas)"}</span>
        </div>
      </div>
    </div>
    <div class="vela-bottom-hud sgra-bottom-hud">
      <button type="button" class="vela-hint vela-btn-esc" id="sgra-exit-btn" aria-label="${t("sgra.hintEsc") || "Voltar à Via Láctea"}" title="${t("sgra.hintEsc") || "Voltar à Via Láctea"}">
        <span class="vela-kbd">ESC</span>
        <span class="vela-hint-text">${t("sgra.backToMilkyWay") || "Voltar à Via Láctea"}</span>
      </button>
      <button type="button" class="vela-hint vela-audio-hint vela-btn-audio" id="sgra-mute-btn" aria-label="Alternar áudio gravitacional (M)" title="Alternar áudio gravitacional (M)">
        <span class="vela-kbd">M</span>
        <span class="sgra-mute-text">${t("sgra.audioActive") || "Áudio Gravitacional: Ativo (Infrassom QPO)"}</span>
      </button>
    </div>
    <div class="vela-fade-layer"></div>
  `;
  document.body.appendChild(overlay);

  // Iniciar áudio gravitacional
  const audio = createBlackHoleAudio();
  audio.start();

  const resumeAudio = () => {
    audio.resume();
    audio.start();
  };
  window.addEventListener("pointerdown", resumeAudio);
  window.addEventListener("click", resumeAudio);
  window.addEventListener("keydown", resumeAudio);
  window.addEventListener("touchstart", resumeAudio);

  const muteText = overlay.querySelector(".sgra-mute-text");
  function updateMuteDisplay() {
    if (muteText) {
      muteText.textContent = audio.isMuted()
        ? (t("sgra.audioMuted") || "Áudio Gravitacional: Silenciado")
        : (t("sgra.audioActive") || "Áudio Gravitacional: Ativo (Infrassom QPO)");
    }
  }

  // Interatividade dos botões do HUD
  const exitBtn = overlay.querySelector("#sgra-exit-btn");
  if (exitBtn) {
    exitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleExit();
    });
  }

  const muteBtn = overlay.querySelector("#sgra-mute-btn");
  if (muteBtn) {
    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.toggleMute();
      updateMuteDisplay();
    });
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
    bhMat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  // --- Loop de Animação em 60 FPS --------------------------------------------
  const clock = new THREE.Clock();
  let rafId = 0;
  let hiddenLoading = false;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    controls.update();

    const elapsedTime = clock.getElapsedTime();

    // 1. Atualizar Uniforms do Shader de Lente Gravitacional
    bhMat.uniforms.uTime.value = elapsedTime;
    bhMat.uniforms.uCameraPos.value.copy(camera.position);

    // 2. Atualizar partículas orbitais de plasma
    const posArray = partGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      partAngles[i] += partSpeeds[i] * dt;
      const angle = partAngles[i];
      const r = partRadii[i];
      posArray[i * 3] = Math.cos(angle) * r;
      posArray[i * 3 + 1] = partVerticalOffsets[i];
      posArray[i * 3 + 2] = Math.sin(angle) * r;
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

    bhGeo.dispose();
    bhMat.dispose();
    horizonGeo.dispose();
    horizonMat.dispose();
    partGeo.dispose();
    partMat.dispose();

    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
  }
}
