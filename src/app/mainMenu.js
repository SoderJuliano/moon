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
import { SaveManager, LocalStorageBackend, createPlayerSave } from "../game/saveManager.js";
import { t } from "../core/i18n.js";
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
    <div class="mm-title">${t("menu.milkyWay")}</div>
    <button class="mm-marker" type="button">
      <span class="mm-marker-ring"><span class="mm-marker-dot"></span></span>
      <span class="mm-marker-label">${t("menu.solarSystem")}</span>
    </button>
    <div class="mm-panel" hidden>
      <div class="mm-panel-title">${t("menu.solarSystem")}</div>
      <div class="mm-panel-sub">${t("menu.chooseExperience")}</div>
      <div class="mm-view-modes">
        <button class="mm-option" type="button" data-mode="exploration">
          <span class="mm-option-name">${t("menu.exploration")}</span>
          <span class="mm-option-desc">${t("menu.explorationDesc")}</span>
        </button>
        <button class="mm-option" type="button" data-mode="game">
          <span class="mm-option-name">${t("menu.game")}</span>
          <span class="mm-option-desc">${t("menu.gameDesc")}</span>
        </button>
        <button class="mm-option" type="button" data-mode="trailer">
          <span class="mm-option-name">🎬 Gravar Trailer (30s)</span>
          <span class="mm-option-desc">Grava automaticamente o trailer cinematográfico em 60 FPS com download direto.</span>
        </button>
      </div>
      <div class="mm-view-game">
        <button class="mm-option" type="button" data-game="continue">
          <span class="mm-option-name">${t("menu.continue")}</span>
          <span class="mm-option-desc">${t("menu.continueDesc")}</span>
        </button>
        <button class="mm-option" type="button" data-game="new">
          <span class="mm-option-name">${t("menu.newGame")}</span>
          <span class="mm-option-desc">${t("menu.newGameDesc")}</span>
        </button>
        <div class="mm-save-row">
          <button class="mm-save-btn" type="button" data-game="import">${t("menu.importSave")}</button>
          <button class="mm-save-btn" type="button" data-game="export">${t("menu.exportSave")}</button>
          <button class="mm-save-btn" type="button" data-game="reset-mission">${t("menu.resetMission")}</button>
        </div>
        <div class="mm-save-note"></div>
        <button class="mm-save-btn" type="button" data-game="back">${t("menu.back")}</button>
      </div>
      <div class="mm-view-name">
        <div class="mm-panel-title mm-name-title">${t("menu.playerName")}</div>
        <input class="mm-name-input" type="text" maxlength="24" placeholder="${t("menu.enterName")}" />
        <div class="mm-save-note mm-name-note"></div>
        <div class="mm-save-row">
          <button class="mm-save-btn" type="button" data-name="cancel">${t("menu.back")}</button>
          <button class="mm-save-btn mm-name-ok" type="button" data-name="ok">${t("menu.confirm")}</button>
        </div>
      </div>
      <div class="mm-view-password">
        <div class="mm-panel-title mm-password-title">${t("menu.savePassword")}</div>
        <input class="mm-password-input" type="password" maxlength="32" placeholder="${t("menu.enterPassword")}" />
        <div class="mm-save-note mm-password-note"></div>
        <div class="mm-save-row">
          <button class="mm-save-btn" type="button" data-password="cancel">${t("menu.back")}</button>
          <button class="mm-save-btn mm-password-ok" type="button" data-password="ok">${t("menu.confirm")}</button>
        </div>
      </div>
      <div class="mm-view-players">
        <div class="mm-panel-title">${t("menu.continueWho")}</div>
        <div class="mm-players-list"></div>
        <button class="mm-option" type="button" data-players="other">
          <span class="mm-option-name">${t("menu.notInList")}</span>
          <span class="mm-option-desc">${t("menu.notInListDesc")}</span>
        </button>
        <button class="mm-save-btn" type="button" data-players="back">${t("menu.back")}</button>
      </div>
      <div class="mm-view-profile">
        <div class="mm-panel-title mm-profile-title">${t("menu.player")}</div>
        <button class="mm-option" type="button" data-profile="play">
          <span class="mm-option-name">${t("menu.play")}</span>
          <span class="mm-option-desc">${t("menu.playDesc")}</span>
        </button>
        <button class="mm-option" type="button" data-profile="achievements">
          <span class="mm-option-name">${t("menu.achievements")}</span>
          <span class="mm-option-desc">${t("menu.achievementsDesc")}</span>
        </button>
        <button class="mm-save-btn" type="button" data-profile="back">${t("menu.back")}</button>
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
      loading.textContent = t("menu.loading");
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
    password: root.querySelector(".mm-view-password"),
    players: root.querySelector(".mm-view-players"),
    profile: root.querySelector(".mm-view-profile"),
  };
  const saveNote = root.querySelector(".mm-save-note");
  const nameInput = root.querySelector(".mm-name-input");
  const nameTitle = root.querySelector(".mm-name-title");
  const nameNote = root.querySelector(".mm-name-note");
  const passwordInput = root.querySelector(".mm-password-input");
  const passwordTitle = root.querySelector(".mm-password-title");
  const passwordNote = root.querySelector(".mm-password-note");
  const playersList = root.querySelector(".mm-players-list");
  let achScreen = null;
  let currentPlayerName = null;
  let nameConfirm = null; // callback(name) da tela de nome atual

  function showScreen(which) {
    for (const [k, el] of Object.entries(views)) el.classList.toggle("on", k === which);
    views.modes.style.display = which === "modes" ? "" : "none";
    if (which === "game") {
      const has = hasAnySave();
      views.game.querySelector('[data-game="continue"]').style.display = ""; // Sempre visível para permitir carregar local ou da nuvem (Abra API)
      views.game.querySelector('[data-game="export"]').style.display = has ? "" : "none";
      saveNote.textContent = "";
    }
    if (which === "profile") {
      root.querySelector(".mm-profile-title").textContent = t("menu.profileName", { name: currentPlayerName });
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
      nameNote.textContent = t("menu.nameTooShort");
      return;
    }
    nameConfirm?.(name);
  }
  root.querySelector('[data-name="ok"]').addEventListener("click", submitName);
  root.querySelector('[data-name="cancel"]').addEventListener("click", () => showScreen("game"));
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
  });

  // tela de SENHA reutilizável: título + placeholder + callback ao confirmar
  let passwordConfirm = null;
  let passwordCancel = null;
  function askPassword(title, placeholder, onConfirm, onCancel) {
    passwordTitle.textContent = title;
    passwordInput.value = "";
    passwordInput.placeholder = placeholder;
    passwordNote.textContent = "";
    passwordConfirm = onConfirm;
    passwordCancel = onCancel || (() => showScreen("game"));
    showScreen("password");
    setTimeout(() => passwordInput.focus(), 60);
  }
  function submitPassword() {
    const pwd = passwordInput.value.trim();
    if (pwd.length < 4) {
      passwordNote.textContent = t("menu.passwordTooShort");
      return;
    }
    passwordConfirm?.(pwd);
  }
  root.querySelector('[data-password="ok"]').addEventListener("click", submitPassword);
  root.querySelector('[data-password="cancel"]').addEventListener("click", () => passwordCancel?.());
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPassword();
  });

  root.querySelector('[data-mode="exploration"]').addEventListener("click", () => launch("exploration"));
  root.querySelector('[data-mode="game"]').addEventListener("click", () => showScreen("game"));
  root.querySelector('[data-mode="trailer"]')?.addEventListener("click", () => launch("trailer"));
  views.game.querySelector('[data-game="back"]').addEventListener("click", () => showScreen("modes"));

  // NOVO JOGO: pede um nome; se já existe (ou há legado), confirma sobrescrever
  views.game.querySelector('[data-game="new"]').addEventListener("click", () => {
    askName("Nome do jogador", "Como quer ser chamado?", (name) => {
      const overwrites = hasPlayer(name) || (legacySaveExists() && !listPlayers().length);
      if (overwrites && !confirm(`Isso apaga o save de "${name}". Continuar?`)) return;
      
      askPassword("Crie uma senha para seu save", "Escolha uma senha", (password) => {
        if (legacySaveExists()) migrateLegacyTo(name); // some com o legado sem nome
        addPlayer(name);
        launch("game", { resume: false, playerName: name, playerPassword: password });
      }, () => showScreen("game"));
    });
  });

  // CONTINUAR: escolher jogador (ou batizar o legado sem nome na 1ª vez)
  views.game.querySelector('[data-game="continue"]').addEventListener("click", () => {
    if (!listPlayers().length && legacySaveExists()) {
      askName("Dê um nome ao seu jogo salvo", "Nome do jogador", (name) => {
        askPassword("Crie uma senha para seu save", "Escolha uma senha", (password) => {
          migrateLegacyTo(name); // move o save legado → moon.save::<name>
          
          // E bota a senha no save recém migrado
          const sm = createPlayerSave(name);
          const save = sm.load();
          if (save) {
            save.player = save.player || {};
            save.player.password = password;
            sm.saveNow();
          }
          launch("game", { resume: true, playerName: name });
        }, () => showScreen("game"));
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
      btn.addEventListener("click", () => {
        const sm = createPlayerSave(p.name);
        const save = sm.load();
        if (save) {
          if (save.player && save.player.password) {
            askPassword("Digite a senha do seu save", "Senha", (pwd) => {
              if (pwd === save.player.password) {
                currentPlayerName = p.name;
                showScreen("profile");
              } else {
                passwordNote.textContent = t("menu.wrongPassword");
              }
            }, () => showScreen("players"));
          } else {
            askPassword("Crie uma senha para seu save", "Escolha uma senha", (pwd) => {
              save.player = save.player || {};
              save.player.password = pwd;
              sm.saveNow();
              currentPlayerName = p.name;
              showScreen("profile");
            }, () => showScreen("players"));
          }
        } else {
          currentPlayerName = p.name;
          showScreen("profile");
        }
      });
      playersList.appendChild(btn);
    }
  }
  views.players.querySelector('[data-players="back"]').addEventListener("click", () => showScreen("game"));

  // "Não estou na lista": digita o nome e BAIXA o save da nuvem (abra-api)
  views.players.querySelector('[data-players="other"]').addEventListener("click", () => {
    askName(t("menu.loadFromCloud"), t("menu.savedPlayerName"), async (name) => {
      nameNote.textContent = t("menu.searchingCloud");
      const remote = await pullSave(name);
      if (!remote) {
        nameNote.textContent = t("menu.noCloudSave", { name });
        return;
      }
      
      const save = remote.save;
      if (save && save.player && save.player.password) {
        askPassword("Digite a senha do save online", "Senha", (pwd) => {
          if (pwd === save.player.password) {
            new LocalStorageBackend(saveKeyFor(name)).write(JSON.stringify(save, null, 2));
            addPlayer(name);
            currentPlayerName = name;
            showScreen("profile");
          } else {
            passwordNote.textContent = t("menu.wrongPassword");
          }
        }, () => showScreen("players"));
      } else {
        askPassword("Crie uma senha para este save", "Escolha uma senha", (pwd) => {
          save.player = save.player || {};
          save.player.password = pwd;
          
          new LocalStorageBackend(saveKeyFor(name)).write(JSON.stringify(save, null, 2));
          addPlayer(name);
          
          const sm = createPlayerSave(name);
          sm.load();
          sm.saveNow();
          
          currentPlayerName = name;
          showScreen("profile");
        }, () => showScreen("players"));
      }
    });
  });

  // BOTOES DE PERFIL (JOGAR / CONQUISTAS)
  views.profile.querySelector('[data-profile="play"]').addEventListener("click", async (e) => {
    if (currentPlayerName) {
      const name = currentPlayerName;
      const btn = e.currentTarget;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = t("menu.syncingSave");

      try {
        const remote = await pullSave(name);
        if (remote && remote.save) {
          const localBackend = new LocalStorageBackend(saveKeyFor(name));
          const localText = localBackend.read();
          let localSave = null;
          try { localSave = localText ? JSON.parse(localText) : null; } catch (err) {}

          const remoteUpdate = remote.save.meta?.updatedAt;
          const localUpdate = localSave?.meta?.updatedAt;

          if (remoteUpdate && (!localUpdate || new Date(remoteUpdate) > new Date(localUpdate))) {
            localBackend.write(JSON.stringify(remote.save, null, 2));
          }
        }
      } catch (err) {
        console.warn("Erro ao sincronizar com a nuvem ao iniciar jogo:", err);
      }

      btn.textContent = originalText;
      btn.disabled = false;
      launch("game", { resume: true, playerName: name });
    }
  });

  views.profile.querySelector('[data-profile="achievements"]').addEventListener("click", () => {
    if (currentPlayerName) {
      const sm = createPlayerSave(currentPlayerName);
      sm.load();
      if (!achScreen) achScreen = new AchievementsScreen({ save: sm, catalog: new Map(buildCatalog().map((i) => [i.id, i])) });
      else achScreen.save = sm;
      achScreen.open();
    }
  });

  views.profile.querySelector('[data-profile="back"]').addEventListener("click", () => {
    showScreen("players");
  });

  // EXPORTAR/IMPORTAR: opera no 1º jogador (ou legado)
  function currentBackendKey() {
    const first = listPlayers()[0];
    return first ? saveKeyFor(first.name) : "moon.save.v1";
  }
  views.game.querySelector('[data-game="export"]').addEventListener("click", () => {
    const sm = new SaveManager(new LocalStorageBackend(currentBackendKey()));
    saveNote.textContent = sm.exportToFile() ? t("menu.saveExported") : t("menu.noSaveExport");
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
        saveNote.textContent = ok ? t("menu.saveImported") : t("menu.fileInvalid");
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
        saveNote.textContent = t("menu.missionReset", { id: missionId });
      } else {
        saveNote.textContent = t("menu.missionNotFound", { id: missionId });
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
