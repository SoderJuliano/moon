// BossShip — nave CAPITAL inimiga (a boss fight dos Gêmeos).
//
//  • Modelo pesado (86–88MB) com lazy-load: baixa quando o encontro arma.
//  • ~3u no eixo longo (~50× a nave do jogador): quando ela passa perto é o
//    cargueiro roçando no bote — o FleetEncounter dispara tremor + ronco e
//    repulsão física violenta que arremessa a nave do jogador pra longe.
//  • VIDA em duas camadas (maxHp 60): 20 no ESCUDO e 40 no CASCO.
//  • PULSO ELETROMAGNÉTICO (EMP): quando o escudo quebra, uma bolha magnética
//    gigante explode em choque e paralisa a nave do jogador por 5s se estiver perto.
//  • IMUNIDADE LAST STAND: 1 vez antes de morrer (ao chegar em 1 de vida),
//    o cruzador sobrecarrega um escudo emergencial dourado e fica IMUNE por 4.5s.
//  • Canhão próprio: esferas de plasma rápidas (30 u/s) e incandescentes que
//    jogam e balançam a nave do jogador com forte impacto físico.
//  • IA: persegue rápido (1.8 u/s) alternando entre combate de perto e de longe,
//    com investidas aceleradas a cada 3.5–5.5s.
//
// Quem orquestra chegada/morte/fim é o FleetEncounter.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";
import { playShieldHit, playShieldBreak, playHeavyCannon, playBossRupture } from "./battleSfx.js";
import { resolveAssetUrl } from "../game/remoteAssets.js";

export const BOSS_SHIELD_HP = 20; // dobro do original (era 10)
export const BOSS_HULL_HP = 40;   // dobro do original (era 20)
export const BOSS_MAX_HP = BOSS_SHIELD_HP + BOSS_HULL_HP; // 60
export const BOSS_INVULN_SECS = 4.5; // imunidade temporária antes de morrer

const SIZE = 3.0; // eixo longo (~50× a nave do jogador)
const SHIELD_R = SIZE * 0.62; // raio da bolha (envolve o casco todo)
const HULL_R = SIZE * 0.42; // raio de acerto no casco
const BASE_BOLT_DMG = 2; // dano base do canhão do boss
const BASE_BOLT_SPEED = 16.0; // projéteis cadenciados para permitir esquiva e manobras
const BOLT_TTL = 2.2; // disparos perdidos dissipam antes de poluírem o espaço
const BASE_FIRE_EVERY = 1.8; // cadência mais espaçada permitindo contra-ataques
const CRUISE_SPEED = 1.1; // u/s — perseguição solene e imponente de belonave capital
const PREF_DIST_NEAR = 3.6; // distância de combate de perto
const PREF_DIST_FAR = 8.0; // distância de bombardeio afastado
const PASS_SPEED = 3.6; // u/s na investida: com Shift (~5.5-6.0 u/s) o jogador supera a velocidade e contorna os chefes
const PASS_EVERY = [6.0, 9.5]; // investidas mais espaçadas
const PASS_DUR = 1.8; // s de cada investida rápida

function buildProceduralBossMesh(bossId) {
  const root = new THREE.Group();
  const isEclipse = bossId === "boss-eclipse";

  // Cores temáticas para cada um dos Gêmeos
  const hullColor = isEclipse ? 0x1b2028 : 0x181524;
  const accentColor = isEclipse ? 0x2e3846 : 0x2a2238;
  const glowColor = isEclipse ? 0xff3b25 : 0xbb33ff; // Eclipse = rubi estelar; Vórtice = roxo cósmico
  const engineColor = isEclipse ? 0xff7722 : 0x44ddff;

  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    metalness: 0.85,
    roughness: 0.3,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    metalness: 0.7,
    roughness: 0.4,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: glowColor,
  });
  const engineMat = new THREE.MeshBasicMaterial({
    color: engineColor,
  });

  // 1. Casco Central (fuselagem angular em cunha voltada para +Z)
  const hullGeo = new THREE.ConeGeometry(0.55, SIZE * 0.75, 4);
  hullGeo.rotateY(Math.PI / 4); // vira as quinas para formar um losango facetado
  hullGeo.rotateX(Math.PI / 2); // aponta nariz para +Z
  const mainHull = new THREE.Mesh(hullGeo, hullMat);
  mainHull.scale.set(1.4, 0.42, 1.0); // perfil achatado de nave capital
  mainHull.position.set(0, 0, 0.1);
  root.add(mainHull);

  // 2. Ponte de Comando Superior (Dorsal)
  const bridgeGeo = new THREE.BoxGeometry(0.28, 0.16, 0.65);
  const bridge = new THREE.Mesh(bridgeGeo, accentMat);
  bridge.position.set(0, 0.16, -0.2);
  root.add(bridge);

  // Visor com brilho cósmico
  const visorGeo = new THREE.BoxGeometry(0.2, 0.04, 0.05);
  const visor = new THREE.Mesh(visorGeo, glowMat);
  visor.position.set(0, 0.2, 0.14);
  root.add(visor);

  // 3. Blindagem Lateral / Asas táticas
  if (isEclipse) {
    const wingGeo = new THREE.BoxGeometry(0.65, 0.08, 1.1);
    const leftWing = new THREE.Mesh(wingGeo, accentMat);
    leftWing.position.set(-0.65, 0.02, -0.25);
    leftWing.rotation.y = 0.25;
    root.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, accentMat);
    rightWing.position.set(0.65, 0.02, -0.25);
    rightWing.rotation.y = -0.25;
    root.add(rightWing);

    // Canhões frontais pesados (Spinal Mounts)
    const gunGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.9, 8);
    gunGeo.rotateX(Math.PI / 2);
    const gunL = new THREE.Mesh(gunGeo, hullMat);
    gunL.position.set(-0.35, -0.05, 0.55);
    const gunR = new THREE.Mesh(gunGeo, hullMat);
    gunR.position.set(0.35, -0.05, 0.55);
    root.add(gunL);
    root.add(gunR);
  } else {
    const wingGeo = new THREE.BoxGeometry(0.95, 0.06, 0.85);
    const leftWing = new THREE.Mesh(wingGeo, accentMat);
    leftWing.position.set(-0.75, 0.04, -0.1);
    leftWing.rotation.z = -0.15;
    leftWing.rotation.y = -0.3;
    root.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, accentMat);
    rightWing.position.set(0.75, 0.04, -0.1);
    rightWing.rotation.z = 0.15;
    rightWing.rotation.y = 0.3;
    root.add(rightWing);

    const finGeo = new THREE.BoxGeometry(0.05, 0.45, 0.5);
    const finL = new THREE.Mesh(finGeo, accentMat);
    finL.position.set(-0.45, 0.22, -0.4);
    finL.rotation.z = -0.3;
    const finR = new THREE.Mesh(finGeo, accentMat);
    finR.position.set(0.45, 0.22, -0.4);
    finR.rotation.z = 0.3;
    root.add(finL);
    root.add(finR);
  }

  // 4. Motores Traseiros Duplos (-Z)
  const engineGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.55, 10);
  engineGeo.rotateX(Math.PI / 2);
  const engL = new THREE.Mesh(engineGeo, hullMat);
  engL.position.set(-0.32, 0.02, -0.85);
  const engR = new THREE.Mesh(engineGeo, hullMat);
  engR.position.set(0.32, 0.02, -0.85);
  root.add(engL);
  root.add(engR);

  // Placas incandescentes dos bocais de propulsão
  const plumeGeo = new THREE.CircleGeometry(0.12, 10);
  const plumeL = new THREE.Mesh(plumeGeo, engineMat);
  plumeL.rotation.y = Math.PI;
  plumeL.position.set(-0.32, 0.02, -1.13);
  const plumeR = new THREE.Mesh(plumeGeo, engineMat);
  plumeR.rotation.y = Math.PI;
  plumeR.position.set(0.32, 0.02, -1.13);
  root.add(plumeL);
  root.add(plumeR);

  // 5. Linhas de energia / radiadores laterais brilhantes
  const stripGeo = new THREE.BoxGeometry(0.03, 0.03, 0.8);
  const stripL = new THREE.Mesh(stripGeo, glowMat);
  stripL.position.set(-0.25, 0.12, 0.0);
  const stripR = new THREE.Mesh(stripGeo, glowMat);
  stripR.position.set(0.25, 0.12, 0.0);
  root.add(stripL);
  root.add(stripR);

  return root;
}

export class BossShip {
  // opts: { id, name, modelUrl, yaw, pitch, roll }
  constructor(scene, { id, name, modelUrl, yaw = 0, pitch = 0, roll = 0 }) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.modelUrl = modelUrl;
    this.yaw = yaw;
    this.pitch = pitch;
    this.roll = roll;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.alive = false;
    this.hp = BOSS_MAX_HP;
    this.loaded = false;
    this._loading = false;
    this._hasModel = false;
    this._fallbackModel = null;
    this._realModel = null;
    this._loadCallbacks = [];
    this.onDestroyed = null; // setados pelo FleetEncounter
    this.onPlayerHit = null; // (posMundo, dano, vel) => void
    this.onFlyby = null; // passada rasante perto do jogador (tremor + ronco)
    this.onShieldBreakEMP = null; // (posMundo) => void (estouro de pulso magnético)
    this.sfx = false; // sons de batalha (o encontro liga)

    this.handicap = 0;
    this.boltSpeed = BASE_BOLT_SPEED;
    this.fireEvery = BASE_FIRE_EVERY;
    this.boltDmg = BASE_BOLT_DMG;

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._tmpMoon = new THREE.Vector3();
    this._tmpToMoon = new THREE.Vector3();
    this.moon = null;
    this._fireCd = 1.0;
    this._holdFire = true;

    // IA tática: alternar entre perto e longe para não ficar monótono
    this._prefDist = PREF_DIST_NEAR;
    this._targetPrefDist = PREF_DIST_NEAR;
    this._distPhase = "near";
    this._distTimer = 4.0 + Math.random() * 3.0;
    this._strafeDir = Math.random() > 0.5 ? 1 : -1;

    // passadas aceleradas (investidas velozes)
    this._passT = 0; // >0 = em passada
    this._passCd = PASS_EVERY[0] + Math.random() * (PASS_EVERY[1] - PASS_EVERY[0]);
    this._passDir = new THREE.Vector3();
    this._flybyDone = false;
    this._repulseTriggered = false;

    // Imunidade de última instância (1 vez antes de morrer)
    this.invulnerableUsed = false;
    this.invulnerableTimer = 0;

    // ---- ESCUDO: bolha quase invisível que acende no impacto ------------------
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SHIELD_R, 24, 18),
      new THREE.MeshBasicMaterial({
        color: 0x3d7dff, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
      })
    );
    this.group.add(this.shieldMesh);
    this._shieldGlow = 0; // 0 = invisível; sobe no impacto e decai

    // ---- ESCUDO DE IMUNIDADE (barreira de sobrecarga dourada) ----------------
    this.invulnMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SHIELD_R * 1.08, 24, 18),
      new THREE.MeshBasicMaterial({
        color: 0xffaa22, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.group.add(this.invulnMesh);

    // ---- ONDA DE CHOQUE & ESTOURO DE ESCUDO (sem fios/rede: anel de plasma puro e flash) -
    const shockRingGeo = new THREE.RingGeometry(0.85, 1.05, 48);
    const shockRingMat = new THREE.MeshBasicMaterial({
      color: 0x5be4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.shockRing = new THREE.Mesh(shockRingGeo, shockRingMat);
    this.shockRing.visible = false;
    scene.add(this.shockRing);

    const shockFlashGeo = new THREE.SphereGeometry(1, 24, 16);
    const shockFlashMat = new THREE.MeshBasicMaterial({
      color: 0x88f4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    this.shockFlash = new THREE.Mesh(shockFlashGeo, shockFlashMat);
    this.shockFlash.visible = false;
    scene.add(this.shockFlash);

    this.empMesh = this.shockRing; // alias de compatibilidade
    this._empLife = 0;
    this._empTtl = 1.3;

    // ondulações no ponto do impacto (sprites que expandem e somem)
    this.ripples = [];
    const ripTex = radialGlowTexture("#7db4ff");
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ripTex, color: 0x8fc2ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      s.visible = false;
      scene.add(s);
      this.ripples.push({ s, life: 0 });
    }

    // estilhaços de escudo de energia quebrando (cristais de plasma brilhantes)
    const N = 180;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this._shatter = {
      pts: new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0x8fe8ff, size: 0.25, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      ),
      vels: Array.from({ length: N }, () => new THREE.Vector3()),
      life: 0,
      ttl: 1.6,
    };
    this._shatter.pts.visible = false;
    this._shatter.pts.frustumCulled = false;
    scene.add(this._shatter.pts);

    // BOLT PESADO: ESFERA DE PLASMA GIGANTE INCANDESCENTE (rápida, com halo e núcleo branco)
    const boltGeo = new THREE.SphereGeometry(0.12, 12, 10);
    const boltMat = new THREE.MeshBasicMaterial({
      color: 0xff3b25, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coreGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const haloTex = radialGlowTexture("#ff5522");

    this.bolts = [];
    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      const core = new THREE.Mesh(coreGeo, coreMat);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTex, color: 0xff7733, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      halo.scale.setScalar(0.55);
      group.add(mesh);
      group.add(core);
      group.add(halo);
      group.visible = false;
      scene.add(group);
      this.bolts.push({ mesh: group, vel: new THREE.Vector3(), ttl: 0 });
    }
  }

  get shielded() {
    return this.hp > BOSS_HULL_HP;
  }
  get shieldHp() {
    return Math.max(0, this.hp - BOSS_HULL_HP);
  }
  get hullHp() {
    return Math.min(this.hp, BOSS_HULL_HP);
  }

  _disposeHierarchy(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m?.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  }

  ensureReady() {
    if (this._hasModel || this.loaded) {
      this.loaded = true;
      return;
    }
    this._fallbackModel = buildProceduralBossMesh(this.id);
    this.group.add(this._fallbackModel);
    this._hasModel = true;
    this.loaded = true;
  }

  load(onDone) {
    if (this.loaded) {
      onDone?.();
      return;
    }
    if (this._loading) {
      if (onDone) this._loadCallbacks.push(onDone);
      return;
    }
    this._loading = true;
    if (onDone) this._loadCallbacks.push(onDone);

    const finishLoading = () => {
      this.loaded = true;
      const cbs = this._loadCallbacks;
      this._loadCallbacks = [];
      for (const cb of cbs) cb();
    };

    const activateFallback = (reason) => {
      console.warn(`[BossShip] Ativando nave capital procedural para ${this.id}: ${reason}`);
      this.ensureReady();
      finishLoading();
    };

    // Timeout de segurança (4.5s): evita que o carregamento dos 92MB trave o encontro e o jogador
    const loadTimer = setTimeout(() => {
      if (!this._hasModel) {
        activateFallback("timeout de download/parse excedido (>4.5s)");
      }
    }, 4500);

    resolveAssetUrl(this.modelUrl)
      .then((url) => {
        new GLTFLoader().load(
          url,
          (gltf) => {
            clearTimeout(loadTimer);
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const scale = SIZE / Math.max(size.x, size.y, size.z);
            const center = box.getCenter(new THREE.Vector3());
            model.position.copy(center).multiplyScalar(-scale);
            model.scale.setScalar(scale);
            model.traverse((o) => {
              if (o.isMesh && o.material) {
                if (o.material.metalness !== undefined) o.material.metalness = Math.min(o.material.metalness, 0.85);
                if (o.material.emissiveIntensity !== undefined)
                  o.material.emissiveIntensity = Math.min(o.material.emissiveIntensity, 1.2);
              }
            });
            const fix = new THREE.Group();
            fix.add(model);
            if (this.yaw || this.pitch || this.roll) {
              fix.rotation.set(this.pitch, this.yaw, this.roll);
            }

            // Se o modelo procedural de emergência já estava ativo, substitui suavemente
            if (this._fallbackModel) {
              this.group.remove(this._fallbackModel);
              this._disposeHierarchy(this._fallbackModel);
              this._fallbackModel = null;
            }
            this.group.add(fix);
            this._realModel = fix;
            this._hasModel = true;
            finishLoading();
          },
          undefined,
          (err) => {
            clearTimeout(loadTimer);
            console.error(`[BossShip] Erro ao carregar GLTF (${this.modelUrl}):`, err);
            activateFallback(`erro no GLTFLoader: ${err?.message || err}`);
          }
        );
      })
      .catch((err) => {
        clearTimeout(loadTimer);
        console.error(`[BossShip] Erro em resolveAssetUrl (${this.modelUrl}):`, err);
        activateFallback(`falha no resolvedor de asset: ${err?.message || err}`);
      });
  }

  spawnAt(pos) {
    this.group.position.copy(pos);
    this.group.scale.setScalar(0.02); // nasce dentro do portal e cresce
    this.hp = BOSS_MAX_HP;
    this.alive = true;
    this._holdFire = true;
    this._fireCd = 0.8 + Math.random() * 0.6;
    this._shieldGlow = 0;
    this.shieldMesh.visible = true;
    this.invulnMesh.visible = false;
    this.shockRing.visible = false;
    this.shockFlash.visible = false;
    this.invulnerableUsed = false;
    this.invulnerableTimer = 0;
    this.group.visible = true;
  }

  setFiring(on) {
    this._holdFire = !on;
  }

  hide() {
    this.alive = false;
    this.group.visible = false;
    this.invulnMesh.visible = false;
    this.shockRing.visible = false;
    this.shockFlash.visible = false;
    for (const b of this.bolts) {
      b.ttl = 0;
      b.mesh.visible = false;
    }
  }

  // ---- interface de alvo do PlasmaCannon ---------------------------------------
  hitTest(pos) {
    if (!this.alive || !this.group.visible) return null;
    const r = (this.shielded || this.invulnerableTimer > 0) ? SHIELD_R : HULL_R;
    if (pos.distanceTo(this.group.position) < r) {
      return {
        id: this.id, center: this.group.position.clone(), r,
        maxHp: BOSS_MAX_HP, noBar: true, noPuff: this.shielded || this.invulnerableTimer > 0,
        immune: this.invulnerableTimer > 0,
      };
    }
    return null;
  }

  onDamaged(id, hp, maxHp, at) {
    if (this.invulnerableTimer > 0) {
      this._invulnImpact(at);
      return;
    }
    const wasShielded = this.shielded;
    this.hp = hp;
    if (wasShielded) {
      this._shieldImpact(at);
      if (!this.shielded) this._shieldShatter(); // esse hit QUEBROU o escudo
    }
  }

  triggerInvulnerability() {
    if (this.invulnerableUsed) return;
    this.invulnerableUsed = true;
    this.invulnerableTimer = BOSS_INVULN_SECS;
    this.hp = 1;
    this.invulnMesh.visible = true;
    this.invulnMesh.material.opacity = 0.8;
    if (this.sfx) {
      playShieldHit();
      playBossRupture();
    }
  }

  destroy() {
    this.hide();
    this.onDestroyed?.(this);
  }

  // ---- efeitos de impacto --------------------------------------------------------
  _invulnImpact(at) {
    if (this.sfx) playShieldHit();
    const rip = this.ripples.find((x) => x.life <= 0);
    if (rip && at) {
      this._tmp.copy(at).sub(this.group.position).normalize().multiplyScalar(SHIELD_R * 1.05);
      rip.s.position.copy(this.group.position).add(this._tmp);
      rip.s.scale.setScalar(0.45);
      rip.s.material.color.setHex(0xffaa22);
      rip.s.material.opacity = 1.0;
      rip.life = 0.55;
      rip.s.visible = true;
    }
  }

  _shieldImpact(at) {
    this._shieldGlow = 1; // a bolha ACENDE azul e volta a sumir
    if (this.sfx) playShieldHit();
    const rip = this.ripples.find((x) => x.life <= 0);
    if (rip && at) {
      this._tmp.copy(at).sub(this.group.position).normalize().multiplyScalar(SHIELD_R * 0.98);
      rip.s.position.copy(this.group.position).add(this._tmp);
      rip.s.scale.setScalar(0.3);
      rip.s.material.color.setHex(0x8fc2ff);
      rip.s.material.opacity = 0.9;
      rip.life = 0.5;
      rip.s.visible = true;
    }
  }

  _shieldShatter() {
    this.shieldMesh.visible = false;
    if (this.sfx) playShieldBreak();

    // Dispara a onda de choque magnética e o pulso EMP
    this.onShieldBreakEMP?.(this.group.position.clone());
    this._empLife = this._empTtl;

    // Anel de choque de plasma expansivo suave (sem aramado)
    this.shockRing.position.copy(this.group.position);
    this.shockRing.quaternion.copy(this.group.quaternion);
    this.shockRing.scale.setScalar(SHIELD_R * 0.85);
    this.shockRing.material.opacity = 1.0;
    this.shockRing.visible = true;

    // Flash de sobrecarga do escudo
    this.shockFlash.position.copy(this.group.position);
    this.shockFlash.scale.setScalar(SHIELD_R * 0.95);
    this.shockFlash.material.opacity = 0.9;
    this.shockFlash.visible = true;

    // Estilhaços cristalinos luminosos do escudo estourando
    const sh = this._shatter;
    const posAttr = sh.pts.geometry.attributes.position;
    for (let i = 0; i < sh.vels.length; i++) {
      const dir = sh.vels[i]
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      posAttr.setXYZ(
        i,
        this.group.position.x + dir.x * SHIELD_R,
        this.group.position.y + dir.y * SHIELD_R,
        this.group.position.z + dir.z * SHIELD_R
      );
      dir.multiplyScalar(3.2 + Math.random() * 5.2);
    }
    posAttr.needsUpdate = true;
    sh.pts.material.opacity = 1;
    sh.life = sh.ttl;
    sh.pts.visible = true;
  }

  setDifficultyModifier(handicap = 0) {
    this.handicap = THREE.MathUtils.clamp(handicap, 0, 0.5);
    this.boltSpeed = BASE_BOLT_SPEED * (1 - this.handicap);
    this.fireEvery = BASE_FIRE_EVERY / (1 - this.handicap); // atiram mais devagar
    this.boltDmg = Math.max(1, Math.round(BASE_BOLT_DMG * (1 - this.handicap * 0.5))); // atiram mais fraco
  }

  // ---- tiro pesado de esfera de plasma ------------------------------------------
  _fire(playerPos) {
    const b = this.bolts.find((x) => x.ttl <= 0);
    if (!b) return;
    this._tmp.copy(playerPos).sub(this.group.position).normalize();
    b.mesh.position.copy(this.group.position).addScaledVector(this._tmp, SIZE * 0.54);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmp);
    b.vel.copy(this._tmp).multiplyScalar(this.boltSpeed || BASE_BOLT_SPEED);
    b.ttl = BOLT_TTL;
    b.mesh.visible = true;
    if (this.sfx) playHeavyCannon();
  }

  update(dt, playerPos, playerShip = null) {
    this._updateFx(dt);
    if (!this.alive || !this.group.visible || !playerPos) {
      this._updateBolts(dt, playerPos);
      return;
    }
    // cresce saindo do portal
    if (this.group.scale.x < 1) {
      this.group.scale.setScalar(Math.min(1, this.group.scale.x + dt * 0.35));
    }

    this._tmp.copy(playerPos).sub(this.group.position);
    const dist = this._tmp.length();

    // ---- REPULSÃO FÍSICA AO PASSAR PERTO (joga a nave do jogador pra longe) ----
    const repulseRange = this._passT > 0 ? 3.8 : 2.5;
    if (dist < repulseRange && dist > 0.001 && playerShip && playerShip.velocity) {
      const pushDir = this._tmp.clone().normalize();
      const factor = 1 - dist / repulseRange;
      // Na investida a força é violenta (42 u/s²), no cruzeiro é forte (18 u/s²)
      const force = (this._passT > 0 ? 42.0 : 18.0) * factor;

      playerShip.velocity.addScaledVector(pushDir, force * dt);
      playerShip.angVel.x += (Math.random() - 0.5) * force * 0.16 * dt;
      playerShip.angVel.y += (Math.random() - 0.5) * force * 0.16 * dt;
      playerShip.angVel.z += (Math.random() - 0.5) * force * 0.24 * dt;

      if (!this._flybyDone && dist < 3.2) {
        this._flybyDone = true;
        this.onFlyby?.(dist); // tremor + ronco de cargueiro (no encontro)
      }
    }

    // ---- CICLO DE DISTÂNCIA DINÂMICO (perto vs longe) -------------------------
    this._distTimer -= dt;
    if (this._distTimer <= 0) {
      this._distPhase = this._distPhase === "near" ? "far" : "near";
      this._targetPrefDist = this._distPhase === "near"
        ? (PREF_DIST_NEAR + (Math.random() - 0.5) * 1.0)
        : (PREF_DIST_FAR + (Math.random() - 0.5) * 2.0);
      this._distTimer = 5.0 + Math.random() * 4.0;
      this._strafeDir = Math.random() > 0.5 ? 1 : -1;
    }
    this._prefDist = THREE.MathUtils.lerp(this._prefDist, this._targetPrefDist, 1 - Math.exp(-1.5 * dt));

    if (this._passT > 0) {
      // PASSADA / INVESTIDA acelerada: atravessa rápida, passando pelo jogador
      this._passT -= dt;
      this.group.position.addScaledVector(this._passDir, PASS_SPEED * dt);
      this._tmp2.copy(this.group.position).add(this._passDir);
      const mPass = new THREE.Matrix4().lookAt(this.group.position, this._tmp2, new THREE.Vector3(0, 1, 0));
      const qPass = new THREE.Quaternion().setFromRotationMatrix(mPass);
      this.group.quaternion.rotateTowards(qPass, 2.2 * dt);
    } else {
      // Cruzeiro: persegue mantendo a distância preferida dinâmica
      if (dist > this._prefDist + 0.4) {
        this.group.position.addScaledVector(this._tmp.clone().normalize(), CRUISE_SPEED * dt);
      } else if (dist < this._prefDist - 0.4) {
        // recua suavemente mantendo a distância de bombardeio
        this.group.position.addScaledVector(this._tmp.clone().normalize(), -CRUISE_SPEED * 0.65 * dt);
      }

      // Strafe lateral sutil para dinâmica espacial
      const right = this._tmp2.set(0, 1, 0).cross(this._tmp).normalize();
      this.group.position.addScaledVector(right, this._strafeDir * 0.4 * dt);

      // Giro suave e majestoso de belonave capital (inércia angular) — permite ao jogador flanquear e dar a volta
      const mLook = new THREE.Matrix4().lookAt(this.group.position, playerPos, new THREE.Vector3(0, 1, 0));
      const qLook = new THREE.Quaternion().setFromRotationMatrix(mLook);
      this.group.quaternion.rotateTowards(qLook, 1.25 * dt);

      // Arma a próxima passada / investida (3x mais frequente)
      this._passCd -= dt;
      if (this._passCd <= 0 && dist < 16) {
        this._passCd = PASS_EVERY[0] + Math.random() * (PASS_EVERY[1] - PASS_EVERY[0]);
        this._passT = PASS_DUR;
        this._flybyDone = false;
        this._tmp2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.9);
        this._passDir.copy(playerPos).add(this._tmp2).sub(this.group.position).normalize();
      }
    }

    // Evita que o cruzador penetre na malha da Lua durante a batalha
    if (this.moon) {
      this.moon.worldPosition(this._tmpMoon);
      const moonR = Math.max(60, this.moon.radius || 60);
      this._tmpToMoon.subVectors(this.group.position, this._tmpMoon);
      const mDist = this._tmpToMoon.length();
      if (mDist < moonR + 18 && mDist > 0.001) {
        this._tmpToMoon.normalize();
        this.group.position.copy(this._tmpMoon).addScaledVector(this._tmpToMoon, moonR + 18);
      }
    }

    if (!this._holdFire) {
      this._fireCd -= dt;
      if (this._fireCd <= 0) {
        this._fireCd = (this.fireEvery || BASE_FIRE_EVERY) * (0.85 + Math.random() * 0.3);
        this._fire(playerPos);
      }
    }
    this._updateBolts(dt, playerPos);
  }

  _updateBolts(dt, playerPos) {
    for (const b of this.bolts) {
      if (b.ttl <= 0) continue;
      b.ttl -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (playerPos && b.mesh.position.distanceTo(playerPos) < 0.28) {
        b.ttl = 0;
        b.mesh.visible = false;
        this.onPlayerHit?.(b.mesh.position, this.boltDmg || BASE_BOLT_DMG, b.vel);
        continue;
      }
      if (b.ttl <= 0) b.mesh.visible = false;
    }
  }

  _updateFx(dt) {
    // a bolha acende no impacto e volta pra invisível
    if (this._shieldGlow > 0) {
      this._shieldGlow = Math.max(0, this._shieldGlow - dt * 2.2);
      this.shieldMesh.material.opacity = this._shieldGlow * 0.22;
    }

    // barreira de imunidade / last stand pulsando
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
      this.invulnMesh.visible = true;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.016);
      this.invulnMesh.material.opacity = 0.35 + pulse * 0.45;
      this.invulnMesh.rotation.y += dt * 2.2;
      this.invulnMesh.rotation.z += dt * 1.6;
      if (this.invulnerableTimer <= 0) {
        this.invulnMesh.visible = false;
      }
    } else {
      this.invulnMesh.visible = false;
    }

    // onda de choque de plasma e flash esférico puro (sem aramado)
    if (this._empLife > 0) {
      this._empLife -= dt;
      const progress = 1 - this._empLife / this._empTtl;
      const ringScale = SHIELD_R * 0.85 + progress * 24.0;
      this.shockRing.scale.setScalar(ringScale);
      this.shockRing.material.opacity = Math.max(0, Math.pow(1 - progress, 1.8) * 0.95);
      this.shockRing.rotation.z += dt * 1.5;

      const flashProg = Math.min(1, (this._empTtl - this._empLife) / 0.35);
      this.shockFlash.scale.setScalar(SHIELD_R * (0.95 + flashProg * 2.2));
      this.shockFlash.material.opacity = Math.max(0, (1 - flashProg) * 0.85);

      if (this._empLife <= 0) {
        this.shockRing.visible = false;
        this.shockFlash.visible = false;
      }
    }

    for (const rip of this.ripples) {
      if (rip.life <= 0) continue;
      rip.life -= dt;
      rip.s.scale.addScalar(dt * 3.2);
      rip.s.material.opacity = Math.max(0, (rip.life / 0.55) * 0.9);
      if (rip.life <= 0) rip.s.visible = false;
    }
    const sh = this._shatter;
    if (sh.life > 0) {
      sh.life -= dt;
      const posAttr = sh.pts.geometry.attributes.position;
      const drag = Math.max(0, 1 - dt * 1.6);
      for (let i = 0; i < sh.vels.length; i++) {
        const v = sh.vels[i];
        v.multiplyScalar(drag);
        posAttr.setXYZ(i, posAttr.getX(i) + v.x * dt, posAttr.getY(i) + v.y * dt, posAttr.getZ(i) + v.z * dt);
      }
      posAttr.needsUpdate = true;
      sh.pts.material.opacity = Math.max(0, Math.pow(sh.life / sh.ttl, 1.5));
      if (sh.life <= 0) sh.pts.visible = false;
    }
  }
}
