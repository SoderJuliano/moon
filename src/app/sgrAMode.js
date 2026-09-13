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
    uniform vec2 uResolution;
    uniform float uRs;
    uniform float uRin;
    uniform float uRout;

    #define PI 3.14159265359
    #define TWO_PI 6.28318530718
    #define R_BOUND 36.0

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
        p = p * 2.04 + vec2(1.6, 3.2);
        a *= 0.5;
      }
      return v;
    }

    // Gradiente de cor de plasma superaquecido (de branco incandescente a âmbar/vermelho escuro)
    vec3 plasmaColor(float t, float doppler) {
      vec3 core = vec3(1.0, 0.98, 0.94);   // Branco superquente incandescente
      vec3 mid = vec3(1.0, 0.65, 0.20);    // Dourado / Âmbar
      vec3 outer = vec3(0.92, 0.28, 0.05); // Laranja avermelhado
      vec3 cold = vec3(0.38, 0.06, 0.02);  // Borda fria
      vec3 deep = vec3(0.12, 0.01, 0.01);

      vec3 col = mix(deep, cold, smoothstep(0.0, 0.25, t));
      col = mix(col, outer, smoothstep(0.25, 0.55, t));
      col = mix(col, mid, smoothstep(0.55, 0.82, t));
      col = mix(col, core, smoothstep(0.82, 1.0, t));

      // Modulação de cor por Doppler relativístico e redshift
      if (doppler > 1.0) {
        col = mix(col, vec3(0.88, 0.96, 1.25) * col, min(1.0, (doppler - 1.0) * 0.75));
      } else {
        col = mix(col, vec3(1.15, 0.45, 0.28) * col, min(1.0, (1.0 - doppler) * 0.8));
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
      float galaxyGlow = pow(max(0.0, 1.0 - abs(dir.y)), 4.0) * 0.04;
      vec3 nebColor = vec3(0.04, 0.08, 0.18) * galaxyGlow + vec3(star * 0.95, star * 0.96, star * 1.05);
      return nebColor;
    }

    void main() {
      // Posição inicial e direção do raio da câmera
      vec3 rayOrigin = uCameraPos;
      vec3 rayDir = normalize(vWorldPosition - uCameraPos);

      // Avanço analítico instantâneo para a esfera delimitadora de raio R_BOUND
      // Isso economiza dezenas de passos no vácuo e garante precisão máxima
      float bProj = dot(rayOrigin, rayDir);
      float cDist = dot(rayOrigin, rayOrigin) - R_BOUND * R_BOUND;
      float discr = bProj * bProj - cDist;

      vec3 pos = rayOrigin;
      vec3 dir = rayDir;

      if (length(rayOrigin) > R_BOUND) {
        if (discr < 0.0 || (-bProj - sqrt(discr)) < 0.0) {
          // O raio nunca entra na esfera de influência gravitacional
          vec3 bg = getBackgroundStars(rayDir);
          gl_FragColor = vec4(bg, 1.0);
          return;
        }
        float tEnter = -bProj - sqrt(discr);
        pos = rayOrigin + rayDir * tEnter;
      }

      vec3 accumulatedColor = vec3(0.0);
      float accumulatedAlpha = 0.0;

      float rs = uRs; // Raio de Schwarzschild (~1.65)
      float rIn = uRin; // Raio interno do disco (ISCO ~4.25)
      float rOut = uRout; // Raio externo (~24.0)

      const int MAX_STEPS = 160;
      bool hitEventHorizon = false;
      float minDistance = 1000.0;

      for (int i = 0; i < MAX_STEPS; i++) {
        float r = length(pos);
        minDistance = min(minDistance, r);

        // 1. Horizonte de eventos (absorção total da luz)
        if (r <= rs * 1.04) {
          hitEventHorizon = true;
          break;
        }

        // 2. Se o raio escapou para fora da esfera do sistema
        if (r > R_BOUND && dot(pos, dir) > 0.0) {
          break;
        }

        // 3. Deflexão Gravitacional de Schwarzschild em Geodésica Nula
        // Momento angular orbital constante: L = pos x dir
        vec3 L = cross(pos, dir);
        float L2 = dot(L, L);
        vec3 accel = - (1.5 * rs * L2 / pow(r, 5.0)) * pos;

        // Passo adaptativo de alta precisão
        float stepSize = clamp(r * 0.055, 0.06, 0.85);
        dir = normalize(dir + accel * stepSize);

        vec3 prevPos = pos;
        pos += dir * stepSize;

        // 4. Interseção com o Plano do Disco de Acreção Equatorial (y = 0)
        // Ocorre tanto na frente (visão direta) quanto atrás (lente curvada sobre/sob a sombra)
        if (prevPos.y * pos.y <= 0.0) {
          float tPlane = prevPos.y / (prevPos.y - pos.y + 1e-6);
          vec3 hitP = mix(prevPos, pos, clamp(tPlane, 0.0, 1.0));
          float hitR = length(hitP.xz);

          if (hitR >= rIn && hitR <= rOut) {
            float phi = atan(hitP.z, hitP.x);

            // Velocidade orbital Kepleriana: omega(r) = sqrt(GM / r^3)
            float omega = 2.8 / pow(hitR, 1.25);
            float rotPhi = phi - uTime * omega;

            // Turbulência de plasma via FBM
            vec2 discCoord = vec2(rotPhi * 3.2, hitR * 0.95);
            float plasmaNoise = fbm(discCoord);
            
            // Grânulos e filamentos de matéria superaquecida em alta rotação (sofrem curvatura gravitacional!)
            float fineSparks = pow(fbm(discCoord * 3.5 + vec2(uTime * 1.2, 0.0)), 2.8) * 1.5;
            
            // Densidade radial suave nas bordas
            float radialDensity = smoothstep(rIn, rIn + 0.85, hitR) * (1.0 - smoothstep(rOut - 3.2, rOut, hitR));
            float density = (pow(plasmaNoise, 1.35) * 2.2 + fineSparks) * radialDensity;

            // Efeito Doppler Relativístico (Beaming)
            vec3 vPlasma = vec3(-sin(phi), 0.0, cos(phi));
            float beta = clamp(0.55 * sqrt(rIn / hitR), 0.0, 0.85); // Velocidade relativística v/c
            float cosTheta = dot(normalize(vPlasma), -dir);
            float gamma = 1.0 / sqrt(max(0.01, 1.0 - beta * beta));
            float doppler = 1.0 / (gamma * (1.0 - beta * cosTheta));
            float beaming = pow(doppler, 3.4);

            // Redshift gravitacional de Schwarzschild
            float gravRedshift = sqrt(max(0.01, 1.0 - rs / hitR));
            float totalShift = doppler * gravRedshift;

            // Gradiente de temperatura e cor
            float tempFactor = pow((rOut - hitR) / (rOut - rIn), 0.72);
            vec3 col = plasmaColor(tempFactor, totalShift) * density * beaming * 1.8;

            // Espessura e atenuação óptica por ângulo de incidência
            float cosIncidence = max(0.12, abs(dir.y));
            float optThickness = (0.24 + 0.02 * hitR) / cosIncidence;
            float sampleAlpha = clamp(1.0 - exp(-density * optThickness * 1.2), 0.0, 1.0);

            accumulatedColor += (1.0 - accumulatedAlpha) * col * sampleAlpha;
            accumulatedAlpha += (1.0 - accumulatedAlpha) * sampleAlpha;

            if (accumulatedAlpha > 0.985) break;
          }
        }

        // 5. Brilho coronal volumétrico contínuo (atmosfera ionizada ao redor do disco)
        float coronalR = length(pos.xz);
        if (coronalR >= rIn && coronalR <= rOut * 1.1) {
          float scaleHeight = 0.22 + 0.035 * coronalR;
          float hNorm = abs(pos.y) / scaleHeight;
          if (hNorm < 2.8) {
            float coronaDens = exp(-hNorm * hNorm * 1.8) * smoothstep(rIn, rIn + 1.2, coronalR) * (1.0 - smoothstep(rOut - 2.0, rOut * 1.1, coronalR)) * 0.08;
            float tempF = (rOut - coronalR) / (rOut - rIn);
            vec3 coronaCol = plasmaColor(tempF, 1.0) * coronaDens * stepSize;
            accumulatedColor += (1.0 - accumulatedAlpha) * coronaCol;
            accumulatedAlpha += (1.0 - accumulatedAlpha) * (coronaDens * stepSize * 0.75);
          }
        }
      }

      // 6. Anel de Fótons (Photon Ring) relativístico para raios que orbitam perto de r = 1.5 rs
      if (!hitEventHorizon && minDistance < rs * 2.4 && minDistance > rs * 1.05) {
        float ringDist = abs(minDistance - rs * 1.54);
        float ringIntensity = exp(-ringDist * ringDist * 16.0) * 1.8;
        vec3 ringCol = vec3(1.0, 0.94, 0.82) * ringIntensity;
        accumulatedColor += (1.0 - accumulatedAlpha) * ringCol;
        accumulatedAlpha += (1.0 - accumulatedAlpha) * clamp(ringIntensity, 0.0, 1.0);
      }

      // 7. Se o raio caiu no Horizonte de Eventos, o fundo é absorção total (preto absoluto)
      if (hitEventHorizon) {
        gl_FragColor = vec4(accumulatedColor, 1.0);
        return;
      }

      // 8. Fundo cósmico com deflexão gravitacional de Einstein
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
  const bhGeo = new THREE.SphereGeometry(120, 64, 64);
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

    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
  }
}
