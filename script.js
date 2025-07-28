import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  Lensflare,
  LensflareElement,
} from "three/examples/jsm/objects/Lensflare.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Câmera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);
camera.position.set(0, 0, 150);

// Renderizador
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Controles FPS
const controls = new PointerLockControls(camera, document.body);
document.addEventListener("click", () => controls.lock());

// Movimentação
const velocity = new THREE.Vector3();
const move = { forward: false, backward: false, left: false, right: false };
let isShift = false;

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyS") move.forward = true;
  if (e.code === "KeyW") move.backward = true;
  if (e.code === "KeyA") move.left = true;
  if (e.code === "KeyD") move.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") isShift = true;
});
document.addEventListener("keyup", (e) => {
  if (e.code === "KeyS") move.forward = false;
  if (e.code === "KeyW") move.backward = false;
  if (e.code === "KeyA") move.left = false;
  if (e.code === "KeyD") move.right = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") isShift = false;
});

// Loader de Textura (colocar antes do uso)
const textureLoader = new THREE.TextureLoader();

// ---- Sol e Lens Flare ----
const sunLight = new THREE.PointLight(0xffffff, 200000, 0, 2);
sunLight.castShadow = true;
sunLight.position.set(1000, 0, 0);
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;

// Textura do flare
const lensTexture = textureLoader.load("lensflare0.png");

// Criar lensflare
const lensflare = new Lensflare();
lensflare.addElement(new LensflareElement(lensTexture, 20000, 0)); // central
lensflare.addElement(new LensflareElement(lensTexture, 128, 0.6)); // menor deslocado
lensflare.addElement(new LensflareElement(lensTexture, 256, 1));
lensflare.addElement(new LensflareElement(lensTexture, 1000, 0)); // tamanho/brilho
sunLight.add(lensflare);

scene.add(sunLight);

// ---- Texturas Planetas ----
const earthTexture = textureLoader.load("earth.jpg");
const moonTexture = textureLoader.load("moon.jpg");
const sunTexture = textureLoader.load("sun2.jpg");
const glowTexture = textureLoader.load("glow.png");

// Grupo para órbita da Terra
const earthOrbit = new THREE.Object3D();
scene.add(earthOrbit);

// Terra
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(10, 64, 64),
  new THREE.MeshStandardMaterial({ map: earthTexture })
);
earth.position.set(1000, 0, 0);
earth.receiveShadow = true;
earthOrbit.add(earth);

// Grupo para órbita da Lua (orbitando a Terra)
const moonOrbit = new THREE.Object3D();
earth.add(moonOrbit);

// Lua
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(2.7, 64, 64),
  new THREE.MeshStandardMaterial({ map: moonTexture })
);
moon.position.set(38, 0, 0);
moon.castShadow = true;
moon.receiveShadow = true;
moonOrbit.add(moon);

// Luz ambiente
scene.add(new THREE.AmbientLight(0x111111));

// Sol físico
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(100, 64, 64),
  new THREE.MeshStandardMaterial({
    map: sunTexture,
    emissive: 0xffffee,
    emissiveIntensity: 5,
  })
);

// Glow do Sol
const glowMaterial = new THREE.SpriteMaterial({
  map: glowTexture,
  color: 0xffffaa,
  transparent: true,
  blending: THREE.AdditiveBlending,
});
const glowSprite = new THREE.Sprite(glowMaterial);
glowSprite.scale.set(2000, 2000, 1);
sun.add(glowSprite);

sun.position.copy(sunLight.position);
scene.add(sun);

// ---- Animação ----
let pulse = 0;
let moonAngle = 0;

function animate() {
  requestAnimationFrame(animate);

  // Movimento FPS
  const baseSpeed = 1;
  const speed = isShift ? baseSpeed * 2 : baseSpeed;
  velocity.z = move.forward ? -speed : move.backward ? speed : 0;
  velocity.x = move.left ? -speed : move.right ? speed : 0;

  controls.moveRight(velocity.x);
  controls.moveForward(velocity.z);

  // Pulso do Sol
  pulse += 0.5;
  sun.material.emissiveIntensity = 2 + Math.sin(pulse) * 0.5;

  // Rotação da Terra e órbita
  earth.rotation.y += 0.002;
  earthOrbit.rotation.y += 0.0005;

  // Rotação da Lua
  moonOrbit.rotation.y += 0.001;

  renderer.render(scene, camera);
}
animate();

// Responsividade
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Zoom com scroll
const minFov = 20;
const maxFov = 100;
window.addEventListener("wheel", (event) => {
  camera.fov += event.deltaY > 0 ? 2 : -2;
  camera.fov = THREE.MathUtils.clamp(camera.fov, minFov, maxFov);
  camera.updateProjectionMatrix();
});
