// GAME MODE — jogo de exploração espacial no MESMO Sistema Solar da engine.
//
// O jogador nasce pilotando a nave nas proximidades da Terra e toda a
// navegação acontece voando: não existe câmera de observação, não existe
// troca de escala (o mundo é sempre a escala real) e não existem atalhos de
// planeta. A NavigationHud (o "GPS" da nave) permanece — ela faz parte da
// experiência de pilotagem, não do planetário.
//
// É AQUI que as futuras mecânicas de jogo entram (mineração, estações,
// combate, missões, upgrades...). O Exploration Mode fica congelado; este
// arquivo é o ponto de crescimento.

import * as THREE from "three";
import { createScene } from "../core/scene.js";
import { ShipFlight } from "../ui/shipFlight.js";
import { SpaceMarkerSystem } from "../ui/spaceMarkers.js";
import { NavigationHud } from "../ui/navigationHud.js";
import { ENTRY_OVERRIDES } from "../systems/asteroidConfig.js";
import { Shipwreck, createWreckCloud } from "../systems/shipwreck.js";
import { buildSolarSystem, createAmbientAudio } from "./world.js";

// Tempo quase parado, como ao pilotar no planetário: a translação orbital é
// anulada pela trava de referencial e a rotação fica lenta e apreciável.
const GAME_TIME_DAYS_PER_SEC = 1 / 600;
const START_BODY_ID = "earth"; // o jogador começa (e renasce) perto da Terra

export function startGameMode() {
  const { scene, camera, renderer, controls, glow } = createScene();
  controls.enabled = false; // não existe câmera de observação no jogo

  // Mundo compartilhado em escala real, sem linhas de órbita (são recurso de
  // "imaginação" do planetário — no jogo o espaço é o de verdade).
  const world = buildSolarSystem(scene, glow, { mode: "real", withOrbitLines: false });
  const { sun, bodies, bodyById, resolveBody, markerTargets, asteroids, encounter } = world;

  // GPS da nave: marcadores dos corpos (nomes, distâncias, setas de borda)
  const markerSystem = new SpaceMarkerSystem();
  markerSystem.setTargets(markerTargets);
  const navHud = new NavigationHud(camera, markerSystem);

  // Cemitério atrás de Júpiter (conteúdo SÓ do jogo): nuvem ~4× o cinturão
  // principal + cruzador destruído preso à órbita no meio dela. O marcador
  // "Sinal desconhecido" só entra no GPS quando o jogador chega perto.
  asteroids.addBelt(createWreckCloud());
  const wreck = new Shipwreck(scene, (id) => bodyById.get(id));
  let wreckMarked = false;

  const ship = new ShipFlight(scene, camera, controls, {
    canDisengage: false, // Esc abre o menu de pausa em vez de "sair" da nave
    onDestroyed: () => ship.engage(), // explodiu: renasce na aproximação da Terra
    getReferenceBody: () => resolveBody(START_BODY_ID),
    getBodies: () => bodyById.values(), // navegação, colisão e escala (todos os corpos)
    getEntryInfo: (id) => ENTRY_OVERRIDES[id],
  });
  ship.setEnabled(true);

  const audio = createAmbientAudio();
  audio.setEnabled(true);
  const _shipFwd = new THREE.Vector3(); // forward da nave (p/ os encontros)

  // dica de controles (mesma linguagem visual do planetário)
  const navHint = document.createElement("div");
  navHint.className = "nav-hint";
  navHint.innerHTML =
    "<b>W</b>/↑ acelera &nbsp;·&nbsp; <b>S</b>/↓ ré &nbsp;·&nbsp; <b>A/D</b> (←→) vira &nbsp;·&nbsp; <b>X</b> sobe &nbsp;·&nbsp; <b>Z</b> desce &nbsp;·&nbsp; <b>Q/E</b> rola &nbsp;·&nbsp; <b>Shift+W</b> turbo &nbsp;·&nbsp; <b>Esc</b> pausa";
  document.body.appendChild(navHint);

  // --- Pausa (Esc): Continuar / Menu principal --------------------------------
  let paused = false;
  const pauseOverlay = document.createElement("div");
  pauseOverlay.className = "modal-overlay";
  pauseOverlay.style.display = "none";
  pauseOverlay.innerHTML = `
    <div class="modal">
      <h3>Pausado</h3>
      <p>A nave fica parada no espaço enquanto você decide.</p>
      <div class="modal-row">
        <button class="modal-btn yes" data-act="resume">Continuar voando</button>
        <button class="modal-btn" data-act="menu">Menu principal</button>
      </div>
    </div>`;
  document.body.appendChild(pauseOverlay);

  function setPaused(on) {
    paused = on;
    pauseOverlay.style.display = on ? "" : "none";
    if (on) ship.keys.clear(); // solta as teclas: nada fica "preso" ao retomar
  }
  pauseOverlay.addEventListener("click", (e) => {
    const act = e.target?.dataset?.act;
    if (act === "resume") setPaused(false);
    if (act === "menu") location.reload(); // volta ao menu inicial
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") setPaused(!paused);
  });

  // --- Início: já pilotando perto da Terra ------------------------------------
  // Um passo de simulação em t=0 posiciona os corpos nas longitudes orbitais
  // corretas ANTES de engajar (o spawn da nave depende da posição da Terra).
  for (const b of bodies) b.update(0, 0, 0);
  ship.engage();

  // --- Loop --------------------------------------------------------------------
  let simDays = 0;
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05); // limita saltos (aba em segundo plano)

    if (!paused) {
      const dSim = dt * GAME_TIME_DAYS_PER_SEC;
      simDays += dSim;

      for (const b of bodies) b.update(simDays, dSim, dt);

      ship.update(dt);

      // GPS: some só durante a explosão (renasce junto com a nave)
      const flying = ship.isActive && !ship.exploding;
      navHud.setVisible(flying);
      navHud.update(dt);

      // Asteroides: mesma regra do voo no planetário — streaming ao redor da
      // nave, cinturões sempre visíveis, colisão só fora do supercruise.
      const supercruising = ship.velocity.length() > ship.boostSpeed * 1.5;
      const asteroidsActive = flying && !supercruising;
      asteroids.update(dt, {
        active: asteroidsActive || !ship.isActive,
        shipPos: flying ? ship.ship.position : camera.position,
        beltsVisible: true,
      });
      if (asteroidsActive) {
        const hit = asteroids.hitTest(ship.ship.position);
        if (hit) {
          asteroids.destroyAsteroid(hit.id); // remove o asteroide atingido junto com a nave
          ship.explode();
        }
      }

      // Cruzador destruído: segue Júpiter, lazy-load do GLB na aproximação e
      // colisão com o casco (mesma janela dos asteroides: nunca no supercruise)
      wreck.update(dt, flying ? ship.ship.position : camera.position);
      if (asteroidsActive && !ship.exploding && wreck.hitTest(ship.ship.position)) ship.explode();
      if (wreck.revealed && !wreckMarked) {
        markerSystem.add(wreck.markerTarget);
        wreckMarked = true;
      }

      // Encontros ocasionais em viagem: só no voo normal (nunca no supercruise)
      _shipFwd.set(0, 0, -1).applyQuaternion(ship.ship.quaternion);
      encounter.update(dt, {
        active: asteroidsActive,
        position: ship.ship.position,
        forward: _shipFwd,
        speed: ship.velocity.length(),
      });

      audio.update(camera, bodyById); // volume por proximidade

      // LOD por distância: textura detalhada só quando a câmera chega perto
      for (const b of bodies) b.updateDetail(camera.position, "real");

      // glow do Sol + pulso
      glow.scale.setScalar(sun.radius * 7);
      glow.material.opacity = 0.85 + Math.sin(performance.now() * 0.001) * 0.07;
    }

    renderer.render(scene, camera);

    if (!loadingHidden) {
      document.getElementById("loading")?.remove();
      loadingHidden = true;
    }
  }
  let loadingHidden = false;
  animate();
}
