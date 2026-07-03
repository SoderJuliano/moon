// Planetário do Sistema Solar — orquestração geral.
//
// Monta a cena, constrói cada corpo a partir do seu arquivo em bodies/, liga a
// HUD (modos Fantasia/Real, panorâmica, velocidade), o menu de miniaturas e a
// direção de câmera. Pensado para rodar leve em qualquer dispositivo.

import * as THREE from "three";
import { createScene, makeOrbitLine } from "./core/scene.js";
import { createBody, attachMoon } from "./core/body.js";
import { orbitRadius } from "./core/scales.js";
import { simDate } from "./core/ephemeris.js";
import { SUN, ORBITERS, MOONS } from "./bodies/index.js";
import { CameraRig } from "./ui/cameraRig.js";
import { ShipFlight } from "./ui/shipFlight.js";
import { SpaceMarkerSystem } from "./ui/spaceMarkers.js";
import { NavigationHud } from "./ui/navigationHud.js";
import { createAsteroidSystem, createRegionBodies, ENTRY_OVERRIDES } from "./systems/asteroidConfig.js";
import { SpaceAudio } from "./ui/spaceAudio.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";

let mode = "fantasy"; // padrão pedido: modo imaginação/fantasia

const { scene, camera, renderer, controls, glow } = createScene();
const rig = new CameraRig(camera, controls);
// Navegação espacial (desacoplada do voo): a lógica de projeção/relevância vive
// no SpaceMarkerSystem; a NavigationHud só desenha. Alvos definidos após montar
// os corpos. No futuro: estações, naves, waypoints, objetivos de missão.
const markerSystem = new SpaceMarkerSystem();
const navHud = new NavigationHud(camera, markerSystem);
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
  getReferenceBody: () => (selectedId ? resolveBody(selectedId) : null),
  getBodies: () => bodyById.values(), // navegação, colisão e escala (todos os corpos)
  // entrada alinhada ao cinturão quando há um no caminho (atravessa antes de chegar)
  getEntryInfo: (id) => ENTRY_OVERRIDES[id],
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

// Regiões de asteroides como "corpos virtuais": clicáveis no menu, marcadores
// de navegação e referência da nave. FORA de bodyById de propósito (sem colisão
// de corpo, sem áudio, sem LOD — asteroides têm colisão própria via hitTest).
const regionById = new Map(createRegionBodies((id) => bodyById.get(id)).map((r) => [r.id, r]));

function resolveBody(id) {
  return bodyById.get(id) || regionById.get(id);
}

// Alvos de navegação: todo corpo vira um marcador (Sol, planetas, anões, luas,
// regiões de asteroides). Interface { id, name, color, kind, getWorldPosition }.
markerSystem.setTargets(
  [...bodyById.values(), ...regionById.values()].map((b) => ({
    id: b.id,
    name: b.name,
    color: b.descriptor?.menuColor || "#cdd6e6",
    kind: b.descriptor?.type || "planet",
    getWorldPosition: (v) => b.worldPosition(v),
  }))
);

// Asteroides (sistema independente): regiões reais do Sistema Solar (cinturão
// principal, troianos, NEOs, Kuiper...) + encontros ocasionais em viagem.
// Streaming/pooling próprios; colidir = reusa o fluxo de explosão da nave (abaixo).
const { asteroids, encounter } = createAsteroidSystem(
  scene,
  (id) => bodyById.get(id),
  () => bodyById.values()
);
const _shipFwd = new THREE.Vector3(); // forward da nave (p/ os encontros)

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
      rig.flyToBody(selectedId ? bodyById.get(selectedId) : sun, selectedId === "sun" ? 6 : 4);
    } else if (panoramic) {
      goPanoramic(); // recalcula altura para a nova escala (fantasia)
    }
  },
  onPanoramic: (active) => {
    panoramic = active;
    if (active) goPanoramic();
    else rig.flyToBody(selectedId ? bodyById.get(selectedId) : sun, selectedId === "sun" ? 6 : 4);
  },
  onSpeedChange: (v) => {
    // pilotando: o tempo fica travado lento; guarda o valor pra restaurar ao sair
    if (savedDaysPerSecond !== null) savedDaysPerSecond = v;
    else daysPerSecond = v;
  },
});

let selectedId = "sun";
const menu = createMenu({
  onSelect: (id) => {
    selectedId = id;
    panoramic = false;
    hud.setPanoramic(false);
    ship.disengage(); // sair da nave ao focar um planeta
    const body = resolveBody(id);
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

  // HUD de navegação: marcadores dos corpos enquanto pilota (some na explosão)
  const flying = ship.isActive && !ship.exploding;
  navHud.setVisible(flying);
  navHud.update(dt);

  // Asteroides: campos esparsos fazem streaming ao redor da NAVE em voo e da
  // CÂMERA fora dele; o cinturão instanciado fica sempre de pé no modo real
  // (visível até no supercruise — colisão é que só vale no voo normal).
  const supercruising = ship.velocity.length() > ship.boostSpeed * 1.5;
  const asteroidsActive = flying && !supercruising;
  asteroids.update(dt, {
    active: asteroidsActive || !ship.isActive,
    shipPos: flying ? ship.ship.position : camera.position,
    beltsVisible: mode === "real",
  });
  if (asteroidsActive) {
    const hit = asteroids.hitTest(ship.ship.position);
    if (hit) {
      asteroids.destroyAsteroid(hit.id); // remove o asteroide atingido junto com a nave
      ship.explode();
    }
  }

  // Encontros ocasionais em viagem: só no voo normal (nunca no supercruise)
  _shipFwd.set(0, 0, -1).applyQuaternion(ship.ship.quaternion);
  encounter.update(dt, {
    active: asteroidsActive,
    position: ship.ship.position,
    forward: _shipFwd,
    speed: ship.velocity.length(),
  });

  audio.update(camera, bodyById); // volume por proximidade (modo real)

  // LOD por distância: textura detalhada (NASA/2k) só quando a câmera chega perto
  for (const b of bodies) b.updateDetail(camera.position, mode);

  // glow do Sol acompanha o tamanho atual (muda entre fantasia e real) + pulso
  glow.scale.setScalar(sun.radius * 7);
  glow.material.opacity = 0.85 + Math.sin(performance.now() * 0.001) * 0.07;

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

// hook de debug TEMPORÁRIO (investigação do spawn em Urano) — remover depois
window.__dbg = (id) => {
  const b = resolveBody(id);
  const p = new THREE.Vector3();
  if (b) b.worldPosition(p);
  return {
    body: b ? { pos: p.toArray().map((v) => +v.toFixed(1)), radius: +b.radius.toFixed(2), approachRadius: +b.approachRadius.toFixed(2) } : null,
    ship: { pos: ship.ship.position.toArray().map((v) => +v.toFixed(1)), active: ship.active, exploding: ship.exploding, intro: !!ship.intro },
    cam: camera.position.toArray().map((v) => +v.toFixed(1)),
    tweening: rig.isTweening,
    distShip: b ? +ship.ship.position.distanceTo(p).toFixed(1) : null,
    distCam: b ? +camera.position.distanceTo(p).toFixed(1) : null,
  };
};
