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
import { SpaceStation } from "../systems/spaceStation.js";
import { DeepSpaceMusic } from "../ui/spaceMusic.js";
import { createTouchControls } from "../ui/touchControls.js";
import { SaveManager, createPlayerSave } from "../game/saveManager.js";
import { addPlayer } from "../game/players.js";
import { AchievementSystem } from "../game/achievementSystem.js";
import { emit, on } from "../game/events.js";
import { DiscoveryPopup } from "../ui/discoveryPopup.js";
import { setSfxPaused } from "../ui/sfx.js";
import { CombatEncounter } from "../combat/combatMode.js";
import { CombatMusic } from "../combat/combatMusic.js";
import { FleetEncounter } from "../combat/fleetEncounter.js";
import { BossMusic } from "../combat/bossMusic.js";
import { playCannonShot, setBattleSfxPaused } from "../combat/battleSfx.js";
import { PlayerShield } from "../systems/playerShield.js";
import { MissionManager, MISSION } from "../missions/missionManager.js";
import { createStrangeObjectsMission } from "../missions/strangeObjects.js";
import { createSpaceRocksMission, createRockChores } from "../missions/spaceRocks.js";
import { createNeptuneIncident } from "../missions/neptuneIncident.js";
import { createGhostSignalMission, createTwinsMission, createDebrisChore } from "../missions/bossArc.js";
import { ScannerSystem } from "../systems/scanner.js";
import { AchievementsScreen } from "../ui/achievementsScreen.js";
import { buildSolarSystem, createAmbientAudio } from "./world.js";

// Tempo quase parado, como ao pilotar no planetário: a translação orbital é
// anulada pela trava de referencial e a rotação fica lenta e apreciável.
const GAME_TIME_DAYS_PER_SEC = 1 / 600;
const START_BODY_ID = "earth"; // o jogador começa (e renasce) perto da Terra
const EARTH_RADIUS_KM = 6371; // 1 unidade de mundo = 1 raio terrestre

// resume: true = Continuar (carrega o save); false = Novo Jogo (save limpo);
// "auto" (padrão/?mode=game) = carrega se existir, senão cria — nunca apaga.
// playerName: jogador nomeado (save local próprio + sync na nuvem). Sem nome
// cai no save legado sem nome (compatibilidade com atalho ?mode=game).
export function startGameMode({ resume = "auto", playerName = null, playerPassword = null } = {}) {
  window.isGameMode = true;
  const { scene, camera, renderer, controls, glow } = createScene();
  controls.enabled = false; // não existe câmera de observação no jogo

  // Mundo compartilhado em escala real, sem linhas de órbita (são recurso de
  // "imaginação" do planetário — no jogo o espaço é o de verdade).
  const world = buildSolarSystem(scene, glow, { mode: "real", withOrbitLines: false });
  const { sun, bodies, bodyById, regionById, resolveBody, markerTargets, asteroids, encounter } = world;

  // GPS da nave: marcadores dos corpos (nomes, distâncias, setas de borda).
  // SEM os clusters de asteroides (kind "region"): eles são descobertos
  // naturalmente explorando — só Sol/planetas/luas/destinos importantes no HUD.
  const markerSystem = new SpaceMarkerSystem();
  markerSystem.setTargets(markerTargets.filter((t) => t.kind !== "region"));
  const navHud = new NavigationHud(camera, markerSystem);

  // --- Progressão: save + conquistas + descobertas -----------------------------
  // jogador nomeado → save próprio + nuvem; sem nome → legado local
  const saveManager = playerName ? createPlayerSave(playerName) : new SaveManager();
  if (resume === false) saveManager.newGame();
  else if (!saveManager.load()) saveManager.newGame();
  const save = saveManager.data;
  if (playerName) {
    save.player.name = playerName;
    if (playerPassword) {
      save.player.password = playerPassword;
      saveManager.saveNow();
    }
    addPlayer(playerName); // garante que aparece na lista "Continuar"
    // (a nuvem já nasce gated em createPlayerSave; liberada após o setup)
  }
  const stats = save.statistics;
  const isResume = resume !== false && !!save.ship.position; // já voou antes?
  let refBodyId = save.ship.referenceBodyId || START_BODY_ID;
  let simDays = save.world.simDays || 0;

  const popup = new DiscoveryPopup();
  const achievements = new AchievementSystem({ save: saveManager, popup });
  const achScreen = new AchievementsScreen({ save: saveManager, catalog: achievements.catalog });

  // Cemitério atrás de Júpiter (conteúdo SÓ do jogo): nuvem ~4× o cinturão
  // principal + cruzador destruído preso à órbita no meio dela. O marcador
  // "Sinal desconhecido" só entra no GPS quando o jogador chega perto.
  asteroids.addBelt(createWreckCloud());
  const wreck = new Shipwreck(scene, (id) => bodyById.get(id));
  let wreckMarked = false;

  const ship = new ShipFlight(scene, camera, controls, {
    canDisengage: false, // Esc abre o menu de pausa em vez de "sair" da nave
    onDestroyed: () => {
      emit("milestone", { id: "first-collision" });
      emit("stat", { key: "collisions" });
      ship.engage(); // explodiu: renasce na aproximação do planeta atual
    },
    getReferenceBody: () => resolveBody(refBodyId),
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

  // ISS orbitando a Terra (numa casca abaixo da rede — nunca colide com ela):
  // só renderiza de perto, destrutível com 3 tiros.
  const station = new SpaceStation(scene, () => bodyById.get(START_BODY_ID));
  cannon.addTargetSystem(station);

  // --- Combate PvE (pacote apartado em src/combat/) ----------------------------
  // 30s depois de instalar o canhão, um portal negro rasga o espaço e a nave
  // alien ataca. Enquanto o combate está ativo o GPS some e o ambiente é
  // abafado (o gameMode só consulta combat.active — o resto vive no pacote).
  let combatCountdown = -1;
  let strangeAvailTimer = -1; // 1 min após a 1ª vitória → libera a secundária
  const combat = new CombatEncounter(scene, camera, ship, {
    onEnd: (result) => {
      if (result === "victory") {
        emit("stat", { key: "enemyShipsDestroyed" }); // contador de naves abatidas
        if (!save.flags.alienDefeated) {
          save.flags.alienDefeated = true; // 1ª vez: conquista + destrava secundária
          emit("milestone", { id: "alien-defeated" });
          strangeAvailTimer = 60;
        }
      }
      saveManager.saveNow(); // vitória/fuga/derrota: persiste (local + nuvem)
    },
  });
  cannon.addTargetSystem(combat.alien); // nossos bolts acertam a nave alien

  // --- Arco dos Gêmeos: escudo do jogador + encontros de FROTA -----------------
  // O escudo (troféu da boss fight) absorve tiros inimigos quando equipado.
  const playerShield = new PlayerShield(scene, save, () => ship.ship);
  // FleetEncounter roda a invasão de treino (3 batedores) e a boss fight (os
  // dois cruzadores capitais). Mesmo contrato do combate: GPS some, ambiente
  // abafado, música própria (batida comum na invasão, TEMA DE BOSS nos Gêmeos).
  const fleet = new FleetEncounter(scene, camera, ship, {
    shield: playerShield,
    renderer, // pré-compila shaders/texturas dos bosses no preload
    onEnd: () => saveManager.saveNow(), // resultado sempre persiste
  });
  cannon.addTargetSystem(fleet); // um só sistema de alvo pra frota inteira
  // sons de batalha (exceção autorizada): o canhão só SOA nos encontros épicos
  cannon.sfxShot = () => {
    if (fleet.active) playCannonShot();
  };

  // Scanner de objetos espaciais (recompensa do "Reboque espacial"): tipa as
  // rochas quando equipado e ligado (G / botão do meio).
  const scanner = new ScannerSystem(save, () => asteroids, () => ship.ship, camera);

  // --- Engine de missões + secundárias ----------------------------------------
  const strange = createStrangeObjectsMission(scene);
  cannon.addTargetSystem(strange.sat); // 2 tiros destroem o objeto
  const spaceRocks = createSpaceRocksMission(scene);
  const missions = new MissionManager({
    scene, camera, ship, cannon, markers: markerSystem,
    bodyById, combat, station, asteroids, scanner, save, saveManager, emit,
    wreck, fleet, shieldItem: playerShield, // arco dos Gêmeos
  });
  const rockChores = createRockChores(scene); // série secundária (Ferro, Gelo)
  const neptune = createNeptuneIncident(scene); // ramo do satélite destruído
  cannon.addTargetSystem(neptune.swarm); // 5 tiros por slime
  missions.register(strange);
  missions.register(spaceRocks);
  missions.register(neptune);
  for (const c of rockChores) missions.register(c);
  // ARCO DOS GÊMEOS: escaneia o cruzador → invasão de treino → boss fight
  missions.register(createGhostSignalMission());
  missions.register(createTwinsMission());
  missions.register(createDebrisChore(scene));

  // já derrotou a 1ª nave num save anterior? a secundária já pode aparecer
  if (save.flags.alienDefeated && missions.status("strange-objects") === MISSION.LOCKED) {
    missions.makeAvailable("strange-objects");
  }
  // entregou o satélite alien? libera o Reboque espacial (dá o scanner).
  on("milestone", ({ id }) => {
    if (id === "alien-tech-home") missions.makeAvailable("space-rocks");
  });
  // RETOMADA: reabre a etapa correta da cadeia conforme o que já foi concluído
  const done = (id) => missions.status(id) === MISSION.COMPLETED;
  const locked = (id) => missions.status(id) === MISSION.LOCKED;
  if (done("strange-objects") && locked("space-rocks") && !done("space-rocks")) missions.makeAvailable("space-rocks");
  if (done("space-rocks") && locked("sec-ferro") && !done("sec-ferro")) missions.makeAvailable("sec-ferro");
  if (done("sec-ferro") && locked("sec-gelo") && !done("sec-gelo")) missions.makeAvailable("sec-gelo");
  // arco dos Gêmeos: o scanner (de qualquer via) abre o "Eco no Cemitério"
  if (save.inventory.scanner?.owned && locked("ghost-signal")) missions.makeAvailable("ghost-signal");
  const _scanGrant = scanner.grant.bind(scanner);
  scanner.grant = () => {
    _scanGrant();
    missions.makeAvailable("ghost-signal"); // no-op se já saiu de LOCKED
  };
  if (done("ghost-signal") && locked("twins")) missions.makeAvailable("twins");
  if (done("twins") && locked("sec-destrocos") && save.flags.debrisPos && !save.flags.debrisTowed) {
    missions.makeAvailable("sec-destrocos");
  }
  // troféu ganho mas ainda não instalado (fechou o jogo antes)? reoferece
  if (save.inventory.shield?.owned && !save.inventory.shield.equipped) playerShield.grant();

  // COMBATE: botão esquerdo do mouse também dispara (Espaço continua valendo).
  // Só sobre o canvas — clicar em botões/menus não pode soltar rajada.
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 && (combat.active || fleet.active) && e.target?.tagName === "CANVAS") cannon._fireHeld = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) cannon._fireHeld = false;
  });
  // SCANNER: liga/desliga com o botão do MEIO do mouse (sobre o canvas)…
  window.addEventListener("mousedown", (e) => {
    if (e.button === 1 && e.target?.tagName === "CANVAS") {
      e.preventDefault();
      scanner.toggle();
    }
  });
  // …ou com a tecla G
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyG" && e.target?.tagName !== "INPUT") scanner.toggle();
  });

  // Primeira missão: investigar o sinal de socorro perto de Júpiter
  const mission = new WreckMission({
    wreck,
    camera,
    onUnlock: () => {
      cannon.setEnabled(true);
      save.ship.weapons.plasmaCannon = true; // antes do emit: o marco auto-salva
      emit("milestone", { id: "weapon-unlocked" });
      combatCountdown = 30; // …e 30s depois, a emboscada alien
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
  const combatMusic = new CombatMusic(() => audio.ctx); // batida do PvE (entra/sai com o combate)
  const bossMusic = new BossMusic(() => audio.ctx); // TEMA DE BOSS (só na luta dos Gêmeos)
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
      <div class="pause-missions"></div>
      <label class="setting-row">
        <input type="checkbox" data-setting="showSecondaryHud" />
        Mostrar missões secundárias no HUD
      </label>
      <div class="pause-stats"></div>
      <div class="modal-row">
        <button class="modal-btn yes" data-act="resume">Continuar voando</button>
        <button class="modal-btn" data-act="achievements">Conquistas</button>
        <button class="modal-btn" data-act="menu">Menu principal</button>
      </div>
    </div>`;
  document.body.appendChild(pauseOverlay);
  const keyList = pauseOverlay.querySelector(".key-list");
  const statsBox = pauseOverlay.querySelector(".pause-stats");
  const missBox = pauseOverlay.querySelector(".pause-missions");
  const secToggle = pauseOverlay.querySelector('[data-setting="showSecondaryHud"]');
  secToggle.addEventListener("change", () => {
    save.settings = save.settings || {};
    save.settings.showSecondaryHud = secToggle.checked;
    missions.refreshHud(); // reflete na hora o chip secundário
    saveManager.saveNow();
  });

  // progresso das missões ATIVAS/DISPONÍVEIS (primárias e secundárias)
  function renderMissions() {
    const list = missions.progressList();
    if (!list.length) {
      missBox.innerHTML = "";
      return;
    }
    const rows = list
      .map((m) => {
        const tag = m.kind === "secondary" ? "SEC" : "PRINCIPAL";
        if (m.status === "available") {
          // disponível: dá pra aceitar aqui mesmo (caso tenha clicado "Agora não")
          return `<div class="pmiss ${m.kind === "secondary" ? "sec" : ""}">
            <span>${m.title} — <em>disponível</em></span>
            <button class="modal-btn pmiss-accept" data-accept="${m.id}">Aceitar</button></div>`;
        }
        return `<div class="pmiss ${m.kind === "secondary" ? "sec" : ""}"><span>${m.objective || m.title}</span><span class="tag">${tag}</span></div>`;
      })
      .join("");
    missBox.innerHTML = `<div class="pause-stats-title">Missões</div>${rows}`;
    for (const btn of missBox.querySelectorAll(".pmiss-accept")) {
      btn.addEventListener("click", () => {
        missions.start(btn.dataset.accept);
        renderMissions(); // reflete na hora (some o "Aceitar")
      });
    }
  }

  // painel de ESTATÍSTICAS do jogador (montado a cada pausa, com números vivos)
  function renderStats() {
    const s = stats;
    const prestige = Math.round(save.prestige || 0);
    const row = (label, val) => `<div class="pstat"><span>${label}</span><b>${val}</b></div>`;
    statsBox.innerHTML =
      `<div class="pause-stats-title">Estatísticas</div>` +
      row("Naves inimigas destruídas", s.enemyShipsDestroyed || 0) +
      row("Km percorridos", Math.round(s.distanceKm || 0).toLocaleString("pt-BR")) +
      row("Asteroides destruídos", s.asteroidsDestroyed || 0) +
      row("Satélites destruídos", s.satellitesDestroyed || 0) +
      row("Objetos estranhos rebocados", s.strangeObjectsTowed || 0) +
      row("Tempo de voo", `${Math.floor((s.timePlayedS || 0) / 60)} min`) +
      `<div class="pstat"><span>Prestígio (planeta natal)</span><b>${prestige}%</b></div>` +
      `<div class="prestige-track"><div class="prestige-fill" style="width:${prestige}%"></div></div>`;
  }

  function setPaused(on) {
    paused = on;
    pauseOverlay.style.display = on ? "" : "none";
    if (on) {
      ship.keys.clear(); // solta as teclas: nada fica "preso" ao retomar
      renderMissions();
      secToggle.checked = save.settings?.showSecondaryHud !== false;
      renderStats(); // estatísticas atualizadas a cada abertura da pausa
    }
    // pausa/retoma TODO o áudio de uma vez: drones dos planetas, sonificação
    // do Sol e trilha lofi compartilham o MESMO AudioContext — suspender o
    // contexto congela tudo (e o resume volta exatamente de onde parou)
    if (audio.ctx) {
      const p = on ? audio.ctx.suspend() : audio.ctx.resume();
      p.catch(() => {});
    }
    setSfxPaused(on); // contexto dos efeitos de interface (jingle) idem
    setBattleSfxPaused(on); // sons de batalha (canhões/ronco) congelam junto
  }
  pauseOverlay.addEventListener("click", (e) => {
    const act = e.target?.dataset?.act;
    if (act === "resume") setPaused(false);
    if (act === "achievements") achScreen.open();
    if (act === "menu") {
      saveManager.saveNow(); // não perde nada ao sair pro menu
      location.reload();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape") return;
    if (achScreen.isOpen) achScreen.close(); // Esc fecha conquistas primeiro
    else setPaused(!paused);
  });

  // CONTINUAR: a arma volta instalada sem refazer a missão do destroço
  if (isResume && save.ship.weapons.plasmaCannon) {
    cannon.setEnabled(true);
    mission.skipToDone();
    keyList.insertAdjacentHTML(
      "beforeend",
      '<div><span class="key">Espaço</span> dispara o canhão</div>'
    );
    // a nave alien insiste a cada sessão até ser derrotada de vez
    if (!save.flags?.alienDefeated) combatCountdown = 30;
  }

  // --- Snapshot do estado vivo pro save (gancho do SaveManager) ----------------
  // Fotografa nave/mundo ANTES de cada escrita — o SaveManager não conhece nada
  // disso; só chama o gancho. "Planeta atual" = corpo mais próximo da nave.
  const _snap = new THREE.Vector3();
  saveManager.onBeforeSave = (d) => {
    d.ship.position = ship.ship.position.toArray();
    d.ship.quaternion = ship.ship.quaternion.toArray();
    d.ship.velocity = ship.velocity.toArray();
    d.ship.speed = ship.speed;
    d.ship.weapons.plasmaCannon = cannon.enabled;
    let nearest = refBodyId;
    let best = Infinity;
    for (const b of bodyById.values()) {
      const dist = b.worldPosition(_snap).distanceTo(ship.ship.position) - b.radius;
      if (dist < best) {
        best = dist;
        nearest = b.id;
      }
    }
    d.ship.referenceBodyId = nearest;
    d.world.simDays = simDays;
  };
  window.addEventListener("beforeunload", () => {
    saveManager.saveNow(); // local
    saveManager.syncUpBeacon(); // nuvem (keepalive sobrevive ao fechar a aba)
  });

  // Controles touch (celular/tablet, tela deitada). Em desktop retorna null e
  // nada é criado — teclado/mouse seguem sendo o input. Os botões disparam
  // eventos de teclado sintéticos, então nenhum sistema de voo/combate muda.
  createTouchControls();

  // --- Início ------------------------------------------------------------------
  // Um passo de simulação posiciona os corpos nas longitudes orbitais corretas
  // ANTES de engajar (simDays vem do save no Continuar — planetas no lugar).
  for (const b of bodies) b.update(simDays, 0, 0);
  ship.engage();

  // CONTINUAR: a nave reaparece EXATAMENTE onde estava (posição, rotação,
  // velocidade) — o engage acima só prepara o voo (escala/gravidade/HUD).
  if (isResume) {
    ship.ship.position.fromArray(save.ship.position);
    ship.ship.quaternion.fromArray(save.ship.quaternion);
    ship.velocity.fromArray(save.ship.velocity || [0, 0, 0]);
    ship.speed = save.ship.speed || 0;
    ship.intro = null; // sem tween cinematográfico: já estamos "no meio do voo"
    // câmera direto atrás da nave (o chase assume no primeiro frame)
    _shipFwd.set(0, 0, -1).applyQuaternion(ship.ship.quaternion);
    camera.position.copy(ship.ship.position).addScaledVector(_shipFwd, -0.35);
    camera.position.y += 0.12;
    camera.lookAt(ship.ship.position);
  }

  // Setup completo (nome + snapshot da nave prontos): libera a nuvem e envia
  // agora — regra "tem local, ainda não tem na nuvem? então sobe ao entrar".
  if (playerName) {
    saveManager._cloudReady = true;
    saveManager.saveNow(); // grava local com o snapshot atual e espelha na nuvem
  }

  // --- Loop --------------------------------------------------------------------
  const clock = new THREE.Clock();
  let visitTimer = 0; // detecção de descobertas é barata, mas 2×/s basta
  let scWasOn = false;

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

      // GPS: some durante a explosão E durante o combate (em combate a única
      // seta de navegação é o marcador vermelho do inimigo)
      const flying = ship.isActive && !ship.exploding;
      const anyCombatBefore = combat.active || fleet.active;
      navHud.setVisible(flying && !anyCombatBefore);
      navHud.update(dt);

      // Combate PvE: contagem da emboscada + estado dos encontros (o 1v1 do
      // alien e a FROTA — invasão/boss — nunca rodam ao mesmo tempo: a frota
      // só é disparada pelas missões fora de combate)
      if (combatCountdown > 0 && flying && !mission.holdShip && !fleet.active) {
        combatCountdown -= dt;
        if (combatCountdown <= 0) combat.trigger();
      }
      combat.update(dt);
      fleet.update(dt);
      const anyCombat = combat.active || fleet.active;
      if (anyCombat !== anyCombatBefore) {
        audio.setDucked(anyCombat); // abafa/devolve as vibrações dos corpos
        // música por encontro: batida comum (alien 1v1 e invasão) vs TEMA DE
        // BOSS (os Gêmeos) — só um toca por vez
        combatMusic.setActive(combat.active || (fleet.active && fleet.mode === "invasion"));
        bossMusic.setActive(fleet.active && fleet.mode === "boss");
      }
      combatMusic.update();
      bossMusic.update();
      playerShield.update(dt, { inCombat: anyCombat }); // pips + recarga + bolha

      // Missões: libera a secundária 1 min após a 1ª vitória; depois roda a
      // missão ativa (satélite alien, marcador, rebocar…). Pausa no combate.
      if (strangeAvailTimer > 0 && flying && !anyCombat) {
        strangeAvailTimer -= dt;
        if (strangeAvailTimer <= 0) missions.makeAvailable("strange-objects");
      }
      if (flying && !anyCombat && !mission.holdShip) missions.update(dt);

      // Ajuste inteligente do distanciamento da câmera ao rebocar objetos grandes (evita que a câmera entre na rocha)
      let cameraBackTarget = 0.5;
      let cameraUpTarget = 0.12;
      if (flying) {
        const activeSec = missions._activeSecondary;
        const activePri = missions._activePrimary;
        let activeTow = null;
        if (activeSec && activeSec.tow && activeSec.tow.payload) {
          activeTow = activeSec.tow;
        } else if (activePri && activePri.tow && activePri.tow.payload) {
          activeTow = activePri.tow;
        }

        if (activeTow) {
          cameraBackTarget = 0.5 + activeTow.payloadRadius * 2.0;
          cameraUpTarget = 0.12 + activeTow.payloadRadius * 0.5;
        } else if (activePri && activePri.id === "strange-objects" && activePri.towing) {
          // A missão de Saturno ("strange-objects") tem escala grande, usamos estimativa de raio 0.25
          cameraBackTarget = 0.5 + 0.25 * 2.0;
          cameraUpTarget = 0.12 + 0.25 * 0.5;
        }
      }
      // Interpolação suave para transições perfeitas
      ship.trailBack += (cameraBackTarget - ship.trailBack) * Math.min(1, dt * 5);
      ship.trailUp += (cameraUpTarget - ship.trailUp) * Math.min(1, dt * 5);

      if (flying && !anyCombat) scanner.update(); // rótulo de composição das rochas

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
      station.update(dt, flying ? ship.ship.position : camera.position);

      // Auto-lock assistente de mira para a ISS ao se aproximar dela
      if (flying && station.alive && station.holder && station.group.visible) {
        const issPos = station.holder.position;
        const shipPos = ship.ship.position;
        const dStation = shipPos.distanceTo(issPos);
        if (dStation < 16 && !ship.objectLock) {
          const toStation = new THREE.Vector3().copy(issPos).sub(shipPos);
          const forward = new THREE.Vector3().set(0, 0, -1).applyQuaternion(ship.ship.quaternion);
          const dot = toStation.normalize().dot(forward);
          if (dot > 0.5) {
            ship.setObjectLock?.({
              active: true,
              minDot: 0,
              maxDistance: 22,
              breakSecs: 2,
              getWorldPosition: (out) => {
                if (station.holder) return out.copy(station.holder.position);
                return out.set(0, 0, 0);
              }
            });
          }
        }
      }

      // Missão do sinal de socorro (banner/chip/botão Investigar/história)
      mission.update(dt, { shipPos: ship.ship.position, flying });

      // Canhão de plasma: atira só no voo normal (nunca no supercruise, nunca
      // com a nave parada na investigação); os bolts/fumaça animam sempre
      cannon.update(dt, { canFire: asteroidsActive && !mission.holdShip && !combat.holdShip && !fleet.holdShip });

      // Encontros ocasionais em viagem: só no voo normal (nunca no supercruise)
      _shipFwd.set(0, 0, -1).applyQuaternion(ship.ship.quaternion);
      encounter.update(dt, {
        active: asteroidsActive,
        position: ship.ship.position,
        forward: _shipFwd,
        speed: ship.velocity.length(),
      });

      audio.update(camera, bodyById); // volume por proximidade
      // trilha ambiente cede espaço às vibrações — e SILENCIA no combate
      // (prioridade: música PvE > ambiente/vibrações; efeitos de UI no topo)
      music.update(anyCombat ? 1 : audio.proximityLevel);

      // --- Progressão: estatísticas + descobertas + auto-save -----------------
      stats.timePlayedS += dt;
      if (flying) {
        stats.distanceKm += ship.velocity.length() * dt * EARTH_RADIUS_KM;
        if (supercruising) {
          stats.supercruiseS += dt;
          if (!scWasOn) emit("milestone", { id: "first-supercruise" });
        }
        scWasOn = supercruising;
      }
      visitTimer += dt;
      if (flying && visitTimer >= 0.5) {
        visitTimer = 0;
        // corpos: "visitado" quando a nave chega na zona de aproximação
        // (6× o raio ATUAL — acompanha a inflação; o bus deduplica)
        for (const b of bodyById.values()) {
          const d = b.worldPosition(_snap).distanceTo(ship.ship.position);
          if (d < b.radius * 6 + 8) emit("body:visited", { id: b.id });
        }
        // clusters de asteroides: descobertos entrando na região (sem GPS)
        for (const r of regionById.values()) {
          const d = r.worldPosition(_snap).distanceTo(ship.ship.position);
          if (d < (r.approachRadius || 40) * 1.5) emit("poi:found", { id: r.id });
        }
        if (satellites.group.visible) emit("poi:found", { id: "satnet" });
        if (wreck.revealed) emit("poi:found", { id: "wreck" });
      }
      saveManager.tick(dt); // auto-save periódico do voo (60s)

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
