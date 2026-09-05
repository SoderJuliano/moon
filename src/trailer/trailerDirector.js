// TrailerDirector — Diretor de Câmera e Coreografia do Trailer de Lançamento (30s)
// Controla câmeras dinâmicas, nave, planetas, combate dos chefes, textos cinematográficos e
// trilha sonora Dark Trap sincronizada, gravando vídeo e áudio em 60 FPS via TrailerRecorder.

import * as THREE from "three";
import { createScene } from "../core/scene.js";
import { buildSolarSystem } from "../app/world.js";
import { buildShipModel } from "../ui/shipFlight.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BossShip } from "../combat/bossShip.js";
import { AlienShip } from "../combat/alienShip.js";
import { Portal } from "../combat/portal.js";
import { TrailerRecorder } from "./trailerRecorder.js";
import { radialGlowTexture } from "../core/textures.js";

const TOTAL_DURATION = 30.0;

export function startTrailerMode({ autoRecord = true, cleanMode = false } = {}) {
  window.isTrailerMode = true;
  document.body.classList.add("trailer-mode");

  // Remove tela de loading do menu imediatamente
  document.getElementById("loading")?.remove();

  const { scene, camera, renderer, controls, glow } = createScene();
  controls.enabled = false; // Desativa controle manual de câmera durante o trailer

  const world = buildSolarSystem(scene, glow, { mode: "real", withOrbitLines: false });
  const { bodyById, bodies } = world;

  // Atualiza planetas na órbita real
  for (const b of bodies) b.update(0, 0, 0.016);
  scene.updateMatrixWorld(true);

  const earth = bodyById.get("earth");
  const moon = bodyById.get("moon");
  const jupiter = bodyById.get("jupiter");
  const saturn = bodyById.get("saturn");

  const posE = new THREE.Vector3();
  const posM = new THREE.Vector3();
  const posS = new THREE.Vector3();
  const posJ = new THREE.Vector3();

  function updatePlanetPositions() {
    if (earth) earth.worldPosition(posE);
    if (moon) moon.worldPosition(posM);
    if (saturn) saturn.worldPosition(posS);
    if (jupiter) jupiter.worldPosition(posJ);
  }
  updatePlanetPositions();

  // ---- Trilha Sonora do Trailer ----------------------------------------------
  const music = new Audio("audio/trailer_beat.mp3");
  music.loop = true;
  music.playbackRate = 1.10; // Acelera levemente o beat para ~154 BPM (ritmo dinâmico de trailer)
  music.volume = 0.85;

  // ---- Nave do Jogador -------------------------------------------------------
  const playerGroup = new THREE.Group();
  scene.add(playerGroup);

  const fallbackShip = buildShipModel();
  fallbackShip.scale.setScalar(1.4);
  playerGroup.add(fallbackShip);

  new GLTFLoader().load("models/Spaceship.glb", (gltf) => {
    const s = gltf.scene;
    const box = new THREE.Box3().setFromObject(s);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    s.position.sub(center);
    const fix = new THREE.Group();
    fix.add(s);
    fix.rotation.set(0, 0, 0);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    fix.scale.setScalar((1.6 / maxDim) * 1.4);
    playerGroup.remove(fallbackShip);
    playerGroup.add(fix);
  });

  // Fogo dos motores na TRASEIRA (-Z)
  const thrusterSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialGlowTexture("#4dc3ff"),
      color: 0x66ccff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  thrusterSprite.scale.set(0.65, 0.65, 0.65);
  thrusterSprite.position.set(0, 0, -0.75);
  playerGroup.add(thrusterSprite);

  // ---- Efeito de Partículas de Dobra (Supercruise Warp) -----------------------
  const WARP_COUNT = 350;
  const warpGeo = new THREE.BufferGeometry();
  const warpPositions = new Float32Array(WARP_COUNT * 6);
  for (let i = 0; i < WARP_COUNT; i++) {
    const x = (Math.random() - 0.5) * 50;
    const y = (Math.random() - 0.5) * 50;
    const z = (Math.random() - 0.5) * 100;
    warpPositions[i * 6] = x;
    warpPositions[i * 6 + 1] = y;
    warpPositions[i * 6 + 2] = z;
    warpPositions[i * 6 + 3] = x;
    warpPositions[i * 6 + 4] = y;
    warpPositions[i * 6 + 5] = z - (6 + Math.random() * 10);
  }
  warpGeo.setAttribute("position", new THREE.BufferAttribute(warpPositions, 3));
  const warpMat = new THREE.LineBasicMaterial({
    color: 0x85c7ff,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const warpLines = new THREE.LineSegments(warpGeo, warpMat);
  scene.add(warpLines);

  // ---- Inimigos & Combate (Chefes Gêmeos + Batedores) ------------------------
  const combatPos = new THREE.Vector3(posE.x + 60, posE.y + 10, posE.z + 80);

  const portal = new Portal(scene, {
    colors: { core: "#070208", veil: "#3a0a1a", halo: "#6e1030", rim: "#ff3b57", spark: "#ff7d95" },
    sparks: 18,
    shockwave: true,
  });

  const bossEclipse = new BossShip(scene, {
    id: "boss-eclipse",
    name: "Eclipse",
    modelUrl: "models/starship.glb",
  });
  const bossVortice = new BossShip(scene, {
    id: "boss-vortice",
    name: "Vórtice",
    modelUrl: "models/combatstarship.glb",
    yaw: -Math.PI / 2, // Alinhamento corrigido
  });
  const scout1 = new AlienShip(scene);
  const scout2 = new AlienShip(scene);

  bossEclipse.load();
  bossVortice.load();
  scout1.load();
  scout2.load();

  // Tiros de Plasma Azuis (Jogador) e Vermelhos (Inimigos)
  const boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6);
  boltGeo.rotateX(Math.PI / 2);
  const boltPlayerMat = new THREE.MeshBasicMaterial({
    color: 0x38b6ff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });
  const boltEnemyMat = new THREE.MeshBasicMaterial({
    color: 0xff3b57,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });

  const plasmaBolts = [];
  for (let i = 0; i < 20; i++) {
    const isPlayer = i % 2 === 0;
    const mesh = new THREE.Mesh(boltGeo, isPlayer ? boltPlayerMat : boltEnemyMat);
    mesh.visible = false;
    scene.add(mesh);
    plasmaBolts.push({ mesh, vel: new THREE.Vector3(), life: 0, isPlayer });
  }

  // ---- UI de Overlay Cinematográfico ----------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "trailer-overlay";
  overlay.innerHTML = `
    <div class="trailer-letterbox top"></div>
    <div class="trailer-letterbox bottom"></div>

    <div class="trailer-hud">
      <div class="trailer-rec-badge">
        <span class="rec-dot"></span> <span class="rec-status">GRAVANDO VÍDEO + ÁUDIO</span>
        <span class="rec-timer">00:00 / 00:30</span>
      </div>
      <div class="trailer-hud-controls">
        <button class="trailer-hud-btn" id="btn-hud-speed">🎵 Vel: 1.1x</button>
        <button class="trailer-hud-btn" id="btn-hud-toggle-text">👁️ Textos On/Off</button>
        <button class="trailer-hud-btn exit" id="btn-hud-exit">✕ Sair</button>
      </div>
      <div class="trailer-progress-bar"><div class="trailer-progress-fill"></div></div>
    </div>

    <div class="trailer-card" id="card-act1">
      <div class="trailer-badge">SISTEMA SOLAR 3D</div>
      <div class="trailer-title">EXPLORE O SISTEMA SOLAR EM ESCALA REAL</div>
      <div class="trailer-sub">Planetas, órbitas e dados astronômicos em tempo real</div>
    </div>

    <div class="trailer-card" id="card-act2">
      <div class="trailer-badge">DOBRA ESPACIAL 6DoF</div>
      <div class="trailer-title">VELOCIDADE SUPERCRUISE & DESCOBERTAS</div>
      <div class="trailer-sub">Cinturões de asteroides, sondas espaciais e estações orbitais</div>
    </div>

    <div class="trailer-card" id="card-act3">
      <div class="trailer-badge">COMBATE ESPACIAL TÁTICO</div>
      <div class="trailer-title">DEFENDA A ÚLTIMA FRONTEIRA</div>
      <div class="trailer-sub">Enfrente frotas alienígenas e cruzadores colossais</div>
    </div>

    <div class="trailer-card" id="card-act4">
      <div class="trailer-logo">M O O N</div>
      <div class="trailer-title">O SISTEMA SOLAR COMO VOCÊ NUNCA VIU</div>
      <div class="trailer-cta">DISPONÍVEL PARA ANDROID & WEB | JOGUE AGORA</div>
    </div>

    <div class="trailer-finish-modal" style="display:none;">
      <div class="finish-box">
        <div class="finish-title">🎉 Trailer Gravado com Sucesso!</div>
        <div class="finish-desc">O arquivo de vídeo e áudio <b>moon-trailer-30s.webm</b> foi gerado em alta definição e baixado no seu computador.</div>
        <div class="finish-actions">
          <button class="trailer-btn" id="btn-replay">🎬 Gravar Novamente (30s)</button>
          <button class="trailer-btn secondary" id="btn-toggle-text">👁️ Alternar Textos</button>
          <button class="trailer-btn secondary" id="btn-take-combat">⚔️ Gravar Só Combate</button>
          <button class="trailer-btn secondary" id="btn-exit">✕ Voltar ao Menu</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Estilos Injetados
  const style = document.createElement("style");
  style.textContent = `
    .trailer-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 100;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .trailer-letterbox {
      position: absolute;
      left: 0; right: 0;
      height: 48px;
      background: #000;
      z-index: 101;
    }
    .trailer-letterbox.top { top: 0; }
    .trailer-letterbox.bottom { bottom: 0; }

    .trailer-hud {
      position: absolute;
      top: 56px;
      left: 32px;
      right: 32px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      pointer-events: auto;
      z-index: 102;
    }
    .trailer-rec-badge {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: #fff;
      background: rgba(10, 15, 25, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 6px 14px;
      border-radius: 20px;
      backdrop-filter: blur(8px);
    }
    .rec-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff3b57;
      box-shadow: 0 0 10px #ff3b57;
      animation: rec-blink 1s ease-in-out infinite alternate;
    }
    @keyframes rec-blink { from { opacity: 0.3; } to { opacity: 1; } }

    .trailer-hud-controls {
      display: flex;
      gap: 8px;
    }
    .trailer-hud-btn {
      appearance: none;
      background: rgba(10, 15, 25, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #eaf1ff;
      padding: 6px 12px;
      border-radius: 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: background 0.2s;
    }
    .trailer-hud-btn:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .trailer-hud-btn.exit:hover {
      background: rgba(255, 59, 87, 0.4);
      border-color: #ff3b57;
    }

    .trailer-progress-bar {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 4px;
    }
    .trailer-progress-fill {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #38b6ff, #ff8442);
      transition: width 0.1s linear;
    }

    .trailer-card {
      position: absolute;
      left: 50%;
      bottom: 80px;
      transform: translateX(-50%) translateY(20px);
      text-align: center;
      opacity: 0;
      transition: opacity 0.7s ease, transform 0.7s ease;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.9);
      max-width: 900px;
      width: 90%;
    }
    .trailer-card.active {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .trailer-badge {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.25em;
      color: #ffb45e;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .trailer-title {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .trailer-sub {
      font-size: 16px;
      color: #c0d0ea;
      font-weight: 400;
    }
    .trailer-logo {
      font-size: 56px;
      font-weight: 900;
      letter-spacing: 0.35em;
      color: #ffffff;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #ffffff 40%, #7db4ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .trailer-cta {
      display: inline-block;
      margin-top: 14px;
      padding: 10px 24px;
      background: rgba(56, 182, 255, 0.25);
      border: 1px solid #38b6ff;
      border-radius: 24px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #ffffff;
      box-shadow: 0 0 20px rgba(56, 182, 255, 0.4);
    }

    .trailer-finish-modal {
      position: absolute;
      inset: 0;
      background: rgba(3, 6, 14, 0.85);
      backdrop-filter: blur(12px);
      display: grid;
      place-items: center;
      pointer-events: auto;
      z-index: 105;
    }
    .finish-box {
      background: rgba(18, 24, 40, 0.95);
      border: 1px solid rgba(110, 168, 255, 0.3);
      border-radius: 16px;
      padding: 36px;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
    }
    .finish-title {
      font-size: 24px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 12px;
    }
    .finish-desc {
      font-size: 14px;
      color: #a6b8d4;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .finish-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .trailer-btn {
      padding: 12px 20px;
      background: #2a69db;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .trailer-btn:hover { background: #3b7ef8; }
    .trailer-btn.secondary {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .trailer-btn.secondary:hover { background: rgba(255, 255, 255, 0.15); }
    .clean-mode .trailer-card { display: none !important; }
  `;
  document.head.appendChild(style);

  // ---- Gravador -------------------------------------------------------------
  const recorder = new TrailerRecorder(renderer.domElement, { fps: 60 });
  let time = 0;
  let isRunning = true;
  let textHidden = cleanMode;

  if (textHidden) overlay.classList.add("clean-mode");

  const cards = {
    act1: overlay.querySelector("#card-act1"),
    act2: overlay.querySelector("#card-act2"),
    act3: overlay.querySelector("#card-act3"),
    act4: overlay.querySelector("#card-act4"),
  };
  const timerEl = overlay.querySelector(".rec-timer");
  const progressFill = overlay.querySelector(".trailer-progress-fill");
  const modal = overlay.querySelector(".trailer-finish-modal");
  const speedBtn = overlay.querySelector("#btn-hud-speed");

  function setCard(activeId) {
    for (const [id, el] of Object.entries(cards)) {
      el.classList.toggle("active", id === activeId && !textHidden);
    }
  }

  function startSequence() {
    time = 0;
    isRunning = true;
    modal.style.display = "none";
    music.currentTime = 0;
    music.play().catch(() => {});
    if (autoRecord) recorder.start(music);
  }

  function toggleText() {
    textHidden = !textHidden;
    overlay.classList.toggle("clean-mode", textHidden);
  }

  function exitToMenu() {
    music.pause();
    window.location.href = window.location.pathname;
  }

  const speeds = [1.0, 1.10, 1.20, 1.30];
  let speedIdx = 1;
  speedBtn.addEventListener("click", () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const spd = speeds[speedIdx];
    music.playbackRate = spd;
    speedBtn.textContent = `🎵 Vel: ${spd.toFixed(1)}x`;
  });

  // Botoes do modal e HUD
  overlay.querySelector("#btn-replay").addEventListener("click", () => startSequence());
  overlay.querySelector("#btn-toggle-text").addEventListener("click", toggleText);
  overlay.querySelector("#btn-hud-toggle-text").addEventListener("click", toggleText);
  overlay.querySelector("#btn-take-combat").addEventListener("click", () => {
    time = 15.0; // Pula direto pro combate
    modal.style.display = "none";
    music.currentTime = 13.5;
    music.play().catch(() => {});
    recorder.start(music);
  });
  overlay.querySelector("#btn-exit").addEventListener("click", exitToMenu);
  overlay.querySelector("#btn-hud-exit").addEventListener("click", exitToMenu);

  // ---- LOOP PRINCIPAL (Cinema & Coreografia) --------------------------------
  const clock = new THREE.Clock();
  const tmpV1 = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const camTgt = new THREE.Vector3();
  let loadingHidden = false;

  startSequence();

  function animate() {
    requestAnimationFrame(animate);

    if (!loadingHidden) {
      document.getElementById("loading")?.remove();
      loadingHidden = true;
    }

    const dt = Math.min(clock.getDelta(), 0.05);

    if (isRunning) {
      time += dt;

      // Atualiza progresso e timer
      const pct = Math.min(100, (time / TOTAL_DURATION) * 100);
      progressFill.style.width = `${pct}%`;
      const s = Math.floor(time);
      const ms = Math.floor((time % 1) * 10);
      timerEl.textContent = `${String(s).padStart(2, "0")}:${ms}0 / 00:30`;

      // =========================================================================
      // [0.0s – 7.5s] ACT 1: TERRA, LUA & DECOLAGEM
      // =========================================================================
      if (time < 7.5) {
        setCard("act1");
        warpMat.opacity = 0;

        const tNorm = time / 7.5;
        // Órbita suave sobre a Terra (raio de órbita 1.75u a 3.4u — superfície da Terra é r=1.0)
        const angle = -0.4 + tNorm * 1.1;
        const orbitR = 1.75 + tNorm * 1.6;
        
        // Posição da nave voando para frente no espaço
        const shipPos = new THREE.Vector3(
          posE.x + Math.cos(angle) * orbitR,
          posE.y + 0.5 + tNorm * 0.7,
          posE.z + Math.sin(angle) * orbitR
        );
        playerGroup.position.copy(shipPos);

        // Próxima posição para orientar o nariz da nave para frente (+Z)
        const nextAngle = angle + 0.06;
        const nextOrbitR = orbitR + 0.05;
        const targetPos = new THREE.Vector3(
          posE.x + Math.cos(nextAngle) * nextOrbitR,
          posE.y + 0.5 + tNorm * 0.7 + 0.03,
          posE.z + Math.sin(nextAngle) * nextOrbitR
        );
        playerGroup.lookAt(targetPos);

        // Câmera dinâmica acompanhando a nave e mostrando a curva da Terra ao fundo
        camera.position.set(
          posE.x + Math.cos(angle - 0.35) * (orbitR + 1.2),
          posE.y + 1.4 + tNorm * 0.5,
          posE.z + Math.sin(angle - 0.35) * (orbitR + 1.2)
        );
        camTgt.copy(shipPos);
        camera.lookAt(camTgt);

        thrusterSprite.scale.setScalar(0.7 + Math.sin(time * 25) * 0.1);
      }

      // =========================================================================
      // [7.5s – 15.0s] ACT 2: SUPERCRUISE & SATURNO / JÚPITER
      // =========================================================================
      else if (time < 15.0) {
        setCard("act2");
        const tAct = time - 7.5;
        const tNorm = tAct / 7.5;

        // Efeito de Dobra Espacial
        warpMat.opacity = Math.min(0.85, Math.sin(tNorm * Math.PI) * 1.2);
        warpLines.position.copy(camera.position);

        if (tAct < 4.0) {
          // Passagem pelos anéis de Saturno (raio do planeta = 9.1u, anéis até 21u)
          // Nave voa a r = 16.5u e y = +3.2u (deslizando sobre os anéis com segurança)
          const sNorm = tAct / 4.0;
          const sAngle = 0.3 + sNorm * 0.9;
          const sDist = 16.5;

          const shipPos = new THREE.Vector3(
            posS.x + Math.cos(sAngle) * sDist,
            posS.y + 3.2,
            posS.z + Math.sin(sAngle) * sDist
          );
          playerGroup.position.copy(shipPos);

          const nextPos = new THREE.Vector3(
            posS.x + Math.cos(sAngle + 0.08) * sDist,
            posS.y + 3.2,
            posS.z + Math.sin(sAngle + 0.08) * sDist
          );
          playerGroup.lookAt(nextPos);

          // Câmera cinematográfica rente aos anéis
          camera.position.set(
            posS.x + Math.cos(sAngle - 0.25) * (sDist + 4.5),
            posS.y + 4.8,
            posS.z + Math.sin(sAngle - 0.25) * (sDist + 4.5)
          );
          camTgt.copy(shipPos);
          camera.lookAt(camTgt);
        } else {
          // Rasante por Júpiter (raio = 11u; nave voa a r = 19.5u e y = +4.8u)
          const jNorm = (tAct - 4.0) / 3.5;
          const jAngle = -0.8 + jNorm * 1.2;
          const jDist = 19.5;

          const shipPos = new THREE.Vector3(
            posJ.x + Math.cos(jAngle) * jDist,
            posJ.y + 4.8 - jNorm * 1.5,
            posJ.z + Math.sin(jAngle) * jDist
          );
          playerGroup.position.copy(shipPos);

          const nextPos = new THREE.Vector3(
            posJ.x + Math.cos(jAngle + 0.08) * jDist,
            posJ.y + 4.8 - jNorm * 1.5,
            posJ.z + Math.sin(jAngle + 0.08) * jDist
          );
          playerGroup.lookAt(nextPos);

          camera.position.set(
            posJ.x + Math.cos(jAngle - 0.22) * (jDist + 5.5),
            posJ.y + 6.8,
            posJ.z + Math.sin(jAngle - 0.22) * (jDist + 5.5)
          );
          camTgt.copy(shipPos);
          camera.lookAt(camTgt);
        }
      }

      // =========================================================================
      // [15.0s – 24.0s] ACT 3: COMBATE & OS GÊMEOS DO OCASO
      // =========================================================================
      else if (time < 24.0) {
        setCard("act3");
        warpMat.opacity = 0;
        const tAct = time - 15.0;

        const cPos = combatPos;

        // Portal abre nos primeiros 2.5s
        if (tAct < 2.5) {
          portal.openAt(cPos, 7.5);
        }
        portal.update(dt);

        // Naves chefes emergem e avançam
        if (tAct >= 1.5) {
          if (!bossEclipse.alive) {
            bossEclipse.spawnAt(tmpV1.copy(cPos).add(tmpV2.set(-3.0, 0.6, -2)));
            bossVortice.spawnAt(tmpV1.copy(cPos).add(tmpV2.set(3.0, -0.6, -2)));
            scout1.spawnAt(tmpV1.copy(cPos).add(tmpV2.set(-5.5, 2.0, 2)));
            scout2.spawnAt(tmpV1.copy(cPos).add(tmpV2.set(5.5, -2.0, 2)));
          }

          const adv = (tAct - 1.5) * 1.8;
          bossEclipse.group.position.set(cPos.x - 3.0, cPos.y + 0.6, cPos.z - 2 + adv * 0.7);
          bossVortice.group.position.set(cPos.x + 3.0, cPos.y - 0.6, cPos.z - 2 + adv * 0.7);

          // Chefes olham diretamente para a nave do jogador
          bossEclipse.group.lookAt(playerGroup.position);
          bossVortice.group.lookAt(playerGroup.position);
          scout1.group.lookAt(playerGroup.position);
          scout2.group.lookAt(playerGroup.position);

          bossEclipse.update(dt, playerGroup.position);
          bossVortice.update(dt, playerGroup.position);
          scout1.update(dt, playerGroup.position);
          scout2.update(dt, playerGroup.position);
        }

        // Nave do jogador voando de frente contra os chefes
        const pZ = cPos.z + 24 - tAct * 3.4;
        const pX = cPos.x + Math.sin(tAct * 2.2) * 2.4;
        const pY = cPos.y - 0.4 + Math.cos(tAct * 1.8) * 0.6;
        playerGroup.position.set(pX, pY, pZ);

        // Nave do jogador aponta o bico (+Z) na direção do combate/portal
        playerGroup.lookAt(cPos.x, cPos.y, cPos.z);

        // Tiros de Plasma disparando para frente
        if (Math.sin(time * 14) > 0.4) {
          const b = plasmaBolts.find((x) => x.life <= 0);
          if (b) {
            b.life = 1.2;
            b.mesh.visible = true;
            if (b.isPlayer) {
              // Tiros do jogador saem da frente do bico (+Z) rumo aos chefes
              b.mesh.position.copy(playerGroup.position).add(tmpV1.set((Math.random() - 0.5) * 0.4, 0, 0.8));
              tmpV2.copy(cPos).sub(playerGroup.position).normalize().multiplyScalar(22);
              b.vel.copy(tmpV2);
              b.mesh.lookAt(cPos);
            } else {
              // Tiros dos chefes saem em direção ao jogador
              const srcPos = Math.random() > 0.5 ? bossEclipse.group.position : bossVortice.group.position;
              b.mesh.position.copy(srcPos).add(tmpV1.set((Math.random() - 0.5) * 0.8, 0, 0.8));
              tmpV2.copy(playerGroup.position).sub(srcPos).normalize().multiplyScalar(16);
              b.vel.copy(tmpV2);
              b.mesh.lookAt(playerGroup.position);
            }
          }
        }

        // Câmera dinâmica de ação com leve tremor
        const shake = Math.sin(time * 35) * 0.09;
        camera.position.set(pX + 2.2 + shake, pY + 1.4, pZ + 5.5);
        camTgt.set(cPos.x, cPos.y, cPos.z);
        camera.lookAt(camTgt);
      }

      // =========================================================================
      // [24.0s – 30.0s] ACT 4: LOGO & ENCERRAMENTO
      // =========================================================================
      else if (time < TOTAL_DURATION) {
        setCard("act4");
        portal.close();
        bossEclipse.hide();
        bossVortice.hide();
        scout1.hide();
        scout2.hide();

        const tNorm = (time - 24.0) / 6.0;
        // Nave voando para frente no espaço estelar
        playerGroup.position.set(posE.x, posE.y, posE.z + 10 + tNorm * 90);
        playerGroup.lookAt(posE.x, posE.y, posE.z + 200);

        camera.position.set(posE.x + 2.5, posE.y + 2.0, posE.z - 4.0);
        camTgt.set(posE.x, posE.y, posE.z + 100);
        camera.lookAt(camTgt);
      }

      // =========================================================================
      // FINALIZAÇÃO (30.0s) -> Conclui e Baixa o Vídeo
      // =========================================================================
      else {
        isRunning = false;
        setCard(null);
        music.pause();
        if (recorder.isRecording) {
          recorder.stop("moon-trailer-30s.webm");
        }
        modal.style.display = "grid";
      }

      // Atualiza lasers
      for (const b of plasmaBolts) {
        if (b.life > 0) {
          b.life -= dt;
          b.mesh.position.addScaledVector(b.vel, dt);
          if (b.life <= 0) b.mesh.visible = false;
        }
      }
    }

    renderer.render(scene, camera);
  }

  animate();
}
