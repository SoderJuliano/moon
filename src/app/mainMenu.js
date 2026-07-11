// MENU INICIAL — a porta de entrada dos dois modos.
//
// Não é um menu tradicional: é uma cena. A Via Láctea (galáxia espiral
// procedural) ocupa a tela vista de cima, girando devagar e contínuo — com um
// marcador acompanhando o braço onde fica o nosso Sistema Solar. Clicar no
// marcador abre um painel minimalista para escolher a experiência:
// Exploration (planetário) ou Game (pilotar a nave).
//
// Morfologia calcada nas ilustrações reais da Via Láctea: o disco é uma NUVEM
// contínua e difusa (azul-acinzentada) que esvai suave na borda; o núcleo é um
// grande brilho quente/rosado dominando o centro; os braços espirais são
// SUTIS — regiões mais claras da nuvem, bem enroladas, não fitas separadas —
// e por cima vai um granulado fino de estrelas.
//
// A cena do menu tem renderer próprio e é totalmente descartada ao escolher
// um modo — o modo escolhido cria a própria cena via createScene().

import * as THREE from "three";
import { radialGlowTexture, starfieldTexture } from "../core/textures.js";
import { SaveManager, LocalStorageBackend } from "../game/saveManager.js";
import { buildCatalog } from "../game/discoveryRegistry.js";
import { AchievementsScreen } from "../ui/achievementsScreen.js";
import {
  listPlayers, hasPlayer, addPlayer, saveKeyFor,
  legacySaveExists, migrateLegacyTo, hasAnySave, normalizeName,
} from "../game/players.js";
import { pullSave } from "../game/cloudSync.js";

const GALAXY_RADIUS = 100;
const ARMS = 4; // como nas ilustrações da Via Láctea (2 maiores + 2 menores)
const WRAPS = 5.8; // enrolamento do centro à borda (~330° — bem enrolado)
const SPIN_RATE = 0.018; // rad/s — giro calmo, mas perceptível (volta em ~6 min)
const SUN_ARM = 0;
const SUN_R = 0.55 * GALAXY_RADIUS; // ~26 mil anos-luz do centro (braço de Órion)

// ângulo do eixo de um braço no raio r (enrola mais rápido perto do centro)
function armAngle(arm, r) {
  return (arm / ARMS) * Math.PI * 2 + Math.pow(r / GALAXY_RADIUS, 0.8) * WRAPS;
}
function armPoint(arm, r) {
  const a = armAngle(arm, r);
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

function makeRng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// gradiente de cor do disco: centro quente/rosado → meio pálido → borda azul
const C_CORE = new THREE.Color("#ffddc2");
const C_MID = new THREE.Color("#c0c2e0");
const C_EDGE = new THREE.Color("#7c9ada");
function diskColor(t, out) {
  if (t < 0.35) out.copy(C_CORE).lerp(C_MID, t / 0.35);
  else out.copy(C_MID).lerp(C_EDGE, (t - 0.35) / 0.65);
  return out;
}

// Sorteia um ponto do disco. Retorna o quão "dentro de um braço" ele caiu
// (0..1) — braços são só regiões MAIS CLARAS da mesma nuvem, então isso vira
// modulação de brilho, não estrutura separada.
function sampleDisk(rand, gauss, p) {
  const r = rand() * GALAXY_RADIUS; // uniforme em r ⇒ denso no centro, raro na borda
  let armBoost = 0;
  let a;
  if (rand() < 0.45) {
    // braços LARGOS e difusos: são só ondulações de brilho na nuvem,
    // nunca fitas separadas (a maior parte do disco é preenchimento)
    const arm = (rand() * ARMS) | 0;
    const jitter = gauss() * (0.22 + 0.24 * (r / GALAXY_RADIUS));
    a = armAngle(arm, r) + jitter;
    armBoost = Math.max(0, 1 - Math.abs(jitter) * 1.7);
  } else {
    a = rand() * Math.PI * 2; // preenchimento entre braços (disco contínuo)
  }
  const rr = Math.max(0, r + gauss() * (2 + r * 0.05));
  // disco fino, engrossando de leve rumo ao bojo
  const y = gauss() * (1.2 + 3.5 * Math.max(0, 1 - r / 18));
  p.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
  return armBoost;
}

// borda esvaindo suave (nada de disco "recortado") + brilho geral caindo do
// centro pra fora, como nas fotos (metade interna do disco é bem mais clara)
function edgeFade(t) {
  const k = THREE.MathUtils.clamp((t - 0.6) / 0.4, 0, 1);
  return (1 - k * k * 0.9) * (0.55 + 0.45 * (1 - t));
}

// Granulado de estrelas: bojo denso + disco inteiro, brilho puxado pelos braços
function buildStars(count, seed) {
  const rand = makeRng(seed);
  const gauss = () => rand() + rand() + rand() - 1.5; // ~normal, ±1.5

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const knot = new THREE.Color("#dcebff");

  for (let i = 0; i < count; i++) {
    let armBoost = 0;
    if (rand() < 0.24) {
      // bojo: elipsoide achatado, denso e quente
      const r = Math.abs(gauss()) * 13;
      const a = rand() * Math.PI * 2;
      p.set(Math.cos(a) * r, gauss() * Math.max(1.2, 4.5 - r * 0.2), Math.sin(a) * r);
    } else {
      armBoost = sampleDisk(rand, gauss, p);
    }
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    const t = Math.min(Math.hypot(p.x, p.z) / GALAXY_RADIUS, 1);
    diskColor(t, c);
    let bright = (0.34 + 0.42 * armBoost + rand() * 0.28) * edgeFade(t);
    if (t < 0.28) bright += (1 - t / 0.28) * 0.5; // bojo mais luminoso
    if (armBoost > 0.6 && rand() < 0.07) {
      c.lerp(knot, 0.7); // nós azulados de formação estelar nos braços
      bright = 1.1;
    }
    colors[i * 3] = c.r * bright;
    colors[i * 3 + 1] = c.g * bright;
    colors[i * 3 + 2] = c.b * bright;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// Nuvem difusa: pontos grandes com sprite radial e cor por vértice — é ela que
// faz o disco parecer uma névoa luminosa contínua, e não pontos soltos.
function buildCloud(count, seed, size, opacity) {
  const rand = makeRng(seed);
  const gauss = () => rand() + rand() + rand() - 1.5;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const armBoost = sampleDisk(rand, gauss, p);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    const t = Math.min(Math.hypot(p.x, p.z) / GALAXY_RADIUS, 1);
    diskColor(t, c);
    let bright = (0.5 + 0.5 * armBoost) * edgeFade(t);
    if (t < 0.3) bright += (1 - t / 0.3) * 0.3; // clareia rumo ao núcleo
    colors[i * 3] = c.r * bright;
    colors[i * 3 + 1] = c.g * bright;
    colors[i * 3 + 2] = c.b * bright;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: radialGlowTexture("#ffffff"),
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function makeGlowSprite(color, scale, opacity) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialGlowTexture(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity,
    })
  );
  s.scale.setScalar(scale);
  return s;
}

export function startMainMenu({ onSelect }) {
  // --- cena própria do menu -------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = starfieldTexture(42);

  // vista de cima, com leve inclinação (como nas ilustrações — dá profundidade)
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 150, 124);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  document.body.appendChild(renderer.domElement);

  const spinner = new THREE.Group();
  scene.add(spinner);

  const stars = buildStars(45000, 1234);
  const cloudFine = buildCloud(4600, 5678, 6.5, 0.13); // névoa "de perto"
  const cloudSoft = buildCloud(2600, 8765, 14, 0.07); // véu largo por baixo
  spinner.add(stars, cloudFine, cloudSoft);

  // núcleo: um grande brilho quente em camadas dominando o centro (como nas
  // fotos, ele toma ~1/3 do diâmetro) + um véu azulado cobrindo o disco todo
  const diskGlow = makeGlowSprite("#a9bce0", 185, 0.1);
  const coreOuter = makeGlowSprite("#f2d4bc", 115, 0.32);
  const coreMid = makeGlowSprite("#ffe4c8", 58, 0.6);
  const coreInner = makeGlowSprite("#fff3e0", 20, 0.9);
  spinner.add(diskGlow, coreOuter, coreMid, coreInner);

  // âncora invisível na posição do Sistema Solar (gira junto com a galáxia)
  const sunAnchor = new THREE.Object3D();
  sunAnchor.position.copy(armPoint(SUN_ARM, SUN_R));
  sunAnchor.position.y = 0.6;
  spinner.add(sunAnchor);

  // --- overlay DOM ------------------------------------------------------------
  const root = document.createElement("div");
  root.className = "mm-root";
  root.innerHTML = `
    <div class="mm-title">Milky Way</div>
    <button class="mm-marker" type="button">
      <span class="mm-marker-ring"><span class="mm-marker-dot"></span></span>
      <span class="mm-marker-label">Solar System</span>
    </button>
    <div class="mm-panel" hidden>
      <div class="mm-panel-title">Solar System</div>
      <div class="mm-panel-sub">Choose your experience</div>
      <div class="mm-view-modes">
        <button class="mm-option" type="button" data-mode="exploration">
          <span class="mm-option-name">Exploration</span>
          <span class="mm-option-desc">Observe the Solar System in realistic scale.</span>
        </button>
        <button class="mm-option" type="button" data-mode="game">
          <span class="mm-option-name">Game</span>
          <span class="mm-option-desc">Pilot a spaceship through the Solar System.</span>
        </button>
      </div>
      <div class="mm-view-game">
        <button class="mm-option" type="button" data-game="continue">
          <span class="mm-option-name">Continuar</span>
          <span class="mm-option-desc">Volta exatamente de onde você parou.</span>
        </button>
        <button class="mm-option" type="button" data-game="new">
          <span class="mm-option-name">Novo Jogo</span>
          <span class="mm-option-desc">Começa uma exploração do zero.</span>
        </button>
        <button class="mm-option" type="button" data-game="achievements">
          <span class="mm-option-name">Conquistas</span>
          <span class="mm-option-desc">O que você já descobriu até agora.</span>
        </button>
        <div class="mm-save-row">
          <button class="mm-save-btn" type="button" data-game="import">Importar Save</button>
          <button class="mm-save-btn" type="button" data-game="export">Exportar Save</button>
          <button class="mm-save-btn" type="button" data-game="reset-mission">Resetar Missão</button>
        </div>
        <div class="mm-save-note"></div>
        <button class="mm-save-btn" type="button" data-game="back">◂ Voltar</button>
      </div>
      <div class="mm-view-name">
        <div class="mm-panel-title mm-name-title">Nome do jogador</div>
        <input class="mm-name-input" type="text" maxlength="24" placeholder="Digite um nome…" />
        <div class="mm-save-note mm-name-note"></div>
        <div class="mm-save-row">
          <button class="mm-save-btn" type="button" data-name="cancel">◂ Voltar</button>
          <button class="mm-save-btn mm-name-ok" type="button" data-name="ok">Confirmar</button>
        </div>
      </div>
      <div class="mm-view-players">
        <div class="mm-panel-title">Continuar com quem?</div>
        <div class="mm-players-list"></div>
        <button class="mm-option" type="button" data-players="other">
          <span class="mm-option-name">Não estou na lista</span>
          <span class="mm-option-desc">Digitar um nome e baixar o save da nuvem.</span>
        </button>
        <button class="mm-save-btn" type="button" data-players="back">◂ Voltar</button>
      </div>
    </div>
    <div class="mm-fade"></div>`;
  document.body.appendChild(root);

  const marker = root.querySelector(".mm-marker");
  const panel = root.querySelector(".mm-panel");
  const fade = root.querySelector(".mm-fade");

  marker.addEventListener("click", () => {
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("open"));
  });
  // clicar fora do painel (no espaço) fecha — e volta pra tela de modos
  renderer.domElement.addEventListener("click", () => {
    panel.classList.remove("open");
    setTimeout(() => {
      panel.hidden = true;
      showScreen("modes");
    }, 250);
  });

  let choosing = false;
  function launch(mode, opts) {
    if (choosing) return;
    choosing = true;
    fade.classList.add("on"); // escurece a galáxia antes de trocar de cena
    setTimeout(() => {
      dispose();
      // recoloca a tela de carregamento — o modo a remove no primeiro frame
      const loading = document.createElement("div");
      loading.id = "loading";
      loading.className = "loading";
      loading.textContent = "Carregando o sistema solar…";
      document.body.appendChild(loading);
      onSelect(mode, opts);
    }, 700);
  }

  // --- Painel multi-tela: modos → Game → (nome | escolher jogador) -------------
  // Save/conquistas só dentro do submenu do Game. New Game pede um nome;
  // Continuar mostra os jogadores deste navegador (+ "outro nome" que baixa da
  // nuvem). O save legado sem nome é batizado na 1ª vez que se clica Continuar.
  const views = {
    modes: root.querySelector(".mm-view-modes"),
    game: root.querySelector(".mm-view-game"),
    name: root.querySelector(".mm-view-name"),
    players: root.querySelector(".mm-view-players"),
  };
  const saveNote = root.querySelector(".mm-save-note");
  const nameInput = root.querySelector(".mm-name-input");
  const nameTitle = root.querySelector(".mm-name-title");
  const nameNote = root.querySelector(".mm-name-note");
  const playersList = root.querySelector(".mm-players-list");
  let achScreen = null;
  let nameConfirm = null; // callback(name) da tela de nome atual

  function showScreen(which) {
    for (const [k, el] of Object.entries(views)) el.classList.toggle("on", k === which);
    views.modes.style.display = which === "modes" ? "" : "none";
    if (which === "game") {
      const has = hasAnySave();
      views.game.querySelector('[data-game="continue"]').style.display = has ? "" : "none";
      views.game.querySelector('[data-game="export"]').style.display = has ? "" : "none";
      saveNote.textContent = "";
    }
  }
  showScreen("modes");

  // tela de NOME reutilizável: título + placeholder + callback ao confirmar
  function askName(title, placeholder, onConfirm) {
    nameTitle.textContent = title;
    nameInput.value = "";
    nameInput.placeholder = placeholder;
    nameNote.textContent = "";
    nameConfirm = onConfirm;
    showScreen("name");
    setTimeout(() => nameInput.focus(), 60);
  }
  function submitName() {
    const name = normalizeName(nameInput.value);
    if (name.length < 2) {
      nameNote.textContent = "Escolha um nome com pelo menos 2 letras.";
      return;
    }
    nameConfirm?.(name);
  }
  root.querySelector('[data-name="ok"]').addEventListener("click", submitName);
  root.querySelector('[data-name="cancel"]').addEventListener("click", () => showScreen("game"));
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
  });

  root.querySelector('[data-mode="exploration"]').addEventListener("click", () => launch("exploration"));
  root.querySelector('[data-mode="game"]').addEventListener("click", () => showScreen("game"));
  views.game.querySelector('[data-game="back"]').addEventListener("click", () => showScreen("modes"));

  // NOVO JOGO: pede um nome; se já existe (ou há legado), confirma sobrescrever
  views.game.querySelector('[data-game="new"]').addEventListener("click", () => {
    askName("Nome do jogador", "Como quer ser chamado?", (name) => {
      const overwrites = hasPlayer(name) || (legacySaveExists() && !listPlayers().length);
      if (overwrites && !confirm(`Isso apaga o save de "${name}". Continuar?`)) return;
      if (legacySaveExists()) migrateLegacyTo(name); // some com o legado sem nome
      addPlayer(name);
      launch("game", { resume: false, playerName: name });
    });
  });

  // CONTINUAR: escolher jogador (ou batizar o legado sem nome na 1ª vez)
  views.game.querySelector('[data-game="continue"]').addEventListener("click", () => {
    if (!listPlayers().length && legacySaveExists()) {
      askName("Dê um nome ao seu jogo salvo", "Nome do jogador", (name) => {
        migrateLegacyTo(name); // move o save legado → moon.save::<name>
        launch("game", { resume: true, playerName: name });
      });
      return;
    }
    renderPlayers();
    showScreen("players");
  });

  function renderPlayers() {
    playersList.innerHTML = "";
    for (const p of listPlayers()) {
      const btn = document.createElement("button");
      btn.className = "mm-option";
      btn.type = "button";
      btn.innerHTML = `<span class="mm-option-name">${p.name}</span>
        <span class="mm-option-desc">Continuar este jogo.</span>`;
      btn.addEventListener("click", () => launch("game", { resume: true, playerName: p.name }));
      playersList.appendChild(btn);
    }
  }
  views.players.querySelector('[data-players="back"]').addEventListener("click", () => showScreen("game"));

  // "Não estou na lista": digita o nome e BAIXA o save da nuvem (abra-api)
  views.players.querySelector('[data-players="other"]').addEventListener("click", () => {
    askName("Carregar da nuvem", "Nome do jogador salvo", async (name) => {
      nameNote.textContent = "Buscando na nuvem…";
      const remote = await pullSave(name);
      if (!remote) {
        nameNote.textContent = `Nenhum save na nuvem para "${name}".`;
        return;
      }
      // grava localmente e registra o jogador; o jogo carrega desse local
      new LocalStorageBackend(saveKeyFor(name)).write(JSON.stringify(remote.save, null, 2));
      addPlayer(name);
      launch("game", { resume: true, playerName: name });
    });
  });

  // CONQUISTAS: mostra as do 1º jogador (ou do legado) — a precisa é a do jogo
  views.game.querySelector('[data-game="achievements"]').addEventListener("click", () => {
    const first = listPlayers()[0];
    const backend = first ? new LocalStorageBackend(saveKeyFor(first.name)) : new LocalStorageBackend();
    const sm = new SaveManager(backend);
    sm.load(); // pode não existir: a tela mostra tudo ??????
    if (!achScreen) achScreen = new AchievementsScreen({ save: sm, catalog: new Map(buildCatalog().map((i) => [i.id, i])) });
    else achScreen.save = sm;
    achScreen.open();
  });

  // EXPORTAR/IMPORTAR: opera no 1º jogador (ou legado)
  function currentBackendKey() {
    const first = listPlayers()[0];
    return first ? saveKeyFor(first.name) : "moon.save.v1";
  }
  views.game.querySelector('[data-game="export"]').addEventListener("click", () => {
    const sm = new SaveManager(new LocalStorageBackend(currentBackendKey()));
    saveNote.textContent = sm.exportToFile() ? "Save exportado (JSON)." : "Nenhum save para exportar.";
  });
  views.game.querySelector('[data-game="import"]').addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        const sm = new SaveManager(new LocalStorageBackend(currentBackendKey()));
        const ok = sm.importFromText(text);
        saveNote.textContent = ok ? "Save importado! Clique em Continuar." : "Arquivo inválido — nada foi alterado.";
        showScreen("game");
      });
    });
    input.click();
  });

  // RESETAR MISSÃO (Admin)
  views.game.querySelector('[data-game="reset-mission"]').addEventListener("click", () => {
    askName("ID da Missão para resetar", "ex: rock-delivery", (missionId) => {
      const sm = new SaveManager(new LocalStorageBackend(currentBackendKey()));
      const data = sm.load();
      if (data && data.missions && data.missions[missionId]) {
        delete data.missions[missionId];
        sm.saveNow();
        saveNote.textContent = `Missão '${missionId}' resetada!`;
      } else {
        saveNote.textContent = `Missão '${missionId}' não iniciada/encontrada.`;
      }
      showScreen("game");
    });
  });

  // --- loop -------------------------------------------------------------------
  const clock = new THREE.Clock();
  const _v = new THREE.Vector3();
  let raf = 0;
  let loadingHidden = false;

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    spinner.rotation.y += SPIN_RATE * dt; // rotação contínua e calma
    coreMid.material.opacity = 0.76 + Math.sin(performance.now() * 0.0008) * 0.06;

    // o marcador acompanha o braço: projeta a âncora 3D para a tela
    sunAnchor.getWorldPosition(_v).project(camera);
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (0.5 - _v.y * 0.5) * window.innerHeight;
    marker.style.transform = `translate(${x}px, ${y}px)`;

    renderer.render(scene, camera);

    if (!loadingHidden) {
      document.getElementById("loading")?.remove();
      loadingHidden = true;
    }
  }
  animate();

  function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    for (const pts of [stars, cloudFine, cloudSoft]) {
      pts.geometry.dispose();
      pts.material.map?.dispose();
      pts.material.dispose();
    }
    for (const s of [diskGlow, coreOuter, coreMid, coreInner]) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    scene.background?.dispose?.();
    renderer.dispose();
    renderer.domElement.remove();
    root.remove();
  }
}
