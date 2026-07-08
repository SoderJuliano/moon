// Portal alienígena — o rasgo no espaço por onde a nave inimiga chega e foge.
//
// Estilo Rick & Morty mas SOMBRIO: núcleo negro (escurece o fundo de verdade,
// blending normal) envolto em véus azul-escuro/violeta aditivos pulsando, com
// fagulhas orbitando a borda pra dar movimento (glow radial é simétrico —
// girar o sprite não aparece; as fagulhas é que vendem a rotação).
//
// Visual puro: quem decide onde/quando abrir é o CombatEncounter.

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";

const SPARKS = 7;

export class Portal {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const mk = (color, scale, opacity, blending) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: radialGlowTexture(color), transparent: true, opacity, blending, depthWrite: false })
      );
      s.scale.setScalar(scale);
      this.group.add(s);
      return s;
    };
    this.core = mk("#04060c", 1.0, 0.97, THREE.NormalBlending); // negro central
    this.veil = mk("#16205e", 1.5, 0.75, THREE.AdditiveBlending); // azul profundo
    this.halo = mk("#3a2b8f", 1.9, 0.5, THREE.AdditiveBlending); // violeta escuro
    this.rim = mk("#5a7dff", 2.1, 0.4, THREE.AdditiveBlending); // fio da borda

    // fagulhas orbitando a borda (movimento do "redemoinho")
    this.sparks = [];
    for (let i = 0; i < SPARKS; i++) {
      const s = mk("#8fa8ff", 0.16 + Math.random() * 0.14, 0.85, THREE.AdditiveBlending);
      this.sparks.push({ s, a: (i / SPARKS) * Math.PI * 2, r: 0.95 + Math.random() * 0.12, w: 2.2 + Math.random() * 1.4 });
    }

    this._t = 0; // abertura 0..1
    this._target = 0;
    this._size = 1;
  }

  openAt(pos, size = 1.6) {
    this.group.position.copy(pos);
    this._size = size;
    this._target = 1;
    this.group.visible = true;
  }

  close() {
    this._target = 0;
  }

  get openness() {
    return this._t;
  }

  update(dt) {
    if (!this.group.visible) return;
    this._t += (this._target - this._t) * Math.min(1, dt * 3.5);
    if (this._target === 0 && this._t < 0.02) {
      this.group.visible = false;
      this._t = 0;
      return;
    }
    this.group.scale.setScalar(this._size * (0.04 + 0.96 * this._t));
    const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.06;
    this.veil.scale.setScalar(1.5 * pulse);
    this.rim.material.opacity = (0.3 + Math.sin(performance.now() * 0.007) * 0.12) * this._t;
    for (const p of this.sparks) {
      p.a += p.w * dt;
      p.s.position.set(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r, 0.02);
    }
  }
}
