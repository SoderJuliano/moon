// AlienMiniBoss — Mini-chefe alienígena batedor (nave grande navealiem.glb).
//
//  • Modelo: navealiem.glb (lazy-load sob demanda).
//  • VIDA (16 total): o dobro da nossa nave base (8 de escudo + 8 de casco).
//  • ESCUDO igual ao dos gêmeos: bolha de energia azul que acende e ondula no impacto;
//    ao zerar os 8 pontos de escudo, estilhaça em partículas azuis (playShieldBreak).
//  • TIRO QUÁDRUPLO: 4 canhões pequenos no topo da nave disparam 4 bolts simultâneos;
//    cada tiro causa dano moderado (0.5), com impacto físico e 1s de atordoamento
//    / desestabilização angular no jogador.
//  • IA: voo em órbita de combate tática ao redor do jogador (~4.5u a 6.5u), com
//    guinada e arfagem dinâmicas para mirar no jogador.
//
// Quem orquestra chegada/morte/fim é o FleetEncounter.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";
import { playShieldHit, playShieldBreak, playAlienQuadShot } from "./battleSfx.js";
import { t } from "../core/i18n.js";

export const MINIBOSS_SHIELD_HP = 8;
export const MINIBOSS_HULL_HP = 8;
export const MINIBOSS_MAX_HP = MINIBOSS_SHIELD_HP + MINIBOSS_HULL_HP; // 16 (o dobro da nave do jogador)

const SIZE = 1.4; // nave grande (~23x a nave do jogador, ~9x o batedor comum)
const SHIELD_R = SIZE * 0.72; // raio da bolha de escudo
const HULL_R = SIZE * 0.52; // raio de colisão do casco
const BOLT_DMG = 0.5; // tiro mais fraco que a nave base (que tira 1), mas 4 de uma vez
const BOLT_SPEED = 20; // u/s — projéteis rápidos e dinâmicos
const BOLT_TTL = 3.5;
const FIRE_EVERY = 2.4; // s entre salvas quádruplas
const STRAFE_DIST = 5.0; // distância de combate preferida
const CHASE_SPEED = 2.4; // u/s de correção de posição

// Bocais dos 4 canhões pequenos na parte superior da nave (coords locais)
const CANNON_MUZZLES = [
  new THREE.Vector3(-0.20, 0.38, -0.18),
  new THREE.Vector3( 0.20, 0.38, -0.18),
  new THREE.Vector3(-0.34, 0.32, -0.06),
  new THREE.Vector3( 0.34, 0.32, -0.06),
];

export class AlienMiniBoss {
  constructor(scene) {
    this.scene = scene;
    this.id = "alien-miniboss";
    this.idTag = "alien-miniboss";
    this.name = t("miniboss.name");

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.alive = false;
    this.hp = MINIBOSS_MAX_HP;
    this.loaded = false;
    this._loading = false;
    this.onDestroyed = null; // setado pelo FleetEncounter
    this.onPlayerHit = null; // (posMundo, dano, vel, isStun) => void
    this.onShieldBreak = null;
    this.sfx = true;

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._tmp3 = new THREE.Vector3();
    this._strafeA = Math.random() * Math.PI * 2;
    this._fireCd = 1.5;
    this._holdFire = true;

    // ---- ESCUDO DE ENERGIA (bolha azul que acende e ondula no impacto) --------
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SHIELD_R, 24, 18),
      new THREE.MeshBasicMaterial({
        color: 0x4da6ff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      })
    );
    this.group.add(this.shieldMesh);
    this._shieldGlow = 0;

    // Ondulações no escudo no ponto de impacto
    this.ripples = [];
    const ripTex = radialGlowTexture("#7db4ff");
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ripTex,
          color: 0x8fc2ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      s.visible = false;
      scene.add(s);
      this.ripples.push({ s, life: 0 });
    }

    // Estilhaços de partículas na quebra do escudo
    const N = 80;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this._shatter = {
      pts: new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0x8ec5ff,
          size: 0.09,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      ),
      vels: Array.from({ length: N }, () => new THREE.Vector3()),
      life: 0,
      ttl: 1.4,
    };
    this._shatter.pts.visible = false;
    this._shatter.pts.frustumCulled = false;
    scene.add(this._shatter.pts);

    // ---- TIRO QUÁDRUPLO: FEIXES DE ENERGIA ROXO/MAGENTA COM HALO BRILLHANTE ---
    const boltGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.13, 6);
    boltGeo.rotateX(Math.PI / 2);
    const boltMat = new THREE.MeshBasicMaterial({
      color: 0xe044ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloTex = radialGlowTexture("#c832ff");

    this.bolts = [];
    for (let i = 0; i < 32; i++) {
      const grp = new THREE.Group();
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTex,
          color: 0xd855ff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.setScalar(0.32);
      grp.add(mesh);
      grp.add(halo);
      grp.visible = false;
      scene.add(grp);
      this.bolts.push({ mesh: grp, vel: new THREE.Vector3(), ttl: 0 });
    }
  }

  get shielded() {
    return this.hp > MINIBOSS_HULL_HP;
  }
  get shieldHp() {
    return Math.max(0, this.hp - MINIBOSS_HULL_HP);
  }
  get hullHp() {
    return Math.min(this.hp, MINIBOSS_HULL_HP);
  }

  load(onDone) {
    if (this.loaded) {
      onDone?.();
      return;
    }
    if (this._loading) return;
    this._loading = true;

    new GLTFLoader().load("models/navealiem/navealiem.glb", (gltf) => {
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
      this.group.add(fix);
      this.loaded = true;
      onDone?.();
    });
  }

  spawnAt(pos) {
    this.group.position.copy(pos);
    this.group.scale.setScalar(0.01);
    this.hp = MINIBOSS_MAX_HP;
    this.alive = true;
    this._holdFire = true;
    this._fireCd = 1.6;
    this._shieldGlow = 0;
    this.shieldMesh.visible = true;
    this.group.visible = true;
  }

  setFiring(on) {
    this._holdFire = !on;
  }

  hide() {
    this.alive = false;
    this.group.visible = false;
    for (const b of this.bolts) {
      b.ttl = 0;
      b.mesh.visible = false;
    }
  }

  // ---- Interface de alvo do PlasmaCannon --------------------------------------
  hitTest(pos) {
    if (!this.alive || !this.group.visible) return null;
    const r = this.shielded ? SHIELD_R : HULL_R;
    if (pos.distanceTo(this.group.position) < r) {
      return {
        id: this.id,
        center: this.group.position.clone(),
        r,
        maxHp: MINIBOSS_MAX_HP,
        noBar: true,
        noPuff: this.shielded,
      };
    }
    return null;
  }

  onDamaged(id, hp, maxHp, at) {
    const wasShielded = this.shielded;
    this.hp = hp;
    if (wasShielded) {
      this._shieldImpact(at);
      if (!this.shielded) this._shieldShatter();
    }
  }

  destroy() {
    this.hide();
    this.onDestroyed?.(this);
  }

  // ---- Efeitos de Impacto no Escudo -------------------------------------------
  _shieldImpact(at) {
    this._shieldGlow = 1;
    if (this.sfx) playShieldHit();
    const rip = this.ripples.find((x) => x.life <= 0);
    if (rip && at) {
      this._tmp.copy(at).sub(this.group.position).normalize().multiplyScalar(SHIELD_R * 0.98);
      rip.s.position.copy(this.group.position).add(this._tmp);
      rip.s.scale.setScalar(0.35);
      rip.s.material.color.setHex(0x8fc2ff);
      rip.s.material.opacity = 0.9;
      rip.life = 0.5;
      rip.s.visible = true;
    }
  }

  _shieldShatter() {
    this.shieldMesh.visible = false;
    if (this.sfx) playShieldBreak();
    this.onShieldBreak?.();

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
      dir.multiplyScalar(2.0 + Math.random() * 2.8);
    }
    posAttr.needsUpdate = true;
    sh.pts.material.opacity = 1;
    sh.life = sh.ttl;
    sh.pts.visible = true;
  }

  // ---- Tiro Quádruplo dos 4 canhões do topo -----------------------------------
  _fire(playerPos) {
    if (!playerPos) return;

    for (let i = 0; i < CANNON_MUZZLES.length; i++) {
      const b = this.bolts.find((x) => x.ttl <= 0);
      if (!b) continue;
      const muzzleLocal = CANNON_MUZZLES[i];
      this._tmp2.copy(muzzleLocal).applyQuaternion(this.group.quaternion).add(this.group.position);

      this._tmp3.copy(playerPos).sub(this._tmp2).normalize();

      b.mesh.position.copy(this._tmp2);
      b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmp3);
      b.vel.copy(this._tmp3).multiplyScalar(BOLT_SPEED);
      b.ttl = BOLT_TTL;
      b.mesh.visible = true;
    }
    if (this.sfx) playAlienQuadShot();
  }

  update(dt, playerPos, playerShip = null) {
    this._updateFx(dt);
    if (!this.alive || !this.group.visible || !playerPos) {
      this._updateBolts(dt, playerPos);
      return;
    }

    // Cresce suavemente ao sair do portal
    if (this.group.scale.x < 1) {
      this.group.scale.setScalar(Math.min(1, this.group.scale.x + dt * 0.5));
    }

    // Órbita-strafe tática ao redor do jogador
    this._strafeA += dt * 0.42;
    this._tmp2.set(
      Math.cos(this._strafeA) * STRAFE_DIST,
      Math.sin(this._strafeA * 0.7) * 1.3,
      Math.sin(this._strafeA) * STRAFE_DIST
    );
    this._tmp.copy(playerPos).add(this._tmp2);
    const d = this._tmp.sub(this.group.position);
    const dist = d.length();
    const speed = Math.min(dist, CHASE_SPEED + Math.max(0, dist - 6) * 0.8);
    this.group.position.addScaledVector(d.normalize(), speed * dt);
    this.group.lookAt(playerPos);

    if (!this._holdFire) {
      this._fireCd -= dt;
      if (this._fireCd <= 0) {
        this._fireCd = FIRE_EVERY * (0.85 + Math.random() * 0.3);
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
      if (playerPos && b.mesh.position.distanceTo(playerPos) < 0.22) {
        b.ttl = 0;
        b.mesh.visible = false;
        this.onPlayerHit?.(b.mesh.position, BOLT_DMG, b.vel, true);
        continue;
      }
      if (b.ttl <= 0) b.mesh.visible = false;
    }
  }

  _updateFx(dt) {
    if (this._shieldGlow > 0) {
      this._shieldGlow = Math.max(0, this._shieldGlow - dt * 2.2);
      this.shieldMesh.material.opacity = this._shieldGlow * 0.24;
    }

    for (const rip of this.ripples) {
      if (rip.life <= 0) continue;
      rip.life -= dt;
      rip.s.scale.addScalar(dt * 2.8);
      rip.s.material.opacity = Math.max(0, (rip.life / 0.5) * 0.9);
      if (rip.life <= 0) rip.s.visible = false;
    }

    const sh = this._shatter;
    if (sh.life > 0) {
      sh.life -= dt;
      const posAttr = sh.pts.geometry.attributes.position;
      for (let i = 0; i < sh.vels.length; i++) {
        const v = sh.vels[i];
        posAttr.setXYZ(i, posAttr.getX(i) + v.x * dt, posAttr.getY(i) + v.y * dt, posAttr.getZ(i) + v.z * dt);
      }
      posAttr.needsUpdate = true;
      sh.pts.material.opacity = Math.max(0, sh.life / sh.ttl);
      if (sh.life <= 0) sh.pts.visible = false;
    }
  }
}
