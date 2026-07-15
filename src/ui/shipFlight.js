// Nave estilo "Star Fox" para o modo real: voo em 3ª pessoa com a câmera atrás.
// Aparece ao acelerar (W / ↑) — e aí o menu de planetas some, deixando só a nave
// na cena. Esc faz a nave sumir e o menu voltar.
//
// TRAVA DE REFERENCIAL: no modo real os planetas viajam rápido pela cena
// (Júpiter ~30 u/s). A cada frame deslocamos a nave junto com o movimento orbital
// do planeta focado, deixando-o "parado" ao lado — você voa no espaço local dele.
// Por cima, a GRAVIDADE do planeta puxa a velocidade (leitura velocidade vs fuga).
//
// COLISÃO: chegar perto demais do Sol / gigantes gasosos / rochosos = explosão de
// partículas e volta à tela inicial. A Terra é especial: abre "Entrar em órbita?"
// e uma barreira mantém a nave fora.
//
// Controles 6DoF (Six Degrees of Freedom — estilo Descent/Elite/Everspace):
//   W = empuxo à frente · S = empuxo à ré · Shift+W = boost
//   A/D (ou ←/→) = yaw (guinada) · ↑/↓ ou X/Z = pitch (cabrar/picar)
//   Q/E = roll (giro das asas, igual um caça — fica de cabeça pra baixo) · Esc sai
// Toda rotação é acumulativa nos EIXOS LOCAIS da nave via quaternion: não há
// autoalinhamento nem "up" global. Velocidade e rotação têm inércia (arrasto
// espacial suave). O movimento segue sempre o vetor forward local atual.

import * as THREE from "three";
import { t, getLang } from "../core/i18n.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture, warpRingTexture } from "../core/textures.js";

const NAV_KEYS = new Set([
  "KeyW", "KeyS", "KeyA", "KeyD", "KeyX", "KeyZ", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
]);

const SHIP_SIZE = 0.06; // fração de unidade (1 unidade = 1 raio terrestre no real)
// ao pilotar, o planeta focado cresce: vira gigante (nave = grão de areia). Tamanho
// mínimo gigante pra os pequenos (Marte/Mercúrio) também terem folga pra navegar.
const APPROACH_MUL = 40;
const MIN_APPROACH_R = 60;
const KM_PER_UNIT = 6371; // 1 unidade = 1 raio terrestre (modo real)
const C_KM_S = 299792.458; // velocidade da luz, p/ mostrar % da luz
const REVERSE_REL_SPEED_FOR_LIGHT = 0.002; // abaixo disso, ré nunca mostra % da luz
const OBJECT_LOCK_BREAK_SECS = 2.0;
const OBJECT_LOCK_DOT_MIN = 0.94;
const OBJECT_LOCK_DIST = 18;

// suaviza 0→1 (acelera no início, desacelera no fim) para a entrada cinematográfica
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// velocidade legível: % da luz + km/s (a medida interna em u/s não diz nada)
function formatSpeed(unitsPerSec) {
  const kms = Math.abs(unitsPerSec) * KM_PER_UNIT;
  const lang = getLang();
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const kmsFmt = Math.round(kms).toLocaleString(locale);
  const pctC = (kms / C_KM_S) * 100;
  if (pctC >= 0.05) return t("ship.speedOfLight", { pct: pctC.toFixed(1), kms: kmsFmt });
  return `${kmsFmt} km/s`;
}

function formatSpeedForwardOnly(unitsPerSec) {
  const kms = Math.abs(unitsPerSec) * KM_PER_UNIT;
  const lang = getLang();
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const kmsFmt = Math.round(kms).toLocaleString(locale);
  const pctC = (kms / C_KM_S) * 100;
  if (unitsPerSec <= 0 || pctC < REVERSE_REL_SPEED_FOR_LIGHT) return `${kmsFmt} km/s`;
  return formatSpeed(unitsPerSec);
}

function buildShipModel() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xaeb9c6, metalness: 0.6, roughness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x3b7fd4, metalness: 0.5, roughness: 0.4, emissive: 0x0f2c52, emissiveIntensity: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232a33, metalness: 0.7, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.15, 18), hull);
  body.rotation.x = -Math.PI / 2;
  g.add(body);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), accent);
  cockpit.position.set(0, 0.09, -0.12);
  cockpit.scale.set(1, 0.7, 1.5);
  g.add(cockpit);

  const wingGeo = new THREE.BoxGeometry(0.95, 0.04, 0.34);
  const wingL = new THREE.Mesh(wingGeo, accent);
  wingL.position.set(-0.5, 0, 0.2);
  wingL.rotation.set(0, 0.2, 0.14);
  const wingR = wingL.clone();
  wingR.position.x = 0.5;
  wingR.rotation.set(0, -0.2, -0.14);
  g.add(wingL, wingR);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.34), hull);
  fin.position.set(0, 0.14, 0.42);
  g.add(fin);

  const engGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.22, 14);
  const engL = new THREE.Mesh(engGeo, dark);
  engL.rotation.x = Math.PI / 2;
  engL.position.set(-0.2, 0, 0.52);
  const engR = engL.clone();
  engR.position.x = 0.2;
  g.add(engL, engR);

  return g;
}

export class ShipFlight {
  constructor(scene, camera, controls, { onEngage, onDisengage, onDestroyed, getReferenceBody, getBodies, getEntryInfo, canDisengage = true } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.onEngage = onEngage;
    this.onDisengage = onDisengage;
    this.onDestroyed = onDestroyed;
    this.canDisengage = canDisengage; // false no Game Mode: não existe câmera de observação pra "sair" da nave
    this.getReferenceBody = getReferenceBody;
    this.getBodies = getBodies; // todos os corpos (navegação, colisão, escala)
    this.getEntryInfo = getEntryInfo; // entrada por corpo: { mul, dir } (cinturões no caminho)

    this.enabled = false;
    this.active = false;
    this.intro = null; // fase de entrada cinematográfica (câmera assenta atrás da nave)
    this.exploding = false;
    this.explosion = null;
    this.keys = new Set();
    this.referenceBody = null;
    this._approachBody = null; // corpo atualmente ampliado (gigante) ao nos aproximarmos
    this._hiddenMoons = []; // luas escondidas do corpo gigante durante o voo
    this._wasInDangerZone = true; // inicia true para não desativar o supercruise no spawn

    // --- empuxo linear: escalar com inércia + DIREÇÃO que segue o nariz -------
    this.maxSpeed = 3.3; // cruzeiro ~7% da luz
    this.boostSpeed = 14; // boost ~30% da luz (Shift+W)
    this.accel = 3.2; // ganho/perda do empuxo (escalar)
    this.reverseFrac = 1 / 192; // ré no máximo 1/192 do avanço (mais controle em aproximações finas)
    this.speedDrag = 0.12; // arrasto espacial leve ao soltar (coast longo)
    this.velAlign = 2.6; // rapidez com que a velocidade gira p/ o forward (inércia/drift)
    this.gravity = 4; // suave (com planeta gigante, gravidade ~r² ficaria brutal)
    this.speed = 0; // módulo do empuxo (com sinal: ré é negativo)

    // --- supercruise (Shift+W em espaço aberto): teto escala com a distância ---
    // ao corpo mais próximo. Longe de tudo = muito rápido; perto = freia sozinho
    // (mantém a escala real e evita atravessar o planeta num frame).
    this.supercruiseGain = 0.5; // u/s de teto por unidade de distância à superfície
    this.supercruiseMax = 3000; // teto absoluto (~Sol alcançável em ~10–15 s)
    this.scAccel = 1.5; // rampa do empuxo até o teto de supercruise (spool-up)
    this.brakeAccel = 400; // frenagem de segurança: desaceleração ao detectar impacto
    this._braking = false; // estado do auto-brake (p/ HUD/readout)

    // --- rotação 6DoF (rad/s, eixos locais, com inércia) ---------------------
    this.pitchRate = 1.6; // cabrar/picar (local X)
    this.yawRate = 1.5; // guinada (local Y)
    this.rollRate = 2.8; // giro das asas (local Z) — caça rola rápido e visível
    this.turnAttack = 8; // rampa firme ao apertar a tecla
    this.turnRelease = 1.6; // decaimento ao soltar (deixa "girar de inércia")
    this.brakeDamp = 120; // Ctrl = freio inercial instantâneo (zera a deriva rápido)
    this.reverseAccelMul = 0.015625; // ré mais delicada: 1/64 da aceleração atual

    // --- câmera 3ª pessoa (orientação EXATA da nave, inclui roll) -------------
    this.trailBack = 0.5;
    this.trailUp = 0.18;
    this.lookAhead = 2.2;
    this.camLag = 8; // suavização da POSIÇÃO da câmera
    this.camTurnLag = 12; // suavização da ORIENTAÇÃO (alta = quase travada no quaternion)

    this.velocity = new THREE.Vector3(); // linear, espaço-mundo, persistente
    this.angVel = new THREE.Vector3(); // angular local: x=pitch, y=yaw, z=roll

    this.ship = new THREE.Group();
    this.ship.scale.setScalar(SHIP_SIZE);
    this.ship.visible = false;
    this.model = new THREE.Group();
    const procShip = buildShipModel(); // fallback até o GLB carregar (ou se falhar)
    this.model.add(procShip);
    this.ship.add(this.model);
    this._loadShipModel(procShip);

    this.engineGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#86d6ff"), color: 0x9fe6ff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.engineGlow.position.set(0, 0, 0.7);
    this.model.add(this.engineGlow);
    scene.add(this.ship);

    // camada de ar superaquecido: brilha no lado da nave voltado pro planeta
    // quando chega perto demais (atrito atmosférico, prenúncio da explosão)
    this.heat = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#ff7a2a"), color: 0xff4d12, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      })
    );
    this.heat.visible = false;
    scene.add(this.heat);

    // partículas de velocidade: poeira/estrelas passando voando perto da nave
    // (só aparecem em alta velocidade). Estáticas no mundo; a nave as atravessa.
    this.streakCount = 50;
    this.streakPos = new Float32Array(this.streakCount * 3);
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute("position", new THREE.BufferAttribute(this.streakPos, 3));
    this.streaks = new THREE.Points(
      streakGeo,
      new THREE.PointsMaterial({
        color: 0xbfe0ff, size: 0.012, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    scene.add(this.streaks);

    // faíscas leves que de vez em quando raspam na lateral (sem dano)
    this.sparks = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: radialGlowTexture("#fff2c2"), color: 0xffcf6a, transparent: true,
          opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      s.visible = false;
      scene.add(s);
      this.sparks.push({ sprite: s, life: 0 });
    }

    // --- rastro de dobra (supercruise) ---------------------------------------
    // Em supercruise a nave voa tão rápido que não sobra referência visual de
    // movimento. O rastro devolve a sensação: ANÉIS de distorção (o espaço
    // "vincado" pela bolha de dobra) se materializam à frente no rumo do voo,
    // a nave os atravessa e eles ficam pra trás formando um trilho, ligados por
    // um traço de luz contínuo — tipo +----+----+ [nave]>.
    this.warpRings = [];
    const warpTex = warpRingTexture();
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: warpTex, color: 0xbfd8ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.warpRings.push({ mesh, age: 0, ttl: 0, spin: 0, base: 1 });
    }
    this.warpLead = 0.9; // anel nasce ~0.9 s de voo à frente (tamanho angular constante)
    this.warpEvery = 0.33; // cadência de anéis novos
    this._warpT = this.warpEvery;

    // traço contínuo do rastro: linha aditiva que esmaece com a idade dos pontos
    this.trailMax = 90;
    this.trailTtl = 4; // segundos até um ponto do traço apagar
    this.trailEvery = 0.08; // intervalo entre pontos fixados (o último gruda na nave)
    this._trailT = 0;
    this.trailPts = []; // { pos, age, gap } — gap = ponto apagado que quebra a linha
    const trailGeo = new THREE.BufferGeometry();
    this._trailPos = new Float32Array(this.trailMax * 3);
    this._trailCol = new Float32Array(this.trailMax * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(this._trailPos, 3));
    trailGeo.setAttribute("color", new THREE.BufferAttribute(this._trailCol, 3));
    this.warpTrail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.warpTrail.frustumCulled = false;
    this.warpTrail.visible = false;
    scene.add(this.warpTrail);

    // a mira de distância foi substituída pela NavigationHud (marcadores espaciais)
    this.readout = document.createElement("div");
    this.readout.className = "ship-readout";
    this.readout.style.display = "none";
    document.body.appendChild(this.readout);

    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._tmp3 = new THREE.Vector3();
    this._refPos = new THREE.Vector3();
    this._prevRef = new THREE.Vector3();
    this._toPlanet = new THREE.Vector3();
    this._desiredVel = new THREE.Vector3();
    this._m = new THREE.Matrix4(); // orientação da nave (lookAt sem depender do matrixWorld)
    this._worldUp = new THREE.Vector3(0, 1, 0);
    this._zAxis = new THREE.Vector3(0, 0, 1);
    this._refDelta = new THREE.Vector3(); // deslocamento do referencial neste frame (p/ o rastro)

    this.objectLock = null; // automira contextual em objetos/interações
    this._lockForward = new THREE.Vector3();
    this._lockTargetPos = new THREE.Vector3();
    this._lockBreakHold = 0;

    window.addEventListener("keydown", (e) => this._onKeyDown(e));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  // carrega a nave 3D (GLB leve). Centraliza, gira o nariz pra -Z, escala pra
  // caber no enquadramento da master e troca a procedural. Se falhar, mantém ela.
  _loadShipModel(fallback) {
    new GLTFLoader().load(
      "models/Spaceship.glb",
      (gltf) => {
        const s = gltf.scene;
        const box = new THREE.Box3().setFromObject(s);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        s.position.sub(center);
        s.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material.metalness = Math.min(o.material.metalness ?? 0, 0.35);
            if (o.material.roughness == null) o.material.roughness = 0.6;
          }
        });
        const fix = new THREE.Group();
        fix.add(s);
        fix.rotation.y = Math.PI; // o modelo tem o nariz em +Z; nossa convenção é -Z
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        fix.scale.setScalar(1.6 / maxDim); // ~equivalente ao tamanho da procedural
        this.model.remove(fallback);
        this.model.add(fix);
        this.engineGlow.position.set(0, 0, (size.z * (1.6 / maxDim)) / 2 + 0.1);
      },
      undefined,
      () => {}
    );
  }

  get isActive() {
    return this.active || this.exploding;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.disengage();
  }

  _onKeyDown(e) {
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.code === "Escape") {
      if (this.canDisengage && (this.active || this.exploding)) this.disengage();
      return;
    }
    if (!NAV_KEYS.has(e.code)) return;
    e.preventDefault();
    this.keys.add(e.code);
    if (this.enabled && !this.active && !this.exploding && (e.code === "KeyW" || e.code === "ArrowUp")) this.engage();
  }

  setObjectLock(lock) {
    this.objectLock = lock || null;
    this._lockBreakHold = 0;
  }

  clearObjectLock() {
    this.objectLock = null;
    this._lockBreakHold = 0;
  }

  engage() {
    if (this.active) return;
    this.active = true;
    this.ship.visible = true;
    this.readout.style.display = "";
    this.controls.enabled = false;
    this.camera.up.set(0, 1, 0); // intro cinematográfica usa up global; o voo assume o local depois
    this._baseFov = this.camera.fov; // p/ o "punch" de FOV com a velocidade (restaura ao sair)

    this.referenceBody = this.getReferenceBody ? this.getReferenceBody() : null;
    if (this.referenceBody) this.referenceBody.worldPosition(this._prevRef);

    // eixos da câmera no momento de iniciar
    this._fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion); // frente
    this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion); // cima
    this._tmp.set(1, 0, 0).applyQuaternion(this.camera.quaternion); // direita

    // Distância de sobrevoo: longe o bastante pra dar tempo de navegar e admirar
    // o planeta antes de qualquer colisão (escala com o raio do corpo). A nave
    // nasce ENTRE a câmera e o planeta, deslocada pro lado/baixo (entra no quadro).
    if (this.referenceBody) {
      // ENTRADA (teleporte do modo observação): aqui o planeta já nasce gigante
      // de uma vez — o spawn é calculado em cima do approachRadius final. A
      // aproximação GRADUAL (voar até um corpo e vê-lo crescer) fica no voo,
      // em _updateApproachScaling.
      this._setApproachBody(this.referenceBody, this._giantMul(this.referenceBody));
      this.referenceBody.worldPosition(this._refPos);
      // nasce bem fora; corpos com cinturão no caminho usam { mul, dir } próprios:
      // mul empurra o spawn e dir FIXA o lado de entrada (alinhado ao cinturão,
      // que fica sempre à frente). Só muda o PONTO de entrada — a aproximação
      // (LOD/escala/textura) continua idêntica.
      const entry = this.getEntryInfo ? this.getEntryInfo(this.referenceBody.id) : null;
      const approach = this.referenceBody.approachRadius * (entry?.mul ?? 2.4) + 2;
      if (entry?.dir) this._toPlanet.set(entry.dir[0], entry.dir[1], entry.dir[2]);
      else this._toPlanet.copy(this.camera.position).sub(this._refPos); // planeta -> câmera
      if (this._toPlanet.lengthSq() < 1e-4) this._toPlanet.copy(this._fwd).negate();
      this._toPlanet.normalize();
      this.ship.position
        .copy(this._refPos)
        .addScaledVector(this._toPlanet, approach)
        .addScaledVector(this._tmp, approach * 0.18)
        .addScaledVector(this._up, -approach * 0.08);
    } else {
      this.ship.position
        .copy(this.camera.position)
        .addScaledVector(this._fwd, 10)
        .addScaledVector(this._tmp, 3);
    }

    // orienta o nariz (-Z) da nave para o planeta — via Matrix4 (independe do
    // matrixWorld estar atualizado neste frame). Sem planeta, alinha à câmera.
    if (this.referenceBody) {
      // Matrix4.lookAt(eye, target, up): +Z = normalize(eye - target);
      // como o nariz é -Z, isso deixa o nariz apontando para o planeta.
      this._m.lookAt(this.ship.position, this._refPos, this._worldUp);
      this.ship.quaternion.setFromRotationMatrix(this._m);
    } else {
      this.ship.quaternion.copy(this.camera.quaternion);
    }

    this.speed = 0;
    this.angVel.set(0, 0, 0);
    this.model.rotation.set(0, 0, 0); // a orientação real vive em this.ship; o modelo fica neutro
    this.velocity.set(0, 0, 0);
    this._initStreaks();

    // tween de entrada: começa de um ponto seguro ATRÁS da nave (a pose antiga,
    // de foco, cairia DENTRO do planeta que está crescendo pra gigante).
    let fromPos, fromTgt;
    if (this.referenceBody) {
      const a = this.referenceBody.approachRadius;
      fromPos = this._tmp2
        .copy(this.ship.position)
        .addScaledVector(this._toPlanet, a * 0.6)
        .addScaledVector(this._worldUp, a * 0.2)
        .clone();
      fromTgt = this._refPos.clone();
    } else {
      fromPos = this.camera.position.clone();
      fromTgt = this.controls.target.clone();
    }
    this.intro = { t: 0, dur: 2.2, glideSpeed: 0.4, fromPos, fromTgt };

    if (this.onEngage) this.onEngage();
  }

  // devolve qualquer corpo ampliado ao tamanho normal (mostra as luas de volta)
  _restoreApproach() {
    this._setApproachBody(null);
  }

  // multiplicador "gigante" de um corpo (mín. grande pros pequenos)
  _giantMul(body) {
    const base = body.baseRadius || 1;
    return Math.max(APPROACH_MUL, MIN_APPROACH_R / base);
  }

  // raio "gigante" que um corpo terá ao ampliarmos por completo
  _giantRadius(body) {
    return (body.baseRadius || 1) * this._giantMul(body);
  }

  // Marca UM corpo como "em aproximação" (esconde as luas dele — seriam
  // engolidas pelo planeta crescendo) e restaura o anterior. O multiplicador de
  // escala é passado por quem chama: o engage manda o gigante COMPLETO (spawn é
  // calculado no tamanho final); o voo manda o valor GRADUAL da distância.
  // Passar null restaura o atual.
  _setApproachBody(body, mul = null) {
    if (this._approachBody !== body) {
      if (this._approachBody) {
        this._approachBody.setApproach(1);
        for (const m of this._hiddenMoons) m.mesh.visible = true;
        this._hiddenMoons = [];
      }
      this._approachBody = body;
      for (const m of body?.moons || []) {
        const giantRadius = (body.baseRadius || 1) * Math.max(40, 60 / (body.baseRadius || 1));
        const moonDist = m.pivot.position.x;
        if (moonDist < giantRadius * 1.2) {
          if (m.mesh.visible) {
            m.mesh.visible = false;
            this._hiddenMoons.push(m);
          }
        }
      }
    }
    if (body && mul != null) body.setApproach(mul);
  }

  // Aproximação dinâmica GRADUAL: o corpo mais próximo cresce CONTINUAMENTE
  // conforme a distância ao centro cai — nada de pular pra gigante num limiar.
  // O crescimento começa longe (start, ~da distância dos cinturões o planeta já
  // vem inchando na tela) e completa pouco antes do sobrevoo (full), com
  // smoothstep nas duas pontas. Função contínua da distância = sem histerese e
  // sem piscar; o easing temporal já existe em body.update (_approachMul) —
  // aqui só movemos o ALVO. Afastar-se desfaz o crescimento na mesma curva.
  _updateApproachScaling(body, dist) {
    if (this._approachBody && this._approachBody !== body) this._setApproachBody(null);
    if (!body) return;
    const gr = this._giantRadius(body);
    const start = gr * 9;
    const full = gr * 2.8;
    const t = THREE.MathUtils.clamp((start - dist) / (start - full), 0, 1);
    if (t <= 0.001) {
      if (this._approachBody === body) this._setApproachBody(null); // longe: normal
      return;
    }
    const e = t * t * (3 - 2 * t); // smoothstep
    this._setApproachBody(body, 1 + (this._giantMul(body) - 1) * e);
  }

  disengage() {
    if (!this.active && !this.exploding) return;
    if (this.exploding) this._cleanupExplosion();
    this.active = false;
    this.intro = null;
    this.ship.visible = false;
    this._hideFx();
    this._restoreApproach();
    this.readout.style.display = "none";
    this.clearObjectLock();
    this.velocity.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.camera.up.set(0, 1, 0); // devolve o up global pro OrbitControls (após rolls)
    if (this._baseFov) { this.camera.fov = this._baseFov; this.camera.updateProjectionMatrix(); }
    this.controls.target.copy(this.ship.position);
    this.controls.enabled = true;
    if (this.onDisengage) this.onDisengage();
  }

  // --- destruição (Sol / gigantes / rochosos) -------------------------------
  explode() {
    this.active = false;
    this.exploding = true;
    this.ship.visible = false;
    this._hideFx();
    this._restoreApproach();
    this.readout.style.display = "none";
    this.clearObjectLock();
    this.camera.up.set(0, 1, 0); // a câmera de explosão/OrbitControls usa up global
    if (this._baseFov) { this.camera.fov = this._baseFov; this.camera.updateProjectionMatrix(); }

    const grp = new THREE.Group();
    grp.position.copy(this.ship.position);

    const N = 180;
    const positions = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      vels.push(dir.multiplyScalar(0.3 + Math.random() * 0.9));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffae3a, size: 0.05, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    grp.add(points);

    const fire = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#ffcc55"), color: 0xff7a22, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    fire.scale.setScalar(0.35);
    grp.add(fire);

    this.scene.add(grp);
    this.explosion = { grp, points, mat, fire, vels, age: 0, ttl: 2.4, ref: this.referenceBody, prevRef: this._prevRef.clone() };
  }

  _cleanupExplosion() {
    if (this.explosion) {
      this.scene.remove(this.explosion.grp);
      this.explosion.points.geometry.dispose();
      this.explosion.mat.dispose();
      this.explosion = null;
    }
    this.exploding = false;
  }

  _updateExplosion(dt) {
    const ex = this.explosion;
    ex.age += dt;
    // segue o referencial do planeta (debris fica junto do planeta em movimento)
    if (ex.ref) {
      ex.ref.worldPosition(this._refPos);
      this._tmp.copy(this._refPos).sub(ex.prevRef);
      ex.grp.position.add(this._tmp);
      ex.prevRef.copy(this._refPos);
    }
    const t = ex.age / ex.ttl;
    const pos = ex.points.geometry.attributes.position;
    for (let i = 0; i < ex.vels.length; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + ex.vels[i].x * dt,
        pos.getY(i) + ex.vels[i].y * dt,
        pos.getZ(i) + ex.vels[i].z * dt
      );
    }
    pos.needsUpdate = true;
    ex.mat.opacity = Math.max(0, 1 - t);
    ex.fire.scale.setScalar(0.35 * (1 + t * 1.8));
    ex.fire.material.opacity = Math.max(0, 1 - t * 1.3);
    this.camera.lookAt(ex.grp.position);

    if (ex.age >= ex.ttl) {
      this._cleanupExplosion();
      this.controls.enabled = true;
      if (this.onDestroyed) this.onDestroyed();
    }
  }

  // esconde todos os efeitos (partículas/faíscas/rastro de dobra) ao sair/explodir
  _hideFx() {
    this.heat.visible = false;
    this.streaks.visible = false;
    for (const s of this.sparks) {
      s.life = 0;
      s.sprite.visible = false;
    }
    this._resetWarpWake();
  }

  // apaga anéis e traço do rastro de dobra (saída, explosão, novo engage)
  _resetWarpWake() {
    this._warpT = this.warpEvery;
    this._trailT = 0;
    for (const r of this.warpRings) {
      r.ttl = 0;
      r.mesh.visible = false;
    }
    this.trailPts.length = 0;
    this.warpTrail.visible = false;
  }

  // um anel de distorção se materializa à frente, no rumo do voo — longe o
  // bastante pra nave levar ~warpLead s até atravessá-lo. O diâmetro escala com
  // essa distância, então todo anel nasce com o mesmo tamanho aparente na tela
  // e "cresce" conforme a nave chega — túnel de dobra em qualquer velocidade.
  _spawnWarpRing(sp) {
    const r = this.warpRings.find((x) => x.ttl <= 0);
    if (!r) return;
    const dir = this._tmp.copy(this.velocity).multiplyScalar(1 / (sp || 1));
    const lead = sp * this.warpLead;
    // leve desvio perpendicular: o trilho fica orgânico, não um túnel perfeito
    this._tmp2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    this._tmp2.addScaledVector(dir, -this._tmp2.dot(dir));
    r.mesh.position
      .copy(this.ship.position)
      .addScaledVector(dir, lead)
      .addScaledVector(this._tmp2, lead * 0.06);
    r.mesh.quaternion.setFromUnitVectors(this._zAxis, dir); // plano perpendicular ao voo
    r.base = Math.max(1.2, lead * 0.35);
    r.mesh.scale.setScalar(r.base);
    r.age = 0;
    r.ttl = this.warpLead + 2.4; // atravessa a nave e fica ~2.4 s no "retrovisor"
    r.spin = (Math.random() - 0.5) * 1.2; // giro lento dos nós de energia
    r.mesh.material.opacity = 0;
    r.mesh.visible = true;
  }

  // rastro de dobra: anéis que a nave atravessa + traço de luz que fica pra trás
  _updateWarpWake(dt, sp, supercruising) {
    const shift = this._refDelta; // o que ficou pra trás segue o referencial

    if (supercruising) {
      this._warpT += dt;
      if (this._warpT >= this.warpEvery) {
        this._warpT = 0;
        this._spawnWarpRing(sp);
      }
    } else {
      this._warpT = this.warpEvery; // ao reentrar, o primeiro anel sai na hora
    }

    for (const r of this.warpRings) {
      if (r.ttl <= 0) continue;
      r.mesh.position.add(shift);
      r.age += dt;
      if (r.age >= r.ttl) {
        r.ttl = 0;
        r.mesh.visible = false;
        continue;
      }
      const t = r.age / r.ttl;
      const fadeIn = Math.min(r.age / 0.35, 1); // materializa suave
      const fadeOut = Math.min((1 - t) / 0.3, 1);
      r.mesh.material.opacity = 0.9 * fadeIn * fadeOut;
      r.mesh.scale.setScalar(r.base * (1 + t * 0.5)); // o espaço "relaxa": anel abre devagar
      r.mesh.rotateZ(r.spin * dt);
    }

    // --- traço contínuo: pontos fixados no caminho, o último gruda na nave ----
    const pts = this.trailPts;
    for (const p of pts) {
      p.pos.add(shift);
      p.age += dt;
    }
    while (pts.length && pts[0].age >= this.trailTtl) pts.shift();

    if (supercruising) {
      const last = pts[pts.length - 1];
      if (!last || last.age > 0.5) {
        // (re)começando: se sobrou rastro velho, insere uma ponte APAGADA entre
        // ele e a posição atual — com blending aditivo, segmento preto é invisível
        if (last) {
          pts.push({ pos: last.pos.clone(), age: last.age, gap: true });
          pts.push({ pos: this.ship.position.clone(), age: 0, gap: true });
        }
        pts.push({ pos: this.ship.position.clone(), age: 0, gap: false });
        pts.push({ pos: this.ship.position.clone(), age: 0, gap: false });
        this._trailT = 0;
      } else {
        last.pos.copy(this.ship.position); // cabeça do traço colada na nave
        last.age = 0;
        this._trailT += dt;
        if (this._trailT >= this.trailEvery) {
          this._trailT = 0;
          pts.push({ pos: this.ship.position.clone(), age: 0, gap: false });
        }
      }
      while (pts.length > this.trailMax) pts.shift();
    }

    const n = pts.length;
    if (n >= 2) {
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        this._trailPos[i * 3] = p.pos.x;
        this._trailPos[i * 3 + 1] = p.pos.y;
        this._trailPos[i * 3 + 2] = p.pos.z;
        const a = p.gap ? 0 : Math.max(0, 1 - p.age / this.trailTtl) * 0.55;
        this._trailCol[i * 3] = 0.45 * a;
        this._trailCol[i * 3 + 1] = 0.75 * a;
        this._trailCol[i * 3 + 2] = a;
      }
      const geo = this.warpTrail.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, n);
      this.warpTrail.visible = true;
    } else {
      this.warpTrail.visible = false;
    }
  }

  // espalha as partículas num tubo à frente do nariz (prontas pra entrarem em quadro)
  _initStreaks() {
    for (let i = 0; i < this.streakCount; i++) this._respawnStreak(i * 3);
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }

  // recoloca uma partícula à frente da nave, espalhada num disco perpendicular
  _respawnStreak(ix) {
    this._fwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
    this._tmp.set(1, 0, 0).applyQuaternion(this.ship.quaternion); // direita
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.35 * (0.3 + Math.random() * 0.7);
    const a = 1.4 * (0.4 + Math.random() * 0.9);
    this._tmp3
      .copy(this.ship.position)
      .addScaledVector(this._fwd, a)
      .addScaledVector(this._tmp, Math.cos(ang) * rad)
      .addScaledVector(this._up, Math.sin(ang) * rad);
    this.streakPos[ix] = this._tmp3.x;
    this.streakPos[ix + 1] = this._tmp3.y;
    this.streakPos[ix + 2] = this._tmp3.z;
  }

  // poeira/estrelas passando: estáticas no mundo, recicladas quando ficam pra trás
  _updateStreaks(spN) {
    const op = THREE.MathUtils.clamp((spN - 0.45) / 0.55, 0, 1); // só em alta velocidade
    if (op <= 0.01) {
      this.streaks.visible = false;
      return;
    }
    this.streaks.visible = true;
    this.streaks.material.opacity = op * 0.8;
    for (let i = 0; i < this.streakCount; i++) {
      const ix = i * 3;
      this._tmp2.set(this.streakPos[ix], this.streakPos[ix + 1], this.streakPos[ix + 2]).sub(this.ship.position);
      const along = this._tmp2.dot(this._fwd);
      const perp2 = this._tmp2.lengthSq() - along * along;
      if (along < -0.6 || perp2 > 0.25) this._respawnStreak(ix); // passou: recicla à frente
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }

  // faísca leve ocasional raspando a lateral (cosmético, sem dano)
  _updateSparks(dt, spN) {
    if (spN > 0.6 && Math.random() < 0.05) {
      const s = this.sparks.find((x) => x.life <= 0);
      if (s) {
        this._tmp.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
        this._up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
        const side = Math.random() < 0.5 ? 1 : -1;
        s.sprite.position
          .copy(this.ship.position)
          .addScaledVector(this._tmp, side * SHIP_SIZE * 0.9)
          .addScaledVector(this._up, (Math.random() - 0.5) * SHIP_SIZE);
        s.life = 1;
        s.sprite.visible = true;
      }
    }
    for (const s of this.sparks) {
      if (s.life > 0) {
        s.life -= dt * 4;
        const l = Math.max(s.life, 0);
        s.sprite.material.opacity = l;
        s.sprite.scale.setScalar(0.012 + (1 - l) * 0.02);
        if (s.life <= 0) s.sprite.visible = false;
      }
    }
  }

  // Entrada cinematográfica: a nave plana devagar enquanto a câmera desliza,
  // com easing, da pose atual até ficar atrás e um pouco acima da nave, olhando
  // pro planeta (3ª pessoa "por cima do ombro"). O controle vai pro jogador no fim.
  _updateIntro(dt) {
    const intro = this.intro;
    intro.t += dt / intro.dur;
    const k = easeInOut(Math.min(intro.t, 1));

    // trava no referencial do planeta (ele orbita rápido no modo real)
    if (this.referenceBody) {
      this.referenceBody.worldPosition(this._refPos);
      this._tmp.copy(this._refPos).sub(this._prevRef);
      this.ship.position.add(this._tmp);
      this._prevRef.copy(this._refPos);
    }

    // a nave avança suavemente pelo nariz (entra em campo / se aproxima)
    this._fwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
    this.ship.position.addScaledVector(this._fwd, intro.glideSpeed * dt);

    this.engineGlow.scale.setScalar(0.45);
    this.engineGlow.material.opacity = 0.6;

    // pose-alvo de 3ª pessoa: atrás e um pouco acima, olhando à frente da nave
    this._up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
    this._tmp2
      .copy(this.ship.position)
      .addScaledVector(this._fwd, -this.trailBack)
      .addScaledVector(this._up, this.trailUp);
    this._tmp3.copy(this.ship.position).addScaledVector(this._fwd, this.lookAhead);

    this.camera.position.lerpVectors(intro.fromPos, this._tmp2, k);
    this.controls.target.lerpVectors(intro.fromTgt, this._tmp3, k);
    this.camera.lookAt(this.controls.target);

    this.readout.textContent = t("ship.approaching");

    if (intro.t >= 1) {
      // entrega o controle sem solavanco: já segue em frente na velocidade de cruzeiro
      this.intro = null;
      this.speed = intro.glideSpeed;
      this.velocity.copy(this._fwd).multiplyScalar(this.speed);
    }
  }

  // inércia angular: aproxima a velocidade angular do alvo com rampa firme ao
  // apertar a tecla e decaimento lento ao soltar — um toque rápido continua
  // girando um pouco antes de estabilizar (nunca volta a um eixo, só desacelera).
  _approachAngular(cur, target, dt) {
    const rate = Math.abs(target) > 1e-6 ? this.turnAttack : this.turnRelease;
    return THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-rate * dt));
  }

  update(dt) {
    if (this.exploding) {
      this._updateExplosion(dt);
      return;
    }
    if (this.intro) {
      this._updateIntro(dt);
      return;
    }
    if (!this.active) return;
    const k = this.keys;

    // 1) trava no referencial do planeta
    this._refDelta.set(0, 0, 0);
    if (this.referenceBody) {
      this.referenceBody.worldPosition(this._refPos);
      this._tmp.copy(this._refPos).sub(this._prevRef);
      this._refDelta.copy(this._tmp); // o rastro de dobra acompanha o mesmo referencial
      this.ship.position.add(this._tmp);
      this._prevRef.copy(this._refPos);
    }

      const shiftHeld = k.has("ShiftLeft") || k.has("ShiftRight");
      const ctrlHeld = k.has("ControlLeft") || k.has("ControlRight");
      const fwdKey = k.has("KeyW");
      const revKey = k.has("KeyS");
      let boosting = fwdKey && shiftHeld && !ctrlHeld;

    // sinais -1..1 por eixo de rotação (sem interferência entre eles)
    let pitchIn = 0, yawIn = 0, rollIn = 0;
    if (k.has("ArrowUp") || k.has("KeyX")) pitchIn += 1;   // cabra (nariz sobe)
    if (k.has("ArrowDown") || k.has("KeyZ")) pitchIn -= 1; // pica (nariz desce)
    if (k.has("KeyA") || k.has("ArrowLeft")) yawIn += 1;   // guina à esquerda
    if (k.has("KeyD") || k.has("ArrowRight")) yawIn -= 1;  // guina à direita
    if (k.has("KeyQ")) rollIn += 1;  // rola asas (sentido anti-horário visto de trás)
    if (k.has("KeyE")) rollIn -= 1;  // rola asas (sentido horário) — caça vira de ponta-cabeça

      const steerMag = Math.max(Math.abs(pitchIn), Math.abs(yawIn), Math.abs(rollIn));
      if (this.objectLock) {
        const getPos = this.objectLock.getWorldPosition;
        if (!getPos || boosting || !this.objectLock.active) {
          this.clearObjectLock();
        } else {
          getPos(this._lockTargetPos);
          this._lockForward.copy(this._lockTargetPos).sub(this.ship.position);
          const distLock = this._lockForward.length();
          if (distLock < 0.001 || distLock > (this.objectLock.maxDistance || OBJECT_LOCK_DIST)) {
            this.clearObjectLock();
          } else {
            this._lockForward.normalize();
            this._fwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
            const dot = this._fwd.dot(this._lockForward);
            if (dot < (this.objectLock.minDot || OBJECT_LOCK_DOT_MIN)) {
              this.clearObjectLock();
            } else if (steerMag > 0) {
              this._lockBreakHold += dt;
              if (this._lockBreakHold >= (this.objectLock.breakSecs || OBJECT_LOCK_BREAK_SECS)) {
                this.clearObjectLock();
              }
            } else {
              this._lockBreakHold = 0;
              this._up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
              this._m.lookAt(this.ship.position, this._lockTargetPos, this._up);
              this._tmpQ = this._tmpQ || new THREE.Quaternion();
              this._tmpQ.setFromRotationMatrix(this._m);
              this.ship.quaternion.slerp(this._tmpQ, Math.min(1, dt * 5));
            }
          }
        }
      }

      // 3) ATUALIZA AS VELOCIDADES ANGULARES (inércia: rampa firme ao apertar,
      //    decaimento lento ao soltar → toque rápido continua girando um pouco).
      this.angVel.x = this._approachAngular(this.angVel.x, pitchIn * this.pitchRate, dt);
      this.angVel.y = this._approachAngular(this.angVel.y, yawIn * this.yawRate, dt);
      this.angVel.z = this._approachAngular(this.angVel.z, rollIn * this.rollRate, dt);

      // 4) APLICA AS ROTAÇÕES VIA QUATERNION nos eixos LOCAIS (acumulativo, sem
      //    autoalinhamento, sem up global, sem gimbal lock). rotateX/Y/Z do three
      //    pós-multiplicam no quaternion → giro sempre relativo ao nariz atual.
      if (this.angVel.x) this.ship.rotateX(this.angVel.x * dt);
      if (this.angVel.y) this.ship.rotateY(this.angVel.y * dt);
      if (this.angVel.z) this.ship.rotateZ(this.angVel.z * dt);


    // 5) VELOCIDADE LINEAR — modelo "arcade com inércia": um ESCALAR de empuxo
    //    (aceleração + arrasto suaves) define o MÓDULO; a DIREÇÃO da velocidade é
    //    puxada continuamente para o forward atual da nave. Assim virar muda a
    //    rota de verdade, mas com inércia: ao girar, o momento "escorrega" e
    //    alcança a nova direção em ~1/velAlign s (sem ficar preso na rota antiga).
    // teto dinâmico (supercruise): perto de um corpo = boost normal; longe = voa
    // muito mais rápido. distância à SUPERFÍCIE do corpo mais próximo (Sol/planetas).
    let nearSurf = Infinity;
    let nearestBody = null;
    let nearestCenter = 0;
    if (this.getBodies) {
      for (const b of this.getBodies()) {
        if (b.mesh && !b.mesh.visible) continue; // pula luas escondidas (estão "dentro" do gigante)
        b.worldPosition(this._tmp2);
        const c = this._tmp2.distanceTo(this.ship.position);
        const d = c - b.radius;
        if (d < nearSurf) {
          nearSurf = d;
          nearestBody = b;
          nearestCenter = c;
        }
      }
    }
    if (!isFinite(nearSurf)) nearSurf = 0;
    nearSurf = Math.max(0, nearSurf);

    if (nearestBody) {
      const r = nearestBody.radius;
      if (nearestBody.id === "earth" || nearestBody.id === "moon") {
        const isCurrentlyInDangerZone = nearSurf < r * 3.5;
        
        // Se acabou de entrar na zona de perigo vindo de fora
        if (isCurrentlyInDangerZone && !this._wasInDangerZone) {
          nearestBody.worldPosition(this._tmp2);
          const toBody = new THREE.Vector3().copy(this._tmp2).sub(this.ship.position);
          toBody.normalize();
          const vIn = this.velocity.dot(toBody);
          // E está se aproximando no supercruise, corta a velocidade
          if (vIn > 0.05 && boosting) {
            this.speed = this.maxSpeed;
            boosting = false;
            // Zera a inércia do supercruise cortando a velocidade física instantaneamente
            this.velocity.copy(this._fwd).multiplyScalar(this.maxSpeed);
          }
        }
        
        this._wasInDangerZone = isCurrentlyInDangerZone;
      } else {
        this._wasInDangerZone = false;
      }
    } else {
      this._wasInDangerZone = false;
    }
    const scCap = THREE.MathUtils.clamp(
      this.boostSpeed + nearSurf * this.supercruiseGain, this.boostSpeed, this.supercruiseMax
    );

      if (ctrlHeld) {
        this.speed = 0;
        this.velocity.set(0, 0, 0);
        this.angVel.set(0, 0, 0);
      } else if (boosting) {

        // supercruise: spool-up rápido até o teto que escala com a distância
        this.speed = THREE.MathUtils.lerp(this.speed, scCap, 1 - Math.exp(-this.scAccel * dt));
      } else if (fwdKey) {
        this.speed += this.accel * dt;
      } else if (revKey) {
        this.speed -= this.accel * this.reverseAccelMul * dt;
      } else {
        this.speed *= Math.max(0, 1 - this.speedDrag * dt); // coast: arrasto leve
      }

    // sem boost, desacelera o excesso de volta ao cruzeiro (e o supercruise FREIA
    // sozinho ao se aproximar, pois scCap encolhe junto com nearSurf → não atravessa)
    const softCap = boosting ? scCap : this.maxSpeed;
    if (this.speed > softCap)
      this.speed = THREE.MathUtils.lerp(this.speed, softCap, 1 - Math.exp(-3 * dt));
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * this.reverseFrac, this.supercruiseMax);

    this._fwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion); // forward do quaternion, todo frame
    this._desiredVel.copy(this._fwd).multiplyScalar(this.speed);
    this.velocity.lerp(this._desiredVel, 1 - Math.exp(-this.velAlign * dt)); // direção segue o nariz

    // gravidade do corpo de REFERÊNCIA (puxa a velocidade; leitura órbita/fuga)
    let escapeSpeed = 0;
    if (this.referenceBody) {
      const r = this.referenceBody.radius;
      this._toPlanet.copy(this._refPos).sub(this.ship.position);
      const dist = this._toPlanet.length() || 1e-6;
      this._tmp3.copy(this._toPlanet).divideScalar(dist);
      const dd = Math.max(dist, r * 1.05);
      this.velocity.addScaledVector(this._tmp3, ((this.gravity * r * r) / (dd * dd)) * dt);
      escapeSpeed = r * Math.sqrt((2 * this.gravity) / dd);
    }

    // CORPO MAIS PRÓXIMO (qualquer um — referência ou não): escala de aproximação,
    // frenagem de segurança, colisão e calor. Sem caso especial (a Terra é igual).
    this._braking = false;
    if (nearestBody) {
      const r = nearestBody.radius;
      const dist = nearestCenter || 1e-6;
      nearestBody.worldPosition(this._tmp2);
      this._toPlanet.copy(this._tmp2).sub(this.ship.position); // (centro - nave)
      this._tmp3.copy(this._toPlanet).divideScalar(dist); // direção nave → corpo

      // 4) escala visual: o corpo que estamos abordando vira gigante (todos iguais)
      this._updateApproachScaling(nearestBody, dist);

      // 3) frenagem de segurança (Flight Assist só p/ aproximações perigosas):
      // em rota de impacto e rápido demais pra frear na mão → limita a velocidade
      // ao que permite parar antes da superfície. Libera assim que você desvia.
      const speed = this.velocity.length();
      const padR = r * 1.4; // para FORA do raio de explosão (1.1·r)
      if (speed > this.maxSpeed && dist > padR) {
        this._tmp.copy(this.velocity).multiplyScalar(1 / speed); // direção do voo
        const tCA = this._toPlanet.dot(this._tmp); // avanço até o ponto mais próximo
        if (tCA > 0) {
          const closest2 = Math.max(this._toPlanet.lengthSq() - tCA * tCA, 0);
          const hitR = r * 1.25; // tolerância de "rota de impacto"
          if (closest2 < hitR * hitR) {
            const safe = Math.sqrt(2 * this.brakeAccel * (dist - padR));
            if (speed > safe) {
              this.velocity.multiplyScalar(safe / speed);
              this.speed = Math.min(this.speed, safe);
              this._braking = true;
            }
          }
        }
      }

      // colisão: encostou → explode (Terra e todos os corpos, referência ou não)
      if (dist < r * 1.1) {
        this.explode();
        return;
      }

      // ar superaquecido no lado voltado pro corpo — cresce ao chegar perto
      const heatStart = r * 3.2;
      const heatEnd = r * 1.25;
      const heatT = THREE.MathUtils.clamp((heatStart - dist) / (heatStart - heatEnd), 0, 1);
      if (heatT > 0.02) {
        this.heat.visible = true;
        this.heat.position.copy(this.ship.position).addScaledVector(this._tmp3, SHIP_SIZE);
        const flicker = 0.9 + Math.sin(performance.now() * 0.02) * 0.1;
        this.heat.scale.setScalar((0.04 + heatT * 0.13) * flicker);
        this.heat.material.opacity = heatT * 0.95;
      } else {
        this.heat.visible = false;
      }
    } else {
      this.heat.visible = false;
    }

    // 5b) integra a posição usando a velocidade (já no espaço-mundo)
    this.ship.position.addScaledVector(this.velocity, dt);

    const sp = this.velocity.length();
    const spN = Math.min(sp / this.maxSpeed, 1.4);
    const supercruising = sp > this.boostSpeed * 1.5;
    this.engineGlow.scale.setScalar(0.25 + spN * 0.6);
    this.engineGlow.material.opacity = 0.35 + Math.min(spN, 1) * 0.5;

    // 6) CÂMERA — orientação EXATAMENTE igual à da nave (inclui roll; sem
    //    horizonte fixo, sem up global, sem lookAt). Chase cam rígida: a posição
    //    fica atrás e um pouco acima em espaço LOCAL; a orientação faz slerp para
    //    o quaternion da nave (quase travada). Roll/pitch/yaw refletem 1:1.
    const desired = this._tmp
      .set(0, this.trailUp, this.trailBack) // local: +Z atrás (forward é -Z), +Y acima
      .applyQuaternion(this.ship.quaternion)
      .add(this.ship.position);
    // tremor sutil no boost (vibração de motor a toda potência)
    if (boosting) {
      const t = performance.now() * 0.05;
      this._tmp3.set(Math.sin(t * 1.7), Math.sin(t * 2.3), Math.sin(t * 1.1)).multiplyScalar(spN * 0.012);
      desired.add(this._tmp3);
    }
    this.camera.position.lerp(desired, 1 - Math.exp(-this.camLag * dt));
    this.camera.quaternion.slerp(this.ship.quaternion, 1 - Math.exp(-this.camTurnLag * dt));
    // alvo do OrbitControls à frente (só p/ retomar o controle suavemente ao sair)
    this.controls.target.copy(this.ship.position).addScaledVector(this._fwd, this.lookAhead);

    // FOV dinâmico: "punch" com a velocidade (rush de boost) + abertura no supercruise
    if (this._baseFov) {
      const rush = THREE.MathUtils.clamp((sp - this.maxSpeed) / this.boostSpeed, 0, 1) * 10;
      const targetFov = this._baseFov + rush + (supercruising ? 14 : 0);
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }

    // velocidade legível (% da luz + km/s) e estado orbital
      if (ctrlHeld && sp > 0.01) {
        this.readout.textContent = t("ship.inertialBrake", { speed: formatSpeedForwardOnly(this.speed) });
      } else if (this._braking) {
        this.readout.textContent = t("ship.autoBrake", { speed: formatSpeedForwardOnly(this.speed) });
      } else if (supercruising) {
        this.readout.textContent = t("ship.supercruise", { speed: formatSpeedForwardOnly(this.speed) });
      } else if (this.referenceBody) {
        const status = sp > escapeSpeed ? t("ship.escape") : t("ship.inOrbit");
        this.readout.textContent = `${formatSpeedForwardOnly(this.speed)} · ${status}`;
      } else {
        this.readout.textContent = formatSpeedForwardOnly(this.speed);
      }


    // efeitos de navegação: partículas/faíscas SÓ no boost (Shift segurado)
    const fx = boosting ? spN : 0;
    this._updateStreaks(fx);
    this._updateSparks(dt, fx);
    // rastro de dobra: anéis de distorção + traço de luz enquanto em supercruise
    // (persiste esmaecendo depois — dá referência de movimento no vazio)
    this._updateWarpWake(dt, sp, supercruising);
    // a mira de distância antiga foi substituída pela NavigationHud (marcadores
    // espaciais), montada em main.js e desacoplada do voo.
  }
}
