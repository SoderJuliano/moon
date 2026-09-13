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

    // Simplex 3D noise (Ashima Arts / Stefan Gustavson) - Ultra-rápido, suave e 100% contínuo
    vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      // Primeiro canto
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      // Outros cantos
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

      // Permutações
      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      // Gradientes
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);

      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);

      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);

      // Normalizar gradientes
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      // Mistura ponderada
      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    // FBM 3D contínuo com rotação decorrelacionada
    float fbm3D(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      mat3 rot = mat3(
        0.00,  0.80,  0.60,
       -0.80,  0.36, -0.48,
       -0.60, -0.48,  0.64
      );
      for (int i = 0; i < 3; i++) {
        v += a * (snoise(p) * 0.5 + 0.5);
        p = rot * p * 2.05 + vec3(1.2, 2.3, 3.4);
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

    // Campo de estrelas cósmicas procedurais em esfera 3D perfeita (sem costuras nos polos ou meridianos)
    vec3 getBackgroundStars(vec3 dir) {
      vec3 d = normalize(dir);
      float s1 = snoise(d * 48.0);
      float star = 0.0;
      if (s1 > 0.74) {
        star = pow((s1 - 0.74) / 0.26, 3.4) * 1.9;
      }
      float s2 = snoise(d * 125.0);
      if (s2 > 0.80) {
        star += pow((s2 - 0.80) / 0.20, 4.0) * 1.4;
      }

      // Brilho difuso galáctico ao redor do plano equatorial cósmico
      float galaxyGlow = pow(max(0.0, 1.0 - abs(d.y)), 5.0) * 0.05;
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

            // Coordenadas harmônicas 3D estritamente periódicas em rotPhi (2π)
            // Isso elimina 100% de qualquer costura, corte ou emenda no disco de acreção
            float spiral1 = rotPhi + 0.38 * hitR;
            vec3 coord1 = vec3(cos(spiral1) * 2.4, sin(spiral1) * 2.4, hitR * 0.72);

            float spiral2 = 2.0 * rotPhi - 0.55 * hitR + uTime * 0.25;
            vec3 coord2 = vec3(cos(spiral2) * 4.2, sin(spiral2) * 4.2, hitR * 1.35);

            float spiral3 = 4.0 * rotPhi + 0.85 * hitR - uTime * 0.45;
            vec3 coord3 = vec3(cos(spiral3) * 7.0, sin(spiral3) * 7.0, hitR * 2.5);

            float n1 = fbm3D(coord1);
            float n2 = fbm3D(coord2);
            float n3 = snoise(coord3) * 0.5 + 0.5;

            // Ondulações e anéis concêntricos finos gerados por cisalhamento diferencial
            float ringlets1 = sin(hitR * 5.2 + n1 * 3.2) * 0.5 + 0.5;
            float ringlets2 = sin(hitR * 11.5 + 2.0 * rotPhi) * 0.5 + 0.5;

            float plasmaNoise = n1 * 0.52 + n2 * 0.34 + ringlets1 * 0.14;
            float fineSparks = pow(n3, 3.2) * 2.2 * ringlets2;

            // Densidade radial suave nas bordas (fade in suave no ISCO e fade out suave no raio externo)
            float radialDensity = smoothstep(rIn, rIn + 0.85, hitR) * (1.0 - smoothstep(rOut - 3.2, rOut, hitR));
            float density = (pow(plasmaNoise, 1.35) * 2.3 + fineSparks) * radialDensity;

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
    <div class="vela-top-hud sgra-top-hud" id="sgra-info-card">
      <div class="vela-title-row">
        <span class="sgra-beacon-dot" aria-hidden="true"></span>
        <h1 class="vela-title">${t("sgra.title") || "SAGITÁRIO A*"}</h1>
        <button type="button" class="vela-close-btn" id="sgra-close-btn" aria-label="Fechar informações" title="Fechar informações (H / I)">✕</button>
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
    <button type="button" class="vela-reopen-btn sgra-reopen-btn" id="sgra-reopen-btn" aria-label="Mostrar informações" title="Mostrar informações (H / I)">ⓘ</button>
    <div class="vela-fade-layer"></div>
  `;
  document.body.appendChild(overlay);

  const infoCard = overlay.querySelector("#sgra-info-card");
  const closeBtn = overlay.querySelector("#sgra-close-btn");
  const reopenBtn = overlay.querySelector("#sgra-reopen-btn");

  function setInfoCardVisible(visible) {
    if (infoCard && reopenBtn) {
      if (visible) {
        infoCard.classList.remove("hidden");
        reopenBtn.classList.remove("show");
      } else {
        infoCard.classList.add("hidden");
        reopenBtn.classList.add("show");
      }
    }
  }

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setInfoCardVisible(false);
  });

  reopenBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setInfoCardVisible(true);
  });

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
    } else if (e.key === "h" || e.key === "H" || e.key === "i" || e.key === "I") {
      const isHidden = infoCard?.classList.contains("hidden");
      setInfoCardVisible(isHidden);
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
