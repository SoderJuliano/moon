// Planetário do Sistema Solar — orquestração geral.
//
// Monta a cena, constrói cada corpo a partir do seu arquivo em bodies/, liga a
// HUD (modos Fantasia/Real, panorâmica, velocidade), o menu de miniaturas e a
// direção de câmera. Pensado para rodar leve em qualquer dispositivo.

import * as THREE from "three";
import { createScene, makeOrbitLine } from "./core/scene.js";
import { createBody, attachMoon } from "./core/body.js";
import { createSunFlares } from "./core/sunFlares.js";
import { orbitRadius } from "./core/scales.js";
import { simDate } from "./core/ephemeris.js";
import { SUN, ORBITERS, MOONS } from "./bodies/index.js";
import { CameraRig } from "./ui/cameraRig.js";
import { ShipFlight } from "./ui/shipFlight.js";
import { SpaceAudio } from "./ui/spaceAudio.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";

let mode = "fantasy"; // padrão pedido: modo imaginação/fantasia

const { scene, camera, renderer, controls, glow } = createScene();
const rig = new CameraRig(camera, controls);
// nave (modo real): voo em 3ª pessoa travado no referencial do planeta focado
const ship = new ShipFlight(scene, camera, controls, {
  onEngage: () => {
    rig.stopFollow();
    menu.setVisible(false); // esconde miniaturas enquanto pilota
    hud.setVisible(false); // velocidade/modo não fazem sentido pilotando
    // desacelera o tempo pra quase parar — planeta apreciável de pertinho
    if (savedDaysPerSecond === null) savedDaysPerSecond = daysPerSecond;
    daysPerSecond = SHIP_TIME_DAYS_PER_SEC;
  },
  onDisengage: () => {
    menu.setVisible(true);
    hud.setVisible(true);
    if (savedDaysPerSecond !== null) {
      daysPerSecond = savedDaysPerSecond;
      savedDaysPerSecond = null;
    }
  },
  onDestroyed: () => {
    // explodiu: volta para a tela inicial (visão geral do Sol)
    if (savedDaysPerSecond !== null) {
      daysPerSecond = savedDaysPerSecond;
      savedDaysPerSecond = null;
    }
    menu.setVisible(true);
    hud.setVisible(true);
    selectedId = "sun";
    menu.highlight("sun");
    rig.flyToBody(sun, 6);
  },
  onEarthApproach: () => showEarthDialog(),
  getReferenceBody: () => (selectedId ? bodyById.get(selectedId) : null),
  getBodies: () => bodyById.values(), // mira de distância (Sol/planetas/luas)
  getSun: () => sun, // colisão com o Sol mesmo voando preso a outro planeta
});

// som ambiente por proximidade (só no modo real)
const audio = new SpaceAudio();
// som sintetizado (sem mp3): ruído grave filtrado + sub-grave por corpo
audio.add("jupiter", { type: "lowpass", freq: 170, q: 0.9, sub: 52, subGain: 0.5 }, 90, 22000);
audio.add("saturn", { type: "bandpass", freq: 420, q: 1.4, sub: 70, subGain: 0.3 }, 80, 20000);

// --- Constrói os corpos ----------------------------------------------------
const bodyById = new Map();

// Sol na origem
const sun = createBody(SUN, mode);
scene.add(sun.orbitGroup);
bodyById.set(sun.id, sun);
glow.position.set(0, 0, 0);
glow.scale.setScalar(sun.radius * 7);
const sunFlares = createSunFlares(scene); // labaredas procedurais na borda do Sol

// Planetas + anões e suas linhas de órbita
const orbitLines = []; // { line, aAU }
const bodies = [sun];
for (const desc of ORBITERS) {
  const body = createBody(desc, mode);
  scene.add(body.orbitGroup);
  bodyById.set(body.id, body);
  bodies.push(body);

  const line = makeOrbitLine(orbitRadius(desc.aAU, mode));
  scene.add(line);
  orbitLines.push({ line, aAU: desc.aAU });

  // luas (por ora só a da Terra)
  const moons = MOONS[desc.id];
  if (moons) {
    for (const md of moons) {
      const moon = attachMoon(body, md, mode);
      bodyById.set(moon.id, moon);
    }
  }
}

function setOrbitLineRadius(line, r) {
  const pos = line.geometry.attributes.position;
  const N = pos.count;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    pos.setXYZ(i, Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  pos.needsUpdate = true;
}

// linhas de órbita só no modo Fantasia (trajetórias "de imaginação")
function refreshOrbitLineVisibility() {
  const show = mode === "fantasy";
  for (const { line } of orbitLines) line.visible = show;
}
refreshOrbitLineVisibility();

// --- HUD e Menu ------------------------------------------------------------
let transitionTimer = 0; // s restantes de animação de troca de modo
let panoramic = false;
let daysPerSecond = 8; // velocidade do tempo (definida pela HUD)
// Ao pilotar a nave, o tempo desacelera pra quase parado: a translação orbital
// já é anulada pela trava de referencial, e isto congela a rotação/luas/fundo,
// deixando o planeta apreciável de pertinho. Restaura ao sair da nave.
const SHIP_TIME_DAYS_PER_SEC = 1 / 600; // ~10 min reais por volta da Terra (giro lento e apreciável)
let savedDaysPerSecond = null;

const hud = createHud({
  initialMode: mode,
  onModeChange: (m) => {
    mode = m;
    for (const b of bodies) b.applyMode(mode, false); // animado
    transitionTimer = 1.6;
    refreshOrbitLineVisibility();
    hud.setPanoramicAvailable(mode === "fantasy");
    hud.setNavHint(mode === "real");
    audio.setEnabled(mode === "real");
    ship.setEnabled(mode === "real");
    if (mode === "real" && panoramic) {
      // panorâmica não existe no modo real: volta para o foco atual
      panoramic = false;
      if (selectedId) rig.flyToBody(bodyById.get(selectedId), selectedId === "sun" ? 6 : 4);
      else rig.flyToBody(sun, 6);
    } else if (panoramic) {
      goPanoramic(); // recalcula altura para a nova escala (fantasia)
    }
  },
  onPanoramic: (active) => {
    panoramic = active;
    if (active) goPanoramic();
    else if (selectedId) rig.flyToBody(bodyById.get(selectedId));
    else rig.flyToBody(sun, 6);
  },
  onSpeedChange: (v) => {
    // pilotando: o tempo fica travado lento; guarda o valor pra restaurar ao sair
    if (savedDaysPerSecond !== null) savedDaysPerSecond = v;
    else daysPerSecond = v;
  },
});

let selectedId = null;
const menu = createMenu({
  onSelect: (id) => {
    selectedId = id;
    panoramic = false;
    hud.setPanoramic(false);
    ship.disengage(); // sair da nave ao focar um planeta
    const body = bodyById.get(id);
    if (body) rig.flyToBody(body, id === "sun" ? 6 : 4);
  },
});

function outermostRadius() {
  let max = 0;
  for (const { aAU } of orbitLines) max = Math.max(max, orbitRadius(aAU, mode));
  return max;
}

function goPanoramic() {
  rig.flyToPanoramic(outermostRadius() * 1.15);
}

// Janelinha ao se aproximar da Terra com a nave: oferece "entrar em órbita"
// (redireciona ao Google Earth). A barreira da nave mantém o jogador fora.
let earthDialog = null;
function showEarthDialog() {
  if (earthDialog) {
    earthDialog.style.display = "flex";
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal";
  box.innerHTML =
    "<h3>Entrar em órbita da Terra?</h3>" +
    "<p>Você chegou pertinho da Terra. Quer ver de perto no Google Earth?</p>";
  const row = document.createElement("div");
  row.className = "modal-row";
  const yes = document.createElement("button");
  yes.className = "modal-btn yes";
  yes.textContent = "Sim, abrir Google Earth";
  const no = document.createElement("button");
  no.className = "modal-btn";
  no.textContent = "Não, continuar voando";
  yes.addEventListener("click", () => {
    window.open("https://earth.google.com/web/", "_blank");
    overlay.style.display = "none";
  });
  no.addEventListener("click", () => (overlay.style.display = "none"));
  row.append(yes, no);
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  earthDialog = overlay;
}

// --- Loop ------------------------------------------------------------------
let simDays = 0;
const clock = new THREE.Clock();
let dateAccumulator = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // limita saltos (aba em segundo plano)

  const dSim = dt * daysPerSecond; // dias simulados decorridos neste frame
  simDays += dSim;

  for (const b of bodies) b.update(simDays, dSim, dt);

  // durante a troca de modo, as linhas de órbita acompanham a distância animada
  if (transitionTimer > 0) {
    transitionTimer -= dt;
    for (const { line, aAU } of orbitLines) {
      // acompanha o pivot real do corpo correspondente
      const body = bodies.find((b) => b.descriptor && b.descriptor.aAU === aAU);
      setOrbitLineRadius(line, body ? body.pivot.position.x : orbitRadius(aAU, mode));
    }
  }

  if (!rig.isTweening) ship.update(dt); // nave (modo real)
  rig.update(dt);
  if (!rig.isTweening && !ship.isActive) controls.update();

  audio.update(camera, bodyById); // volume por proximidade (modo real)

  // LOD por distância: textura detalhada (NASA/2k) só quando a câmera chega perto
  for (const b of bodies) b.updateDetail(camera.position, mode);

  // glow do Sol acompanha o tamanho atual (muda entre fantasia e real) + pulso
  glow.scale.setScalar(sun.radius * 7);
  glow.material.opacity = 0.85 + Math.sin(performance.now() * 0.001) * 0.07;
  // labaredas do Sol: mais intensas quando a câmera está perto
  const sunDist = camera.position.length(); // Sol está na origem
  const flareIntensity = THREE.MathUtils.clamp(1.4 - sunDist / (sun.radius * 12), 0.25, 1);
  sunFlares.update(dt, sun.radius, flareIntensity);

  // atualiza a data ~4x por segundo
  dateAccumulator += dt;
  if (dateAccumulator > 0.25) {
    hud.setDate(simDate(simDays));
    dateAccumulator = 0;
  }

  renderer.render(scene, camera);

  if (!loadingHidden) {
    document.getElementById("loading")?.remove();
    loadingHidden = true;
  }
}
let loadingHidden = false;
animate();
