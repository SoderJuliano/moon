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
    this._scaled = false;
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
    this.anchorBaseScale = 1.0;
    new GLTFLoader().load("models/SteelCableAnchorPoint.glb", (g) => {
      this.anchor = g.scene;
      const box = new THREE.Box3().setFromObject(this.anchor);
      const size = Math.max(...box.getSize(new THREE.Vector3()).toArray());
      this.anchorBaseScale = size > 0 ? 1.0 / size : 1.0;
      this.anchor.scale.setScalar(this.anchorBaseScale * 0.03);
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
    this._scaled = false; // Reset da flag de escalonamento para o novo acoplamento
  }

  release() {
    this.state = null;
    this.payload = null;
    this.cable.visible = false;
    if (this.anchor) this.anchor.visible = false;
    this.payloadRadius = 0.05;
    this._scaled = false;
  }

  _scaleToShip() {
    if (!this.payload || this._scaled) return;
    this._scaled = true;
    const box = new THREE.Box3().setFromObject(this.payload);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const shipSize = 0.06; // tamanho da nave
    if (maxDim > shipSize) {
      const factor = shipSize / maxDim;
      this.payload.scale.multiplyScalar(factor);
      this.payloadRadius = shipSize * 0.5;
    }
  }

  update(dt, ship, camera) {
    if (!this.state || !this.payload) return null;
    const p = this.payload;

    if (this.state === "attaching") {
      const trailDist = 0.06 + (this.payloadRadius || 0.05) * 1.0;
      ship.speed = 0;
      ship.velocity.set(0, 0, 0);
      ship.keys.clear();
      this._cut += dt;
      const t = Math.min(1, this._cut / CUT_DUR);
      const e = t * t * (3 - 2 * t);
      
      // Alinhamento local atrás da nave (-Z local, ou seja, +Z) e levemente abaixo (-Y local)
      const localTarget = this._v.set(0, -0.02, trailDist);
      const tow = this._v2.copy(localTarget).applyQuaternion(ship.ship.quaternion).add(ship.ship.position);
      
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

    // A partir do momento em que acopla ("tow"), a rocha passa a ter no máximo o tamanho da nave
    if (this.state === "tow" && !this._scaled) {
      this._scaleToShip();
    }

    // recalculamos trailDist após o escalonamento para ajustar a distância do reboque
    const currentTrailDist = 0.06 + (this.payloadRadius || 0.05) * 1.0;

    // Alinhamento local constante atrás e abaixo da nave em coordenadas locais (evita que fique em cima da nave ao rotacionar)
    const localTarget = this._v.set(0, -0.02, currentTrailDist);
    const target = this._v2.copy(localTarget).applyQuaternion(ship.ship.quaternion).add(ship.ship.position);
    p.position.copy(target);
    p.rotation.y += dt * 0.5;
    this._cable(ship);
    return this.state;
  }

  _cable(ship) {
    if (!this.payload) return;
    
    // Ponto de saída do cabo na traseira da nave (coordenadas locais do gancho na nave)
    const tail = this._v.set(0, -0.015, 0.03)
      .applyQuaternion(ship.ship.quaternion)
      .add(ship.ship.position);
      
    // Direção da rocha para a traseira da nave
    const dirToShip = this._v2.copy(tail).sub(this.payload.position).normalize();
    
    // Posição de engate na superfície da rocha
    const anchorPos = this._v3.copy(this.payload.position)
      .addScaledVector(dirToShip, this.payloadRadius || 0.05);

    const pos = this.cable.geometry.attributes.position;
    pos.setXYZ(0, tail.x, tail.y, tail.z);
    pos.setXYZ(1, anchorPos.x, anchorPos.y, anchorPos.z);
    pos.needsUpdate = true;
    
    if (this.anchor && this.anchorBaseScale) {
      // Posiciona o gancho na superfície da rocha apontando para a traseira da nave
      this.anchor.position.copy(anchorPos);
      this.anchor.lookAt(tail);
      
      // Ajusta o tamanho do gancho para ser proporcional à rocha (35% do raio)
      const targetSize = Math.max(0.008, (this.payloadRadius || 0.05) * 0.35);
      this.anchor.scale.setScalar(this.anchorBaseScale * targetSize);
    }
  }
}
