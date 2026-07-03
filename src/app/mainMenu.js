// MENU INICIAL — a porta de entrada dos dois modos.
//
// Não é um menu tradicional: é uma cena. A Via Láctea (galáxia espiral
// procedural) ocupa a tela vista de cima, girando devagar e contínuo — com um
// marcador acompanhando o braço onde fica o nosso Sistema Solar. Clicar no
// marcador abre um painel minimalista para escolher a experiência:
// Exploration (planetário) ou Game (pilotar a nave).
//
// Morfologia calcada nas ilustrações reais da Via Láctea: o disco é uma NUVEM
// contínua e difusa (azul-acinzentada) que esvai suave na borda; o núcleo é um
// grande brilho quente/rosado dominando o centro; os braços espirais são
// SUTIS — regiões mais claras da nuvem, bem enroladas, não fitas separadas —
// e por cima vai um granulado fino de estrelas.
//
// A cena do menu tem renderer próprio e é totalmente descartada ao escolher
// um modo — o modo escolhido cria a própria cena via createScene().

import * as THREE from "three";
import { radialGlowTexture, starfieldTexture } from "../core/textures.js";

const GALAXY_RADIUS = 100;
const ARMS = 4; // como nas ilustrações da Via Láctea (2 maiores + 2 menores)
const WRAPS = 5.8; // enrolamento do centro à borda (~330° — bem enrolado)
const SPIN_RATE = 0.018; // rad/s — giro calmo, mas perceptível (volta em ~6 min)
const SUN_ARM = 0;
const SUN_R = 0.55 * GALAXY_RADIUS; // ~26 mil anos-luz do centro (braço de Órion)

// ângulo do eixo de um braço no raio r (enrola mais rápido perto do centro)
function armAngle(arm, r) {
  return (arm / ARMS) * Math.PI * 2 + Math.pow(r / GALAXY_RADIUS, 0.8) * WRAPS;
}
function armPoint(arm, r) {
  const a = armAngle(arm, r);
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

function makeRng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// gradiente de cor do disco: centro quente/rosado → meio pálido → borda azul
const C_CORE = new THREE.Color("#ffddc2");
const C_MID = new THREE.Color("#c0c2e0");
const C_EDGE = new THREE.Color("#7c9ada");
function diskColor(t, out) {
  if (t < 0.35) out.copy(C_CORE).lerp(C_MID, t / 0.35);
  else out.copy(C_MID).lerp(C_EDGE, (t - 0.35) / 0.65);
  return out;
}

// Sorteia um ponto do disco. Retorna o quão "dentro de um braço" ele caiu
// (0..1) — braços são só regiões MAIS CLARAS da mesma nuvem, então isso vira
// modulação de brilho, não estrutura separada.
function sampleDisk(rand, gauss, p) {
  const r = rand() * GALAXY_RADIUS; // uniforme em r ⇒ denso no centro, raro na borda
  let armBoost = 0;
  let a;
  if (rand() < 0.45) {
    // braços LARGOS e difusos: são só ondulações de brilho na nuvem,
    // nunca fitas separadas (a maior parte do disco é preenchimento)
    const arm = (rand() * ARMS) | 0;
    const jitter = gauss() * (0.22 + 0.24 * (r / GALAXY_RADIUS));
    a = armAngle(arm, r) + jitter;
    armBoost = Math.max(0, 1 - Math.abs(jitter) * 1.7);
  } else {
    a = rand() * Math.PI * 2; // preenchimento entre braços (disco contínuo)
  }
  const rr = Math.max(0, r + gauss() * (2 + r * 0.05));
  // disco fino, engrossando de leve rumo ao bojo
  const y = gauss() * (1.2 + 3.5 * Math.max(0, 1 - r / 18));
  p.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
  return armBoost;
}

// borda esvaindo suave (nada de disco "recortado") + brilho geral caindo do
// centro pra fora, como nas fotos (metade interna do disco é bem mais clara)
function edgeFade(t) {
  const k = THREE.MathUtils.clamp((t - 0.6) / 0.4, 0, 1);
  return (1 - k * k * 0.9) * (0.55 + 0.45 * (1 - t));
}

// Granulado de estrelas: bojo denso + disco inteiro, brilho puxado pelos braços
function buildStars(count, seed) {
  const rand = makeRng(seed);
  const gauss = () => rand() + rand() + rand() - 1.5; // ~normal, ±1.5

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const knot = new THREE.Color("#dcebff");

  for (let i = 0; i < count; i++) {
    let armBoost = 0;
    if (rand() < 0.24) {
      // bojo: elipsoide achatado, denso e quente
      const r = Math.abs(gauss()) * 13;
      const a = rand() * Math.PI * 2;
      p.set(Math.cos(a) * r, gauss() * Math.max(1.2, 4.5 - r * 0.2), Math.sin(a) * r);
    } else {
      armBoost = sampleDisk(rand, gauss, p);
    }
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    const t = Math.min(Math.hypot(p.x, p.z) / GALAXY_RADIUS, 1);
    diskColor(t, c);
    let bright = (0.34 + 0.42 * armBoost + rand() * 0.28) * edgeFade(t);
    if (t < 0.28) bright += (1 - t / 0.28) * 0.5; // bojo mais luminoso
    if (armBoost > 0.6 && rand() < 0.07) {
      c.lerp(knot, 0.7); // nós azulados de formação estelar nos braços
      bright = 1.1;
    }
    colors[i * 3] = c.r * bright;
    colors[i * 3 + 1] = c.g * bright;
    colors[i * 3 + 2] = c.b * bright;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// Nuvem difusa: pontos grandes com sprite radial e cor por vértice — é ela que
// faz o disco parecer uma névoa luminosa contínua, e não pontos soltos.
function buildCloud(count, seed, size, opacity) {
  const rand = makeRng(seed);
  const gauss = () => rand() + rand() + rand() - 1.5;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const armBoost = sampleDisk(rand, gauss, p);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    const t = Math.min(Math.hypot(p.x, p.z) / GALAXY_RADIUS, 1);
    diskColor(t, c);
    let bright = (0.5 + 0.5 * armBoost) * edgeFade(t);
    if (t < 0.3) bright += (1 - t / 0.3) * 0.3; // clareia rumo ao núcleo
    colors[i * 3] = c.r * bright;
    colors[i * 3 + 1] = c.g * bright;
    colors[i * 3 + 2] = c.b * bright;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: radialGlowTexture("#ffffff"),
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function makeGlowSprite(color, scale, opacity) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialGlowTexture(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity,
    })
  );
  s.scale.setScalar(scale);
  return s;
}

export function startMainMenu({ onSelect }) {
  // --- cena própria do menu -------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = starfieldTexture(42);

  // vista de cima, com leve inclinação (como nas ilustrações — dá profundidade)
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 150, 124);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  document.body.appendChild(renderer.domElement);

  const spinner = new THREE.Group();
  scene.add(spinner);

  const stars = buildStars(45000, 1234);
  const cloudFine = buildCloud(4600, 5678, 6.5, 0.13); // névoa "de perto"
  const cloudSoft = buildCloud(2600, 8765, 14, 0.07); // véu largo por baixo
  spinner.add(stars, cloudFine, cloudSoft);

  // núcleo: um grande brilho quente em camadas dominando o centro (como nas
  // fotos, ele toma ~1/3 do diâmetro) + um véu azulado cobrindo o disco todo
  const diskGlow = makeGlowSprite("#a9bce0", 185, 0.1);
  const coreOuter = makeGlowSprite("#f2d4bc", 115, 0.32);
  const coreMid = makeGlowSprite("#ffe4c8", 58, 0.6);
  const coreInner = makeGlowSprite("#fff3e0", 20, 0.9);
  spinner.add(diskGlow, coreOuter, coreMid, coreInner);

  // âncora invisível na posição do Sistema Solar (gira junto com a galáxia)
  const sunAnchor = new THREE.Object3D();
  sunAnchor.position.copy(armPoint(SUN_ARM, SUN_R));
  sunAnchor.position.y = 0.6;
  spinner.add(sunAnchor);

  // --- overlay DOM ------------------------------------------------------------
  const root = document.createElement("div");
  root.className = "mm-root";
  root.innerHTML = `
    <div class="mm-title">Milky Way</div>
    <button class="mm-marker" type="button">
      <span class="mm-marker-ring"><span class="mm-marker-dot"></span></span>
      <span class="mm-marker-label">Solar System</span>
    </button>
    <div class="mm-panel" hidden>
      <div class="mm-panel-title">Solar System</div>
      <div class="mm-panel-sub">Choose your experience</div>
      <button class="mm-option" type="button" data-mode="exploration">
        <span class="mm-option-name">Exploration</span>
        <span class="mm-option-desc">Observe the Solar System in realistic scale.</span>
      </button>
      <button class="mm-option" type="button" data-mode="game">
        <span class="mm-option-name">Game</span>
        <span class="mm-option-desc">Pilot a spaceship through the Solar System.</span>
      </button>
    </div>
    <div class="mm-fade"></div>`;
  document.body.appendChild(root);

  const marker = root.querySelector(".mm-marker");
  const panel = root.querySelector(".mm-panel");
  const fade = root.querySelector(".mm-fade");

  marker.addEventListener("click", () => {
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("open"));
  });
  // clicar fora do painel (no espaço) fecha
  renderer.domElement.addEventListener("click", () => {
    panel.classList.remove("open");
    setTimeout(() => (panel.hidden = true), 250);
  });

  let choosing = false;
  for (const btn of root.querySelectorAll(".mm-option")) {
    btn.addEventListener("click", () => {
      if (choosing) return;
      choosing = true;
      fade.classList.add("on"); // escurece a galáxia antes de trocar de cena
      setTimeout(() => {
        dispose();
        // recoloca a tela de carregamento — o modo a remove no primeiro frame
        const loading = document.createElement("div");
        loading.id = "loading";
        loading.className = "loading";
        loading.textContent = "Carregando o sistema solar…";
        document.body.appendChild(loading);
        onSelect(btn.dataset.mode);
      }, 700);
    });
  }

  // --- loop -------------------------------------------------------------------
  const clock = new THREE.Clock();
  const _v = new THREE.Vector3();
  let raf = 0;
  let loadingHidden = false;

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    spinner.rotation.y += SPIN_RATE * dt; // rotação contínua e calma
    coreMid.material.opacity = 0.76 + Math.sin(performance.now() * 0.0008) * 0.06;

    // o marcador acompanha o braço: projeta a âncora 3D para a tela
    sunAnchor.getWorldPosition(_v).project(camera);
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (0.5 - _v.y * 0.5) * window.innerHeight;
    marker.style.transform = `translate(${x}px, ${y}px)`;

    renderer.render(scene, camera);

    if (!loadingHidden) {
      document.getElementById("loading")?.remove();
      loadingHidden = true;
    }
  }
  animate();

  function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    for (const pts of [stars, cloudFine, cloudSoft]) {
      pts.geometry.dispose();
      pts.material.map?.dispose();
      pts.material.dispose();
    }
    for (const s of [diskGlow, coreOuter, coreMid, coreInner]) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    scene.background?.dispose?.();
    renderer.dispose();
    renderer.domElement.remove();
    root.remove();
  }
}
