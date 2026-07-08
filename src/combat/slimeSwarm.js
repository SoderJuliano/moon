// ENXAME DE SLIMES — as criaturas na órbita de Netuno (missão do incidente).
//
// 5 slimes (SlimeEnemy.glb) ~2× a nave, agrupados. Quando o jogador entra no
// raio de detecção, vêm LENTAMENTE na direção dele. Encostou → ENGOLE: o slime
// cresce, a nave some dentro dele e explode (morte). Cada slime cai com 5 tiros
// do canhão (plugado como sistema de alvo).
//
// Pacote de combate, apartado. A missão liga/desliga via spawn()/clear().

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const COUNT = 5;
const SIZE = 0.12; // ~2× a nave (0.06)
const HP = 5; // 5 tiros por slime
const DETECT = 9; // u — raio em que "avistam" o jogador
const TOUCH = 0.16; // u — encostou → engole
const SPEED = 0.5; // u/s — bem lento
const HIT_R = 0.16;
const SWALLOW_SECS = 1.3;

export class SlimeSwarm {
  constructor(scene, getNeptune) {
    this.scene = scene;
    this.getNeptune = getNeptune;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.slimes = []; // { id, mesh, hp, alive }
    this._proto = null;
    this._loading = false;
    this._spawned = false;
    this.active = false;
    this.onCleared = null; // () => void — todos mortos
    this.onSwallow = null; // () => void — jogador engolido (morte)
    this._swallow = null; // { slime, t } durante a engolida
    this._c = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  get swallowing() {
    return !!this._swallow;
  }
  get remaining() {
    return this.slimes.filter((s) => s.alive).length;
  }

  // spawna em ESCALA DE NAVE, à frente do jogador. Netuno infla ~40× ao chegar
  // perto, então posicionar em múltiplos do raio de Netuno colocaria o enxame a
  // centenas de unidades (invisível, e o DETECT/TOUCH em unidades de nave nunca
  // dispararia). O agrupamento nasce ~8u à frente da nave, bem visível.
  spawn(ship) {
    if (this._spawned) {
      this.active = true;
      this.group.visible = true;
      return;
    }
    this._spawned = true;
    this.active = true;
    this.group.visible = true;
    // centro do enxame: à frente da nave (guardado agora; usado quando carregar)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.ship.quaternion);
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    this._hub = new THREE.Vector3().copy(ship.ship.position).addScaledVector(fwd, 8).addScaledVector(side, 1.5);
    if (this._loading) return;
    this._loading = true;
    new GLTFLoader().load("models/SlimeEnemy.glb", (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const scale = SIZE / Math.max(...box.getSize(new THREE.Vector3()).toArray());
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      const hub = this._hub || ship.ship.position;
      for (let i = 0; i < COUNT; i++) {
        const holder = new THREE.Group();
        holder.add(model.clone());
        // agrupados bem próximos uns dos outros (escala de nave)
        holder.position.copy(hub).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4));
        this.group.add(holder);
        this.slimes.push({ id: `slime-${i}`, mesh: holder, hp: HP, alive: true, phase: Math.random() * 6.28 });
      }
    });
  }

  update(dt, ship) {
    if (!this.active) return;
    const shipPos = ship.ship.position;

    // engolida em curso: cresce o slime sobre a nave e depois mata
    if (this._swallow) {
      const s = this._swallow;
      s.t += dt;
      const k = Math.min(1, s.t / SWALLOW_SECS);
      s.slime.mesh.scale.setScalar(1 + k * 2.5); // incha
      s.slime.mesh.position.lerp(shipPos, Math.min(1, dt * 6)); // envolve a nave
      ship.model.visible = false; // a nave "some dentro" dele
      if (k >= 1) {
        this._swallow = null;
        ship.model.visible = true;
        this.onSwallow?.(); // morte (o gameMode explode/renasce)
      }
      return;
    }

    for (const s of this.slimes) {
      if (!s.alive) continue;
      s.mesh.rotation.y += dt * 0.3;
      s.mesh.position.y += Math.sin((s.phase += dt) ) * dt * 0.05; // flutua
      const d = this._d.copy(shipPos).sub(s.mesh.position);
      const dist = d.length();
      if (dist < TOUCH) {
        this._swallow = { slime: s, t: 0 }; // encostou → engole
        return;
      }
      if (dist < DETECT) s.mesh.position.addScaledVector(d.normalize(), SPEED * dt); // persegue devagar
    }
  }

  // interface de alvo do canhão
  hitTest(pos) {
    if (!this.active) return null;
    for (const s of this.slimes) {
      if (!s.alive) continue;
      if (pos.distanceTo(s.mesh.position) < HIT_R) {
        return { id: s.id, center: s.mesh.position.clone(), r: HIT_R, maxHp: HP };
      }
    }
    return null;
  }
  destroy(id) {
    const s = this.slimes.find((x) => x.id === id);
    if (!s || !s.alive) return;
    s.alive = false;
    s.mesh.visible = false;
    if (this.remaining === 0) this.onCleared?.();
  }

  clear() {
    this.active = false;
    this.group.visible = false;
    this._swallow = null;
  }
}
