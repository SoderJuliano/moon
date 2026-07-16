// Nave alienígena — o inimigo do primeiro encontro PvE.
//
//  • Modelo: alienSpaceship.glb (lazy-load no trigger do combate).
//  • 4 de vida (cada bolt do jogador tira 1 — nós atiramos em dupla, dano
//    dobrado na prática). Plugada no PlasmaCannon como sistema de alvo
//    (hitTest/destroy/onDamaged) — nenhuma física paralela.
//  • Barra de vida DOM projetada acima do casco, sempre visível na luta.
//  • Canhão próprio: UM bolt por disparo (metade da cadência de dano do
//    jogador). O PRIMEIRO tiro é teleguiado — acerto garantido, a emboscada.
//  • Movimento: órbita-strafe ao redor do jogador a ~3u, sempre de frente.
//
// Quem orquestra estados (chegada/fuga/fim) é o CombatEncounter.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const SIZE = 0.16; // maior dimensão (~2.5× a nave do jogador)
export const ALIEN_MAX_HP = 4;
const HIT_RADIUS = 0.2; // generoso: o substep dos bolts do jogador é 0.12u

const BOLT_SPEED = 14; // mais lento que o do jogador (dá pra desviar)
const BOLT_TTL = 3.5;
const FIRE_EVERY = 2.9; // s entre tiros (1 bolt por vez)
const PLAYER_HIT_RADIUS = 0.1; // raio de acerto contra a nave do jogador
const STRAFE_DIST = 3.2; // distância de combate preferida
const CHASE_SPEED = 2.2; // u/s de correção de posição

export class AlienShip {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.alive = false;
    this.hp = ALIEN_MAX_HP;
    this.idTag = "alien"; // id no canhão — instâncias múltiplas (invasão) trocam
    this.loaded = false;
    this._loading = false;
    this.onDestroyed = null; // setado pelo CombatEncounter
    this.onPlayerHit = null; // (posMundo) => void

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._strafeA = Math.random() * Math.PI * 2;
    this._fireCd = 0;
    this._firstShot = true;
    this._holdFire = true; // só atira quando o encontro liberar

    // bolts inimigos: 1 por disparo, cor de energia alien (violeta quente)
    const geo = new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd05aff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.bolts = [];
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, vel: new THREE.Vector3(), ttl: 0, homing: false });
    }

    // barra de vida acima do casco (projetada pela CombatEncounter.update)
    this.bar = document.createElement("div");
    this.bar.className = "enemy-hp";
    this.bar.innerHTML = '<div class="enemy-hp-fill"></div>';
    this.bar.style.display = "none";
    document.body.appendChild(this.bar);
    this._fill = this.bar.querySelector(".enemy-hp-fill");
  }

  load(onDone) {
    if (this.loaded) {
      onDone?.();
      return;
    }
    if (this._loading) return;
    this._loading = true;
    new GLTFLoader().load("models/alienSpaceship.glb", (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = SIZE / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      this.group.add(model);
      this.loaded = true;
      onDone?.();
    });
  }

  spawnAt(pos) {
    this.group.position.copy(pos);
    this.group.scale.setScalar(0.01); // nasce "dentro" do portal e cresce
    this.hp = ALIEN_MAX_HP;
    this.alive = true;
    this._firstShot = true;
    this._holdFire = true;
    this._fireCd = 1.2;
    this.group.visible = true;
  }

  setFiring(on) {
    this._holdFire = !on;
  }

  hide() {
    this.alive = false;
    this.group.visible = false;
    this.bar.style.display = "none";
    for (const b of this.bolts) {
      b.ttl = 0;
      b.mesh.visible = false;
    }
  }

  // ---- interface de alvo do PlasmaCannon --------------------------------------
  hitTest(pos) {
    if (!this.alive || !this.group.visible) return null;
    if (pos.distanceTo(this.group.position) < HIT_RADIUS) {
      return { id: this.idTag, center: this.group.position.clone(), r: HIT_RADIUS, maxHp: ALIEN_MAX_HP };
    }
    return null;
  }

  onDamaged(id, hp) {
    this.hp = hp; // sincroniza a barra persistente com o HP que o canhão mantém
  }

  destroy() {
    this.hide();
    if (this.onDestroyed) this.onDestroyed();
  }

  // ---- tiro inimigo ------------------------------------------------------------
  _fire(playerPos) {
    const b = this.bolts.find((x) => x.ttl <= 0);
    if (!b) return;
    this._tmp.copy(playerPos).sub(this.group.position).normalize();
    b.mesh.position.copy(this.group.position).addScaledVector(this._tmp, 0.15);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmp);
    b.vel.copy(this._tmp).multiplyScalar(BOLT_SPEED);
    b.ttl = BOLT_TTL;
    b.homing = this._firstShot; // a emboscada: o 1º tiro persegue e ACERTA
    this._firstShot = false;
    b.mesh.visible = true;
  }

  // fase de luta: strafe + mira + tiros. playerPos null = sem alvo (fuga):
  // nada de movimento/mira aqui — o CombatEncounter conduz a nave ao portal.
  update(dt, playerPos) {
    if (!this.alive || !this.group.visible || !playerPos) {
      this._updateBolts(dt, playerPos); // bolts em voo continuam mesmo assim
      return;
    }
    // cresce saindo do portal
    if (this.group.scale.x < 1) {
      const s = Math.min(1, this.group.scale.x + dt * 0.9);
      this.group.scale.setScalar(s);
    }

    // órbita-strafe: gira devagar ao redor do jogador na distância de combate
    this._strafeA += dt * 0.35;
    this._tmp2.set(Math.cos(this._strafeA), 0.25 * Math.sin(this._strafeA * 0.7), Math.sin(this._strafeA));
    this._tmp.copy(playerPos).addScaledVector(this._tmp2.normalize(), STRAFE_DIST);
    const d = this._tmp.sub(this.group.position);
    const dist = d.length();
    // longe (jogador fugindo): persegue mais rápido pra não perder a luta
    const speed = Math.min(dist, CHASE_SPEED + Math.max(0, dist - 8) * 0.8);
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
      if (b.homing && playerPos) {
        // teleguiado: realinha a velocidade pro jogador a cada frame
        this._tmp.copy(playerPos).sub(b.mesh.position).normalize();
        b.vel.copy(this._tmp).multiplyScalar(BOLT_SPEED);
        b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmp);
      }
      b.mesh.position.addScaledVector(b.vel, dt);
      if (playerPos && b.mesh.position.distanceTo(playerPos) < PLAYER_HIT_RADIUS) {
        b.ttl = 0;
        b.mesh.visible = false;
        if (this.onPlayerHit) this.onPlayerHit(b.mesh.position);
        continue;
      }
      if (b.ttl <= 0) b.mesh.visible = false;
    }
  }

  // barra de vida projetada (chamada pelo CombatEncounter com a câmera)
  updateBar(camera) {
    if (!this.alive || !this.group.visible) {
      this.bar.style.display = "none";
      return;
    }
    this._tmp.copy(this.group.position).project(camera);
    if (this._tmp.z > 1 || Math.abs(this._tmp.x) > 1 || Math.abs(this._tmp.y) > 1) {
      this.bar.style.display = "none";
      return;
    }
    const x = (this._tmp.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._tmp.y * 0.5 + 0.5) * window.innerHeight - 30;
    this.bar.style.display = "";
    this.bar.style.left = `${x}px`;
    this.bar.style.top = `${y}px`;
    this._fill.style.width = `${(this.hp / ALIEN_MAX_HP) * 100}%`;
  }
}
