// Setup da cena: renderer, câmera, controles (touch-friendly), iluminação que
// alcança todos os planetas e fundo estelar barato.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { radialGlowTexture, starDotTexture } from "./textures.js";

// --- Fundo estelar PRESO AO MUNDO (não à tela) -------------------------------
// scene.background com textura 2D é desenhado como um quad FIXO NA TELA: girar
// a câmera não movia as estrelas — pareciam coladas à nave e "na frente" dos
// objetos (dava enjoo). O domo é um céu de THREE.Points que segue a POSIÇÃO da
// câmera a cada frame (fundo no infinito: andar não gera paralaxe — correto),
// mas NÃO a rotação — virar o nariz move o céu como deve.
//
// Camadas de profundidade falsa (muitas fracas + poucas brilhantes) e cores de
// estrela reais (branco, azulada, alaranjada). Pipeline anti-"na frente":
// fila OPACA (transparent:false) + depthTest/Write off + renderOrder -1 =
// desenhadas ANTES de tudo; qualquer asteroide/planeta pinta por cima.
function makeStarDome() {
  const dome = new THREE.Group();
  const R = 1000; // sem depth e sem paralaxe o raio é indiferente; só não pode passar do far
  const layers = [
    { count: 2600, size: 1.6, bright: 0.5 }, // poeira fraca (maioria)
    { count: 700, size: 2.3, bright: 0.75 },
    { count: 130, size: 3.2, bright: 1 }, // destaques
  ];
  const sprite = starDotTexture();
  for (const { count, size, bright } of layers) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // ponto uniforme na esfera (z uniforme + ângulo)
      const z = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      pos[i * 3] = s * Math.cos(a) * R;
      pos[i * 3 + 1] = z * R;
      pos[i * 3 + 2] = s * Math.sin(a) * R;

      let r = 1, g = 1, b = 1; // branca
      const t = Math.random();
      if (t < 0.14) { r = 0.72; g = 0.84; } // azulada
      else if (t < 0.24) { g = 0.88; b = 0.7; } // alaranjada
      const v = bright * (0.5 + Math.random() * 0.5);
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
        map: sprite, size, sizeAttenuation: false, vertexColors: true,
        blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
      })
    );
    pts.renderOrder = -1;
    pts.frustumCulled = false; // metade do domo está sempre "atrás" da câmera
    // segue a posição da câmera ANTES do draw (onBeforeRender roda antes do
    // cálculo do modelViewMatrix) — funciona em qualquer modo, sem tocar nos loops
    pts.onBeforeRender = (renderer, sc, camera) => {
      pts.position.copy(camera.position);
      pts.updateMatrixWorld();
    };
    dome.add(pts);
  }
  return dome;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005); // mesmo tom de fundo da textura antiga
  scene.add(makeStarDome());

  // Faixa de distância enorme no modo real (Éris > 1,5 milhão de unidades, Voyagers > 3,8 milhões).
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.02,
    10_000_000
  );
  camera.position.set(0, 120, 320);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true, // evita z-fighting na faixa de escala gigante
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // limita o pixel ratio: protege GPU de tablets sem perder nitidez perceptível
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);

  // OrbitControls: arrastar = girar, pinça/scroll = zoom. Funciona no toque.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.05; // chega bem perto de luas minúsculas no modo real
  controls.maxDistance = 10_000_000;

  // --- Iluminação ---------------------------------------------------------
  // Luz pontual no Sol (origem). decay = 0 => não atenua com a distância, então
  // chega igual em Mercúrio e em Netuno (fisicamente o Sol cairia com 1/r²,
  // mas aí os externos ficariam pretos). É a escolha certa para um planetário.
  const sunLight = new THREE.PointLight(0xfff4e2, 3, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // luz ambiente fraca: o lado escuro não fica 100% preto, mas o contraste fica.
  scene.add(new THREE.AmbientLight(0x222230, 0.18));

  // --- Glow do Sol --------------------------------------------------------
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialGlowTexture("#ffdf99"),
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(glow);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, sunLight, glow };
}

// Cria a linha de uma órbita (LineLoop circular no plano XZ).
export function makeOrbitLine(radius, color = 0x4a5a7a) {
  const pts = [];
  const N = 128;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
  return new THREE.LineLoop(geo, mat);
}
