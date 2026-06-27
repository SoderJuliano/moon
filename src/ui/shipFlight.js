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
// Controles: W acelera · S freia/ré · A/D (←/→) vira · ↑/↓ sobe/desce · Esc sai.

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";

const NAV_KEYS = new Set([
  "KeyW", "KeyS", "KeyA", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
]);

const SHIP_SIZE = 0.03; // fração de unidade (nave bem pequena: planeta parece gigante)
const KM_PER_UNIT = 6371; // 1 unidade = 1 raio terrestre (modo real)
const C_KM_S = 299792.458; // velocidade da luz, p/ mostrar % da luz

// textura de asteroide pra billboards de meteoro: rocha cinza sombreada com
// crateras, fundo transparente. Uma só, compartilhada (leve). De perto a 256px
// já mostra detalhe; de longe/voando vira pontinho.
function makeRockTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, s, s);
  // disco rochoso iluminado de cima-esquerda
  const g = ctx.createRadialGradient(s * 0.38, s * 0.36, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
  g.addColorStop(0, "#b9b2a6");
  g.addColorStop(0.5, "#8a8175");
  g.addColorStop(0.85, "#544c43");
  g.addColorStop(1, "rgba(40,36,32,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  // crateras/manchas
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * s * 0.42;
    const x = s / 2 + Math.cos(a) * rr;
    const y = s / 2 + Math.sin(a) * rr;
    const cr = 3 + Math.random() * 12;
    ctx.fillStyle = `rgba(${30 + Math.random() * 40},${28 + Math.random() * 36},${24 + Math.random() * 30},${0.25 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

    this.maxSpeed = 7; // cruzeiro (metade do antigo); Shift+W faz boost
    this.boostSpeed = 14; // velocidade máxima só no boost (Shift+W)
    this.accel = 5; // aceleração mais gradual (era brusca perto do planeta)
    this.reverseFrac = 1 / 3; // ré no máximo 1/3 do avanço
    this.turnRate = 0.9; // curva mais mansa
    this.turnResponse = 4; // rampa suave da curva/subida (sem solavanco)
    this.liftRate = 3.5; // velocidade de subir/descer (Shift/Ctrl, ↑/↓)
    this.arcadeResponse = 3.5;
    this.gravity = 9;
    // câmera proporcional ao tamanho da nave: enquadra a nave pequena e deixa o
    // planeta (raio ~1) dominar a tela quando perto
    this.trailBack = SHIP_SIZE * 7;
    this.trailUp = SHIP_SIZE * 2.5;
    this.lookAhead = SHIP_SIZE * 38;
    this.camLag = 6;
    this.speed = 0;
    this.bank = 0;
    this._stretch = 1; // alongamento da nave no boost (efeito de velocidade)
    this.yawVel = 0; // velocidade angular suavizada (curva)
    this.liftVel = 0; // velocidade vertical suavizada
    this._pitchTilt = 0; // inclinação cosmética do bico ao subir/descer
    this.velocity = new THREE.Vector3();

    this.ship = new THREE.Group();
    this.ship.scale.setScalar(SHIP_SIZE);
    this.ship.visible = false;
    this.model = buildShipModel();
    this.ship.add(this.model);

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

    // meteoros: billboards rochosos que aparecem à frente em alta velocidade,
    // passam voando e somem atrás (não são físicos). Se você freia perto de um,
    // ele fica visível pra apreciar (a textura 256px já mostra detalhe de perto).
    this.rockTex = makeRockTexture();
    this.meteors = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.rockTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        })
      );
      m.visible = false;
      scene.add(m);
      this.meteors.push({ sprite: m, size: 0, spawned: false });
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
      this.referenceBody.worldPosition(this._refPos);
      // perto o bastante pra o planeta DOMINAR a tela (parecer gigante)
      const approach = this.referenceBody.radius * 2 + 1.2;
      this._toPlanet.copy(this.camera.position).sub(this._refPos); // planeta -> câmera
      if (this._toPlanet.lengthSq() < 1e-4) this._toPlanet.copy(this._fwd).negate();
      this._toPlanet.normalize();
      this.ship.position
        .copy(this._refPos)
        .addScaledVector(this._toPlanet, approach)
        .addScaledVector(this._tmp, approach * 0.22)
        .addScaledVector(this._up, -approach * 0.1);
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
    this.bank = 0;
    this.yawVel = 0;
    this.liftVel = 0;
    this._pitchTilt = 0;
    this._stretch = 1;
    this.model.rotation.set(0, 0, 0);
    this.model.scale.set(1, 1, 1);
    this.velocity.set(0, 0, 0);
    this._initStreaks();
    this._initMeteors();

    // tween de entrada: câmera vai da pose atual até a 3ª pessoa atrás da nave
    this.intro = {
      t: 0,
      dur: 2.0,
      glideSpeed: 0.4, // quase pairando: não mergulha dentro do planeta gigante
      fromPos: this.camera.position.clone(),
      fromTgt: this.controls.target.clone(),
    };

    if (this.onEngage) this.onEngage();
  }

  disengage() {
    if (!this.active && !this.exploding) return;
    if (this.exploding) this._cleanupExplosion();
    this.active = false;
    this.intro = null;
    this.ship.visible = false;
    this._hideFx();
    this.readout.style.display = "none";
    this.speed = 0;
    this.velocity.set(0, 0, 0);
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
    this.readout.style.display = "none";

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
    for (const m of this.meteors) m.sprite.visible = false;
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

  // posiciona um meteoro à frente da nave, espalhado num disco perpendicular
  _respawnMeteor(m) {
    this._fwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
    this._tmp.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.4 + Math.random() * 2.2; // afastados do eixo (passam pela lateral)
    const a = 3 + Math.random() * 5; // distância à frente
    m.sprite.position
      .copy(this.ship.position)
      .addScaledVector(this._fwd, a)
      .addScaledVector(this._tmp, Math.cos(ang) * rad)
      .addScaledVector(this._up, Math.sin(ang) * rad);
    m.size = 0.05 + Math.random() * 0.22;
    m.spawned = true;
  }

  _initMeteors() {
    for (const m of this.meteors) this._respawnMeteor(m);
  }

  // meteoros passando: estáticos no mundo, a nave os atravessa. Aparecem em alta
  // velocidade; se você freia perto de um, ele fica visível pra apreciar.
  _updateMeteors(spN) {
    const op = THREE.MathUtils.clamp((spN - 0.4) / 0.6, 0, 1);
    for (const m of this.meteors) {
      this._tmp2.copy(m.sprite.position).sub(this.ship.position);
      const along = this._tmp2.dot(this._fwd);
      const dist = this._tmp2.length();
      if (along < -1 || dist > 12) this._respawnMeteor(m); // passou/longe: recicla à frente
      // perto e devagar = inspeção: aparece mesmo parado (a 256px mostra detalhe)
      const inspecting = dist < 1.2;
      const vis = Math.max(op, inspecting ? 1 : 0);
      if (vis <= 0.01) {
        m.sprite.visible = false;
        continue;
      }
      m.sprite.visible = true;
      m.sprite.material.opacity = vis;
      m.sprite.scale.setScalar(m.size);
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

    // amortecimento de proximidade: perto do planeta a velocidade máxima cai,
    // pra dar pra sobrevoar devagar e apreciar (longe = cheia, com boost)
    let proxScale = 1;
    if (this.referenceBody) {
      const r = this.referenceBody.radius;
      const distRef = this._refPos.distanceTo(this.ship.position);
      proxScale = THREE.MathUtils.clamp((distRef - r * 1.2) / (r * 5), 0.16, 1);
    }

    // 2) empuxo escalar ao longo do nariz (ré no máximo 1/3 do avanço).
    // Shift+W = boost (afterburner): libera a velocidade máxima maior.
    const shiftHeld = k.has("ShiftLeft") || k.has("ShiftRight");
    const boosting = k.has("KeyW") && shiftHeld;
    const cap = (boosting ? this.boostSpeed : this.maxSpeed) * proxScale;
    if (k.has("KeyW")) this.speed += this.accel * (boosting ? 1.8 : 1) * dt;
    else if (k.has("KeyS")) this.speed -= this.accel * dt;
    else this.speed *= Math.max(0, 1 - 0.5 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * this.reverseFrac, cap);

    // curva (yaw): rampa suave a velocidade angular — vira mais macio, sem solavanco
    let yawInput = 0;
    if (k.has("KeyA") || k.has("ArrowLeft")) yawInput += 1;
    if (k.has("KeyD") || k.has("ArrowRight")) yawInput -= 1;
    this.yawVel = THREE.MathUtils.lerp(this.yawVel, yawInput * this.turnRate, 1 - Math.exp(-this.turnResponse * dt));
    this.ship.rotateY(this.yawVel * dt);
    this.bank = THREE.MathUtils.lerp(this.bank, yawInput * 0.5, 1 - Math.exp(-4 * dt));

    // subir/descer no plano: Shift (ou ↑) sobe, Ctrl (ou ↓) desce — translação
    // vertical suave; o bico inclina junto (empina/abaixa). Durante o boost
    // (Shift+W) o Shift vira acelerador, então não conta como subida.
    let lift = 0;
    if (k.has("ArrowUp") || (shiftHeld && !boosting)) lift += 1;
    if (k.has("ControlLeft") || k.has("ControlRight") || k.has("ArrowDown")) lift -= 1;
    this.liftVel = THREE.MathUtils.lerp(this.liftVel, lift * this.liftRate, 1 - Math.exp(-this.turnResponse * dt));
    this.ship.position.y += this.liftVel * dt;
    this._pitchTilt = THREE.MathUtils.lerp(this._pitchTilt, lift * 0.35, 1 - Math.exp(-5 * dt));
    this.model.rotation.x = this._pitchTilt;
    this.model.rotation.z = this.bank;

    // boost: a nave estica ao longo do nariz (efeito de velocidade/warp)
    const targetStretch = boosting && this.speed > this.maxSpeed * 0.85 ? 2.0 : 1;
    this._stretch = THREE.MathUtils.lerp(this._stretch, targetStretch, 1 - Math.exp(-5 * dt));
    const squash = 1 / Math.sqrt(this._stretch);
    this.model.scale.set(squash, squash, this._stretch);

    // 3) velocidade alinha ao nariz (arcade) + gravidade do planeta
    this._fwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
    this._desiredVel.copy(this._fwd).multiplyScalar(this.speed);
    this.velocity.lerp(this._desiredVel, 1 - Math.exp(-this.arcadeResponse * dt));

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

      // 4) consequências de proximidade
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

    // 5) integra posição
    this.ship.position.addScaledVector(this.velocity, dt);

    const sp = this.velocity.length();
    const spN = Math.min(sp / this.maxSpeed, 1.4);
    this.engineGlow.scale.setScalar(0.25 + spN * 0.6);
    this.engineGlow.material.opacity = 0.35 + Math.min(spN, 1) * 0.5;

    // 6) câmera 3ª pessoa
    this._up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
    const desired = this._tmp
      .copy(this.ship.position)
      .addScaledVector(this._fwd, -this.trailBack)
      .addScaledVector(this._up, this.trailUp);
    this.camera.position.lerp(desired, 1 - Math.exp(-this.camLag * dt));
    const look = this._tmp2.copy(this.ship.position).addScaledVector(this._fwd, this.lookAhead);
    this.controls.target.copy(look);
    this.camera.lookAt(look);

    // velocidade legível (% da luz + km/s) e estado orbital
    if (this.referenceBody) {
      const status = sp > escapeSpeed ? "FUGA" : "EM ÓRBITA";
      this.readout.textContent = `${formatSpeed(sp)} · ${status}`;
    } else {
      this.readout.textContent = formatSpeed(sp);
    }

    // efeitos de navegação: partículas, meteoros, faíscas e mira de distância
    this._updateStreaks(spN);
    this._updateMeteors(spN);
    this._updateSparks(dt, spN);
    this._updateTargetLabel();
  }
}
