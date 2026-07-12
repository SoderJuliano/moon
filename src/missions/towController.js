// TowController — mecânica de REBOQUE reutilizável (cabo + imã + cutscene).
//
// Encapsula o "coletar e rebocar" pra qualquer objeto: a cena curta de
// acoplamento (nave congelada, câmera lateral, objeto puxado até a traseira),
// o cabo/imã (SteelCableAnchorPoint) e o seguir-atrás enquanto reboca. As
// missões só decidem O QUE rebocar e QUANDO entregou — o resto vive aqui.
//
// Uso:
//   tow.attach(obj3d)          // começa a cutscene rebocando obj3d (já na cena)
//   const ph = tow.update(dt, ship, camera)  // "attaching" | "tow" | null
//   tow.release()              // solta (na entrega) — some cabo/imã

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const TRAIL = 0.4; // distância do objeto atrás da nave
const CUT_DUR = 4.2; // s da cutscene de acoplamento

export class TowController {
  constructor(scene) {
    this.scene = scene;
    this.payload = null;
    this.state = null; // null | "attaching" | "tow"
    this._cut = 0;
    this._from = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();

    this.cable = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x9fb0c0 })
    );
    this.cable.visible = false;
    scene.add(this.cable);

    this.anchor = null;
    new GLTFLoader().load("models/SteelCableAnchorPoint.glb", (g) => {
      this.anchor = g.scene;
      const box = new THREE.Box3().setFromObject(this.anchor);
      this.anchor.scale.setScalar(0.03 / Math.max(...box.getSize(new THREE.Vector3()).toArray()));
      this.anchor.visible = false;
      scene.add(this.anchor);
    });
  }

  get phase() {
    return this.state;
  }
  isTowing() {
    return this.state === "tow";
  }

  attach(obj) {
    this.payload = obj;
    this._from.copy(obj.position);
    this._cut = 0;
    this.state = "attaching";
    this.cable.visible = true;
    if (this.anchor) this.anchor.visible = true;

    // Calcula o raio/tamanho do objeto rebocado para afastar o cabo e ajustar a câmera
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    this.payloadRadius = Math.max(size.x, size.y, size.z) * 0.5;
  }

  release() {
    this.state = null;
    this.payload = null;
    this.cable.visible = false;
    if (this.anchor) this.anchor.visible = false;
    this.payloadRadius = 0.05;
  }

  update(dt, ship, camera) {
    if (!this.state || !this.payload) return null;
    const p = this.payload;
    const trailDist = 0.4 + (this.payloadRadius || 0.05) * 1.5;

    if (this.state === "attaching") {
      ship.speed = 0;
      ship.velocity.set(0, 0, 0);
      ship.keys.clear();
      this._cut += dt;
      const t = Math.min(1, this._cut / CUT_DUR);
      const e = t * t * (3 - 2 * t);
      const back = this._v.set(0, 0, 1).applyQuaternion(ship.ship.quaternion);
      const tow = this._v2.copy(ship.ship.position).addScaledVector(back, trailDist).addScaledVector(this._v3.set(0, -1, 0), 0.15);
      p.position.copy(this._from).lerp(tow, e);
      p.rotation.y += dt * 0.7;
      if (this.anchor && t > 0.55) this.anchor.rotation.z += dt * 4;
      this._cable(ship);
      // câmera lateral enquadrando nave + objeto
      const camDir = this._v.set(1, 0.35, 0.35).applyQuaternion(ship.ship.quaternion).normalize();
      camera.position.lerp(this._v2.copy(ship.ship.position).addScaledVector(camDir, 2.4), Math.min(1, dt * 3));
      camera.lookAt(this._v3.copy(ship.ship.position).add(p.position).multiplyScalar(0.5));
      if (t >= 1) this.state = "tow";
      return this.state;
    }

    // rebocando: segue atrás/abaixo da nave (cópia direta p/ eliminar qualquer tremor)
    const back = this._v.set(0, 0, 1).applyQuaternion(ship.ship.quaternion);
    const target = this._v2.copy(ship.ship.position).addScaledVector(back, trailDist).addScaledVector(this._v3.set(0, -1, 0), 0.15);
    p.position.copy(target);
    p.rotation.y += dt * 0.5;
    this._cable(ship);
    return this.state;
  }

  _cable(ship) {
    if (!this.payload) return;
    const tail = this._v.set(0, -0.03, 0.1).applyQuaternion(ship.ship.quaternion).add(ship.ship.position);
    const pos = this.cable.geometry.attributes.position;
    pos.setXYZ(0, tail.x, tail.y, tail.z);
    pos.setXYZ(1, this.payload.position.x, this.payload.position.y, this.payload.position.z);
    pos.needsUpdate = true;
    if (this.anchor) {
      this.anchor.position.copy(this.payload.position);
      this.anchor.lookAt(tail);
    }
  }
}
