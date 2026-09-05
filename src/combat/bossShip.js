// BossShip — nave CAPITAL inimiga (a boss fight dos Gêmeos).
//
//  • Modelo pesado (86–88MB) com lazy-load: baixa quando o encontro arma.
//  • ~3u no eixo longo (~50× a nave do jogador): quando ela passa perto é o
//    cargueiro roçando no bote — o FleetEncounter dispara tremor + ronco.
//  • VIDA em duas camadas via o HP do PlasmaCannon (maxHp 30): os primeiros
//    10 hits são o ESCUDO (bolha invisível que acende azul no impacto e
//    ESTILHAÇA ao quebrar), os 20 seguintes são o CASCO.
//  • Canhão próprio: UM tiro pesado da PONTA, mais forte que o nosso
//    (2 de dano). Lenta, mas persegue — e de tempos em tempos faz uma
//    PASSADA acelerada por cima do jogador (o momento de cinema).
//
// Quem orquestra chegada/morte/fim é o FleetEncounter.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";
import { playShieldHit, playShieldBreak, playHeavyCannon } from "./battleSfx.js";
import { resolveAssetUrl } from "../game/remoteAssets.js";

export const BOSS_SHIELD_HP = 10;
export const BOSS_HULL_HP = 20;
export const BOSS_MAX_HP = BOSS_SHIELD_HP + BOSS_HULL_HP;

const SIZE = 3.0; // eixo longo (~50× a nave do jogador)
const SHIELD_R = SIZE * 0.62; // raio da bolha (envolve o casco todo)
const HULL_R = SIZE * 0.42; // raio de acerto no casco
const BOLT_DMG = 2; // mais forte que o nosso (que tira 1)
const BOLT_SPEED = 9; // pesado e visível — dá pra desviar
const BOLT_TTL = 4.5;
const FIRE_EVERY = 4.4; // s entre tiros
const CRUISE_SPEED = 0.55; // u/s — lenta, mas persegue
const PREF_DIST = 4.6; // distância de combate preferida
const PASS_SPEED = 5.2; // u/s durante a passada acelerada
const PASS_EVERY = [11, 17]; // s entre passadas (sorteado)
const PASS_DUR = 3.6; // s de cada passada

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
    this.onDestroyed = null; // setados pelo FleetEncounter
    this.onPlayerHit = null; // (posMundo, dano) => void
    this.onFlyby = null; // passada rasante perto do jogador (tremor + ronco)
    this.sfx = false; // sons de batalha (o encontro liga)

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._fireCd = 2.5;
    this._holdFire = true;
    // passadas aceleradas (o momento "cargueiro roçando no bote")
    this._passT = 0; // >0 = em passada
    this._passCd = PASS_EVERY[0] + Math.random() * (PASS_EVERY[1] - PASS_EVERY[0]);
    this._passDir = new THREE.Vector3();
    this._flybyDone = false;

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

    // estilhaços do escudo quebrando (casca de pontos azuis voando)
    const N = 90;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this._shatter = {
      pts: new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0x9fc6ff, size: 0.09, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      ),
      vels: Array.from({ length: N }, () => new THREE.Vector3()),
      life: 0,
      ttl: 1.4,
    };
    this._shatter.pts.visible = false;
    this._shatter.pts.frustumCulled = false;
    scene.add(this._shatter.pts);

    // bolt pesado: cilindro grosso carmesim (energia de nave capital)
    const boltGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.26, 8);
    boltGeo.rotateX(Math.PI / 2);
    const boltMat = new THREE.MeshBasicMaterial({
      color: 0xff5a4a, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.bolts = [];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, vel: new THREE.Vector3(), ttl: 0 });
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

  load(onDone) {
    if (this.loaded) {
      onDone?.();
      return;
    }
    if (this._loading) return;
    this._loading = true;
    // no Android o GLB vem do cache baixado do Drive; na web é o caminho local
    resolveAssetUrl(this.modelUrl).then((url) =>
    new GLTFLoader().load(url, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = SIZE / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      // exports com specular estourado viram farol — mesmo tratamento do cruzador
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
      this.group.add(fix);
      this.loaded = true;
      onDone?.();
    })
    );
  }

  spawnAt(pos) {
    this.group.position.copy(pos);
    this.group.scale.setScalar(0.02); // nasce dentro do portal e cresce
    this.hp = BOSS_MAX_HP;
    this.alive = true;
    this._holdFire = true;
    this._fireCd = 3;
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

  // ---- interface de alvo do PlasmaCannon ---------------------------------------
  hitTest(pos) {
    if (!this.alive || !this.group.visible) return null;
    const r = this.shielded ? SHIELD_R : HULL_R;
    if (pos.distanceTo(this.group.position) < r) {
      // noPuff no escudo (a bolha faz o próprio efeito); noBar sempre (as
      // barras longas do boss vivem no FleetEncounter, não na barrinha fininha)
      return {
        id: this.id, center: this.group.position.clone(), r,
        maxHp: BOSS_MAX_HP, noBar: true, noPuff: this.shielded,
      };
    }
    return null;
  }

  onDamaged(id, hp, maxHp, at) {
    const wasShielded = this.shielded;
    this.hp = hp;
    if (wasShielded) {
      this._shieldImpact(at);
      if (!this.shielded) this._shieldShatter(); // esse hit QUEBROU o escudo
    }
  }

  destroy() {
    this.hide();
    this.onDestroyed?.(this);
  }

  // ---- efeitos do escudo --------------------------------------------------------
  _shieldImpact(at) {
    this._shieldGlow = 1; // a bolha ACENDE azul e volta a sumir
    if (this.sfx) playShieldHit();
    const rip = this.ripples.find((x) => x.life <= 0);
    if (rip && at) {
      // a ondulação nasce NO ponto do impacto, projetado na casca da bolha
      this._tmp.copy(at).sub(this.group.position).normalize().multiplyScalar(SHIELD_R * 0.98);
      rip.s.position.copy(this.group.position).add(this._tmp);
      rip.s.scale.setScalar(0.3);
      rip.s.material.opacity = 0.9;
      rip.life = 0.5;
      rip.s.visible = true;
    }
  }

  _shieldShatter() {
    this.shieldMesh.visible = false;
    if (this.sfx) playShieldBreak();
    const sh = this._shatter;
    const posAttr = sh.pts.geometry.attributes.position;
    for (let i = 0; i < sh.vels.length; i++) {
      // cacos nascem espalhados NA casca e voam pra fora (a bolha explode)
      const dir = sh.vels[i]
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      posAttr.setXYZ(
        i,
        this.group.position.x + dir.x * SHIELD_R,
        this.group.position.y + dir.y * SHIELD_R,
        this.group.position.z + dir.z * SHIELD_R
      );
      dir.multiplyScalar(1.6 + Math.random() * 2.4);
    }
    posAttr.needsUpdate = true;
    sh.pts.material.opacity = 1;
    sh.life = sh.ttl;
    sh.pts.visible = true;
  }

  // ---- tiro pesado da ponta -------------------------------------------------------
  _fire(playerPos) {
    const b = this.bolts.find((x) => x.ttl <= 0);
    if (!b) return;
    this._tmp.copy(playerPos).sub(this.group.position).normalize();
    // nasce na PONTA da nave (meio comprimento à frente, no rumo do alvo)
    b.mesh.position.copy(this.group.position).addScaledVector(this._tmp, SIZE * 0.52);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmp);
    b.vel.copy(this._tmp).multiplyScalar(BOLT_SPEED);
    b.ttl = BOLT_TTL;
    b.mesh.visible = true;
    if (this.sfx) playHeavyCannon();
  }

  update(dt, playerPos) {
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

    if (this._passT > 0) {
      // PASSADA acelerada: atravessa reta, roçando o jogador
      this._passT -= dt;
      this.group.position.addScaledVector(this._passDir, PASS_SPEED * dt);
      // o nariz aponta pro rumo da passada (nave grande fazendo a curva depois)
      this._tmp2.copy(this.group.position).add(this._passDir);
      this.group.lookAt(this._tmp2);
      if (!this._flybyDone && dist < 3.2) {
        this._flybyDone = true;
        this.onFlyby?.(dist); // tremor + ronco de cargueiro (no encontro)
      }
    } else {
      // cruzeiro: lenta, sempre de frente, buscando a distância preferida
      if (dist > PREF_DIST) {
        this.group.position.addScaledVector(this._tmp.clone().normalize(), CRUISE_SPEED * dt);
      }
      this.group.lookAt(playerPos);
      this._passCd -= dt;
      if (this._passCd <= 0 && dist < 9) {
        // arma a próxima passada: mira um ponto LEVEMENTE ao lado do jogador
        // e segue além — passa por cima, não colide de propósito
        this._passCd = PASS_EVERY[0] + Math.random() * (PASS_EVERY[1] - PASS_EVERY[0]);
        this._passT = PASS_DUR;
        this._flybyDone = false;
        this._tmp2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.1);
        this._passDir.copy(playerPos).add(this._tmp2).sub(this.group.position).normalize();
      }
    }

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
      if (playerPos && b.mesh.position.distanceTo(playerPos) < 0.12) {
        b.ttl = 0;
        b.mesh.visible = false;
        this.onPlayerHit?.(b.mesh.position, BOLT_DMG);
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
    for (const rip of this.ripples) {
      if (rip.life <= 0) continue;
      rip.life -= dt;
      rip.s.scale.addScalar(dt * 3.2); // a ondulação expande
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
