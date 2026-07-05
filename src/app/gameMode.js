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
import { WreckMission } from "../systems/wreckMission.js";
import { PlasmaCannon } from "../systems/plasmaCannon.js";
import { SatelliteSystem } from "../systems/satellites.js";
import { DeepSpaceMusic } from "../ui/spaceMusic.js";
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

  // Canhão de plasma: nasce DESABILITADO — a missão do sinal de socorro é quem
  // desbloqueia (a tecnologia é recuperada do cruzador destruído).
  const cannon = new PlasmaCannon(scene, ship, asteroids, camera, {
    getBodies: () => bodyById.values(),
  });

  // Satélites na órbita baixa da Terra: invisíveis de longe, aparecem quando a
  // Terra está gigante na tela (lazy-load do modelo na primeira aproximação —
  // como o jogo começa na Terra, na prática carregam já no spawn). Caem com
  // 2 tiros do canhão.
  const satellites = new SatelliteSystem(scene, () => bodyById.get(START_BODY_ID));
  cannon.addTargetSystem(satellites);

  // Primeira missão: investigar o sinal de socorro perto de Júpiter
  const mission = new WreckMission({
    wreck,
    camera,
    onUnlock: () => {
      cannon.setEnabled(true);
      // o atalho novo entra na seção Teclado do menu de pausa
      keyList.insertAdjacentHTML(
        "beforeend",
        '<div><span class="key">Espaço</span> dispara o canhão</div>'
      );
    },
  });
  // trava a nave no referencial do DESTROÇO durante a investigação (o casco
  // acompanha Júpiter; sem isso ele derivaria devagar pra longe da cena parada)
  const _holdPrev = new THREE.Vector3();
  let _holding = false;

  const audio = createAmbientAudio();
  audio.setEnabled(true);
  // Trilha deep-space lofi (SÓ do jogo): entra junto com a cena, no mesmo
  // AudioContext do ambiente, e SILENCIA quando alguma vibração de corpo
  // (Júpiter/Saturno/Sol) sobe — o fenômeno tem prioridade sobre a música.
  const music = new DeepSpaceMusic(() => audio.ctx);
  const _shipFwd = new THREE.Vector3(); // forward da nave (p/ os encontros)

  // --- Pausa (Esc): Continuar / Menu principal + teclado -----------------------
  // Os comandos da nave vivem AQUI (seção "Teclado"), não num quadro flutuante:
  // a tela de voo fica limpa pra HUD/missão e o jogador consulta no Esc.
  let paused = false;
  const pauseOverlay = document.createElement("div");
  pauseOverlay.className = "modal-overlay";
  pauseOverlay.style.display = "none";
  pauseOverlay.innerHTML = `
    <div class="modal">
      <h3>Pausado</h3>
      <p>A nave fica parada no espaço enquanto você decide.</p>
      <div class="key-list">
        <div><span class="key">W</span>/<span class="key">↑</span> acelera</div>
        <div><span class="key">S</span>/<span class="key">↓</span> ré</div>
        <div><span class="key">A</span><span class="key">D</span> (←→) vira</div>
        <div><span class="key">X</span> sobe o nariz</div>
        <div><span class="key">Z</span> desce o nariz</div>
        <div><span class="key">Q</span><span class="key">E</span> rolagem</div>
        <div><span class="key">Shift</span>+<span class="key">W</span> supercruise</div>
        <div><span class="key">Esc</span> pausa</div>
      </div>
      <div class="modal-row">
        <button class="modal-btn yes" data-act="resume">Continuar voando</button>
        <button class="modal-btn" data-act="menu">Menu principal</button>
      </div>
    </div>`;
  document.body.appendChild(pauseOverlay);
  const keyList = pauseOverlay.querySelector(".key-list");

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

      // Investigação em curso: a nave fica PARADA (física congelada) e colada
      // ao referencial do destroço — a cena não deriva durante os textos.
      if (mission.holdShip) {
        if (!_holding) {
          _holding = true;
          ship.velocity.set(0, 0, 0);
          ship.speed = 0;
          ship.keys.clear();
          _holdPrev.copy(wreck.group.position);
        } else {
          const shiftD = wreck.group.position.clone().sub(_holdPrev);
          ship.ship.position.add(shiftD);
          camera.position.add(shiftD);
          _holdPrev.copy(wreck.group.position);
        }
      } else {
        _holding = false;
        ship.update(dt);
      }

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

      // Satélites da Terra: só existem de perto (o próprio sistema decide
      // mostrar/esconder pela distância ao raio atual da Terra)
      satellites.update(dt, flying ? ship.ship.position : camera.position);

      // Missão do sinal de socorro (banner/chip/botão Investigar/história)
      mission.update(dt, { shipPos: ship.ship.position, flying });

      // Canhão de plasma: atira só no voo normal (nunca no supercruise, nunca
      // com a nave parada na investigação); os bolts/fumaça animam sempre
      cannon.update(dt, { canFire: asteroidsActive && !mission.holdShip });

      // Encontros ocasionais em viagem: só no voo normal (nunca no supercruise)
      _shipFwd.set(0, 0, -1).applyQuaternion(ship.ship.quaternion);
      encounter.update(dt, {
        active: asteroidsActive,
        position: ship.ship.position,
        forward: _shipFwd,
        speed: ship.velocity.length(),
      });

      audio.update(camera, bodyById); // volume por proximidade
      music.update(audio.proximityLevel); // trilha cede espaço às vibrações

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
