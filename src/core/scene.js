// Setup da cena: renderer, câmera, controles (touch-friendly), iluminação que
// alcança todos os planetas e fundo estelar barato.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { radialGlowTexture, starfieldTexture } from "./textures.js";

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = starfieldTexture();

  // Faixa de distância enorme no modo real (Éris > 1,5 milhão de unidades).
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.02,
    3_000_000
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
  controls.maxDistance = 2_500_000;

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
