// Direção de câmera: transições suaves até um corpo (rastreando-o enquanto ele
// orbita), modo "seguir" (a câmera fica travada na órbita do corpo deixando o
// usuário girar ao redor) e visão panorâmica.

import * as THREE from "three";

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.tween = null;
    this.followBody = null;
    this._tmp = new THREE.Vector3();
    this._offset = new THREE.Vector3();
  }

  get isTweening() {
    return this.tween !== null;
  }

  // Solta o corpo seguido e ABORTA qualquer tween em voo (usado quando o usuário
  // assume o controle — ex.: W entra na nave no meio do voo da câmera; sem isso o
  // tween continua até ~4 raios do tamanho ANTIGO e o planeta, inflando pra escala
  // gigante, engole a câmera).
  stopFollow() {
    this.followBody = null;
    this.tween = null;
  }

  // Voa até um corpo e passa a segui-lo. A direção de aproximação é fixada no
  // início; o ALVO continua sendo recalculado a cada frame (o corpo se move).
  flyToBody(body, distanceMul = 4) {
    body.worldPosition(this._tmp);
    const dist = body.radius * distanceMul + 4;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0.45, 1);
    dir.normalize();
    this._start({ body, dir, dist }, 1.2);
  }

  // Sobe e olha o sistema de cima (como uma lâmpada no teto).
  flyToPanoramic(height) {
    this._start({ panoY: height }, 1.4);
  }

  _start(target, dur) {
    this.followBody = null;
    this.controls.enabled = false;
    this.tween = {
      fromPos: this.camera.position.clone(),
      fromTgt: this.controls.target.clone(),
      t: 0,
      dur,
      target,
    };
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.dur;
      const k = easeInOut(Math.min(tw.t, 1));

      // recalcula o destino a cada frame para acompanhar o corpo em movimento
      let goalPos, goalTgt;
      if (tw.target.body) {
        tw.target.body.worldPosition(this._tmp);
        goalTgt = this._tmp.clone();
        goalPos = this._tmp.clone().addScaledVector(tw.target.dir, tw.target.dist);
      } else {
        goalTgt = new THREE.Vector3(0, 0, 0);
        goalPos = new THREE.Vector3(0, tw.target.panoY, 0.01);
      }

      this.camera.position.lerpVectors(tw.fromPos, goalPos, k);
      this.controls.target.lerpVectors(tw.fromTgt, goalTgt, k);
      this.camera.lookAt(this.controls.target);

      if (tw.t >= 1) {
        this.tween = null;
        this.controls.enabled = true;
        if (tw.target.body) this.followBody = tw.target.body;
      }
      return;
    }

    // Modo seguir: mantém o offset atual (que o usuário pode girar/zoom via
    // OrbitControls) e recoloca o alvo exatamente sobre o corpo a cada frame.
    if (this.followBody) {
      this.followBody.worldPosition(this._tmp);
      this._offset.copy(this.camera.position).sub(this.controls.target);
      this.controls.target.copy(this._tmp);
      this.camera.position.copy(this._tmp).add(this._offset);
    }
  }
}
