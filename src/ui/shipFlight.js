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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";

const NAV_KEYS = new Set([
  "KeyW", "KeyS", "KeyA", "KeyD", "KeyX", "KeyZ", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight",
]);

const SHIP_SIZE = 0.06; // fração de unidade (1 unidade = 1 raio terrestre no real)
// ao pilotar, o planeta focado cresce: vira gigante (nave = grão de areia). Tamanho
// mínimo gigante pra os pequenos (Marte/Mercúrio) também terem folga pra navegar.
const APPROACH_MUL = 40;
const MIN_APPROACH_R = 60;
const KM_PER_UNIT = 6371; // 1 unidade = 1 raio terrestre (modo real)
const C_KM_S = 299792.458; // velocidade da luz, p/ mostrar % da luz

// suaviza 0→1 (acelera no início, desacelera no fim) para a entrada cinematográfica
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// velocidade legível: % da luz + km/s (a medida interna em u/s não diz nada)
function formatSpeed(unitsPerSec) {
  const kms = unitsPerSec * KM_PER_UNIT;
  const kmsFmt = Math.round(kms).toLocaleString("pt-BR");
  const pctC = (kms / C_KM_S) * 100;
  if (pctC >= 0.05) return `${pctC.toFixed(1)}% da luz · ${kmsFmt} km/s`;
  return `${kmsFmt} km/s`;
}

// distância legível: km quando perto, minutos/horas-luz quando longe
function formatDistance(units) {
  const km = units * KM_PER_UNIT;
  if (km < 1e6) return `${Math.round(km).toLocaleString("pt-BR")} km`;
  const lightMin = km / (C_KM_S * 60);
  if (lightMin < 60) return `${lightMin.toFixed(1)} min-luz`;
  return `${(lightMin / 60).toFixed(1)} h-luz`;
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
  constructor(scene, camera, controls, { onEngage, onDisengage, onDestroyed, onEarthApproach, getReferenceBody, getBodies, getSun } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.onEngage = onEngage;
    this.onDisengage = onDisengage;
    this.onDestroyed = onDestroyed;
    this.onEarthApproach = onEarthApproach;
    this.getReferenceBody = getReferenceBody;
    this.getBodies = getBodies; // p/ a mira de distância (Sol/planetas)
    this.getSun = getSun; // p/ colidir com o Sol mesmo sem ser o corpo de referência

    this.enabled = false;
    this.active = false;
    this.intro = null; // fase de entrada cinematográfica (câmera assenta atrás da nave)
    this.exploding = false;
    this.explosion = null;
    this.earthPromptShown = false;
    this.keys = new Set();
    this.referenceBody = null;
    this._hiddenMoons = []; // luas escondidas do planeta gigante durante o voo

    // --- empuxo linear: escalar com inércia + DIREÇÃO que segue o nariz -------
    this.maxSpeed = 3.3; // cruzeiro ~7% da luz
    this.boostSpeed = 14; // boost ~30% da luz (Shift+W)
    this.accel = 3.2; // ganho/perda do empuxo (escalar)
    this.reverseFrac = 1 / 3; // ré no máximo 1/3 do avanço
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

    // --- rotação 6DoF (rad/s, eixos locais, com inércia) ---------------------
    this.pitchRate = 1.6; // cabrar/picar (local X)
    this.yawRate = 1.5; // guinada (local Y)
    this.rollRate = 2.8; // giro das asas (local Z) — caça rola rápido e bem visível
    this.turnAttack = 8; // rampa firme ao apertar a tecla
    this.turnRelease = 1.6; // decaimento ao soltar (deixa "girar de inércia")

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

    // mira de distância: ao apontar o bico pra um corpo, mostra "Nome — dist"
    this.targetLabel = document.createElement("div");
    Object.assign(this.targetLabel.style, {
      position: "fixed", top: "54px", left: "50%", transform: "translateX(-50%)",
      zIndex: "21", padding: "4px 12px", borderRadius: "999px",
      background: "rgba(10,16,28,0.6)", border: "1px solid rgba(255,255,255,0.12)",
      color: "#dbe7ff", font: "12px system-ui, sans-serif", letterSpacing: "0.3px",
      pointerEvents: "none", backdropFilter: "blur(6px)", display: "none", whiteSpace: "nowrap",
    });
    document.body.appendChild(this.targetLabel);

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
      if (this.active || this.exploding) this.disengage();
      return;
    }
    if (!NAV_KEYS.has(e.code)) return;
    e.preventDefault();
    this.keys.add(e.code);
    if (this.enabled && !this.active && !this.exploding && (e.code === "KeyW" || e.code === "ArrowUp")) this.engage();
  }

  engage() {
    if (this.active) return;
    this.active = true;
    this.earthPromptShown = false;
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
      // planeta cresce pra escala gigante (mínimo grande pros pequenos); esconde
      // as luas dele (ficariam dentro do planeta agora enorme)
      const base = this.referenceBody.baseRadius || 1;
      this.referenceBody.setApproach(Math.max(APPROACH_MUL, MIN_APPROACH_R / base));
      this._hiddenMoons = [];
      for (const m of this.referenceBody.moons || []) {
        if (m.mesh.visible) {
          m.mesh.visible = false;
          this._hiddenMoons.push(m);
        }
      }
      this.referenceBody.worldPosition(this._refPos);
      const approach = this.referenceBody.approachRadius * 2.4 + 2; // nasce bem fora
      this._toPlanet.copy(this.camera.position).sub(this._refPos); // planeta -> câmera
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

  // devolve o planeta ao tamanho normal e mostra as luas de volta
  _restoreApproach() {
    if (this.referenceBody) this.referenceBody.setApproach(1);
    for (const m of this._hiddenMoons) m.mesh.visible = true;
    this._hiddenMoons = [];
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

  // esconde todos os efeitos (partículas/faíscas/mira) ao sair/explodir
  _hideFx() {
    this.heat.visible = false;
    this.streaks.visible = false;
    for (const s of this.sparks) {
      s.life = 0;
      s.sprite.visible = false;
    }
    this.targetLabel.style.display = "none";
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

  // mira: se o bico aponta (quase) exato pra um corpo, mostra nome + distância
  _updateTargetLabel() {
    if (!this.getBodies) return;
    let best = null;
    let bestDot = 0.985; // ~10° de tolerância
    let bestDist = 0;
    for (const b of this.getBodies()) {
      b.worldPosition(this._tmp2);
      this._tmp2.sub(this.ship.position);
      const d = this._tmp2.length();
      if (d < 1e-4) continue;
      const dot = this._tmp2.dot(this._fwd) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = b;
        bestDist = d;
      }
    }
    if (best) {
      this.targetLabel.textContent = `${best.name} — ${formatDistance(bestDist)}`;
      this.targetLabel.style.display = "";
    } else {
      this.targetLabel.style.display = "none";
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

    this.readout.textContent = "aproximando…";

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
    if (this.referenceBody) {
      this.referenceBody.worldPosition(this._refPos);
      this._tmp.copy(this._refPos).sub(this._prevRef);
      this.ship.position.add(this._tmp);
      this._prevRef.copy(this._refPos);
    }

    // 2) LEITURA DO INPUT — eixos combináveis (yaw+pitch+roll+empuxo ao mesmo tempo)
    const shiftHeld = k.has("ShiftLeft") || k.has("ShiftRight");
    const fwdKey = k.has("KeyW");
    const revKey = k.has("KeyS");
    const boosting = fwdKey && shiftHeld;
    // sinais -1..1 por eixo de rotação (sem interferência entre eles)
    let pitchIn = 0, yawIn = 0, rollIn = 0;
    if (k.has("ArrowUp") || k.has("KeyX")) pitchIn += 1;   // cabra (nariz sobe)
    if (k.has("ArrowDown") || k.has("KeyZ")) pitchIn -= 1; // pica (nariz desce)
    if (k.has("KeyA") || k.has("ArrowLeft")) yawIn += 1;   // guina à esquerda
    if (k.has("KeyD") || k.has("ArrowRight")) yawIn -= 1;  // guina à direita
    if (k.has("KeyQ")) rollIn += 1;  // rola asas (sentido anti-horário visto de trás)
    if (k.has("KeyE")) rollIn -= 1;  // rola asas (sentido horário) — caça vira de ponta-cabeça

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
    if (this.getBodies) {
      for (const b of this.getBodies()) {
        b.worldPosition(this._tmp2);
        const d = this._tmp2.distanceTo(this.ship.position) - b.radius;
        if (d < nearSurf) nearSurf = d;
      }
    }
    if (!isFinite(nearSurf)) nearSurf = 0;
    nearSurf = Math.max(0, nearSurf);
    const scCap = THREE.MathUtils.clamp(
      this.boostSpeed + nearSurf * this.supercruiseGain, this.boostSpeed, this.supercruiseMax
    );

    if (boosting) {
      // supercruise: spool-up rápido até o teto que escala com a distância
      this.speed = THREE.MathUtils.lerp(this.speed, scCap, 1 - Math.exp(-this.scAccel * dt));
    } else if (fwdKey) {
      this.speed += this.accel * dt;
    } else if (revKey) {
      this.speed -= this.accel * dt;
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

    // gravidade do planeta de referência (puxa a velocidade, leitura órbita/fuga)
    let escapeSpeed = 0;
    if (this.referenceBody) {
      const body = this.referenceBody;
      const r = body.radius;
      this._toPlanet.copy(this._refPos).sub(this.ship.position);
      const dist = this._toPlanet.length() || 1e-6;
      this._tmp3.copy(this._toPlanet).divideScalar(dist); // direção ao planeta

      const dd = Math.max(dist, r * 1.05);
      const gAccel = (this.gravity * r * r) / (dd * dd);
      this.velocity.addScaledVector(this._tmp3, gAccel * dt);
      escapeSpeed = r * Math.sqrt((2 * this.gravity) / dd);

      // consequências de proximidade (barreira da Terra / explosão nos demais)
      if (body.id === "earth") {
        const barrier = r * 1.4;
        if (dist < barrier) {
          // mantém a nave fora e remove a velocidade em direção ao planeta
          this.ship.position.copy(this._refPos).addScaledVector(this._tmp3, -barrier);
          const vIn = this.velocity.dot(this._tmp3);
          if (vIn > 0) this.velocity.addScaledVector(this._tmp3, -vIn);
          if (!this.earthPromptShown) {
            this.earthPromptShown = true;
            if (this.onEarthApproach) this.onEarthApproach();
          }
        } else if (dist > r * 1.9) {
          this.earthPromptShown = false; // pode perguntar de novo mais tarde
        }
      } else if (dist < r * 1.1) {
        this.explode();
        return;
      }

      // ar superaquecido no lado voltado pro planeta — cresce ao chegar perto
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

    // colisão com o Sol mesmo quando ele NÃO é o corpo de referência (senão a
    // nave atravessava o Sol voando preso a outro planeta)
    const sunBody = this.getSun ? this.getSun() : null;
    if (sunBody && sunBody !== this.referenceBody) {
      sunBody.worldPosition(this._tmp2);
      if (this._tmp2.distanceTo(this.ship.position) < sunBody.radius * 1.05) {
        this.explode();
        return;
      }
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
    if (supercruising) {
      this.readout.textContent = `SUPERCRUISE · ${formatSpeed(sp)}`;
    } else if (this.referenceBody) {
      const status = sp > escapeSpeed ? "FUGA" : "EM ÓRBITA";
      this.readout.textContent = `${formatSpeed(sp)} · ${status}`;
    } else {
      this.readout.textContent = formatSpeed(sp);
    }

    // efeitos de navegação: partículas/faíscas SÓ no boost (Shift segurado)
    const fx = boosting ? spN : 0;
    this._updateStreaks(fx);
    this._updateSparks(dt, fx);
    // a mira de distância antiga foi substituída pela NavigationHud (marcadores
    // espaciais), montada em main.js e desacoplada do voo.
  }
}
