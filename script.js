import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

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
document.body.appendChild(renderer.domElement);

// Controles FPS
const controls = new PointerLockControls(camera, document.body);
document.addEventListener('click', () => controls.lock());

const velocity = new THREE.Vector3();
const move = { forward: false, backward: false, left: false, right: false };

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyS') move.forward = true;
  if (e.code === 'KeyW') move.backward = true;
  if (e.code === 'KeyA') move.left = true;
  if (e.code === 'KeyD') move.right = true;
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyS') move.forward = false;
  if (e.code === 'KeyW') move.backward = false;
  if (e.code === 'KeyA') move.left = false;
  if (e.code === 'KeyD') move.right = false;
});

// Luz do Sol
const sunLight = new THREE.PointLight(0xffffff, 20000);
sunLight.position.set(300, 0, 0);
scene.add(sunLight);

// Texturas
const textureLoader = new THREE.TextureLoader();
const earthTexture = textureLoader.load('earth.jpg');
const moonTexture = textureLoader.load('moon.jpg');
const sunTexture = textureLoader.load('sun2.jpg');
const glowTexture = textureLoader.load('glow.png');

// Terra
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(10, 64, 64),
  new THREE.MeshStandardMaterial({ map: earthTexture })
);
earth.position.set(0, 0, 0);
scene.add(earth);

// Grupo para Lua orbitar
const moonOrbit = new THREE.Object3D();
scene.add(moonOrbit);

// Lua (escala aproximada 1:3,67)
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(2.7, 64, 64),
  new THREE.MeshStandardMaterial({ map: moonTexture })
);
moon.position.set(30, 0, 0); // 30 unidades de distância da Terra
moonOrbit.add(moon);

// Luz ambiente
const ambientLight = new THREE.AmbientLight(0x111111);
scene.add(ambientLight);

// Sol
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(15, 64, 64),
  new THREE.MeshBasicMaterial({
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
glowSprite.scale.set(1000, 1000, 1);
sun.add(glowSprite);

sun.position.copy(sunLight.position);
scene.add(sun);

// Animação
let pulse = 0;
function animate() {
  requestAnimationFrame(animate);

  // Movimento WASD
  const speed = 1;
  if (move.forward) velocity.z = -speed;
  else if (move.backward) velocity.z = speed;
  else velocity.z = 0;

  if (move.left) velocity.x = -speed;
  else if (move.right) velocity.x = speed;
  else velocity.x = 0;

  controls.moveRight(velocity.x);
  controls.moveForward(velocity.z);

  // Pulso do Sol
  pulse += 0.5;
  sun.material.emissiveIntensity = 2 + Math.sin(pulse) * 0.5;

  // Rotação da Terra
  earth.rotation.y += 0.002;

  // Órbita da Lua
  moonOrbit.rotation.y += 0.001; // velocidade da órbita
  moon.rotation.y += 0.002; // rotação da própria Lua

  sun.rotation.y += 0.0005;

  renderer.render(scene, camera);
}
animate();

// Responsividade
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
