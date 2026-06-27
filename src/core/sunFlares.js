// Labaredas (proeminências) do Sol — línguas de fogo que sobem em alguns pontos
// da borda e recolhem, em ciclo. Sprites additivos animados: leve, sem vídeo/gif
// (que não casa com a esfera), fiel à ideia procedural do projeto. O grupo fica
// na origem (o Sol fica em 0,0,0); tudo escala junto com o raio atual do Sol.

import * as THREE from "three";
import { radialGlowTexture } from "./textures.js";

function randomDir(out) {
  // ponto uniforme na esfera unitária
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(a), u, s * Math.sin(a));
}

export function createSunFlares(scene, count = 12) {
  const group = new THREE.Group();
  scene.add(group);

  const tex = radialGlowTexture("#ffb24d");
  const flares = [];
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex, color: 0xff7a1e, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    group.add(sprite);
    flares.push({
      sprite,
      dir: randomDir(new THREE.Vector3()),
      phase: Math.random(),
      speed: 0.18 + Math.random() * 0.28, // ciclos por segundo
      size: 0.12 + Math.random() * 0.22,
    });
  }

  return {
    group,
    // sunRadius = raio atual do Sol; intensity 0..1 (mais forte de perto).
    // A BASE de cada labareda fica ancorada logo abaixo da superfície (~0.85 R)
    // e ela sobe pra fora — assim parece presa no Sol, não solta no espaço.
    update(dt, sunRadius, intensity = 1) {
      for (const f of flares) {
        f.phase += dt * f.speed;
        if (f.phase >= 1) {
          f.phase -= 1;
          randomDir(f.dir); // renasce em outro ponto da borda
        }
        const rise = Math.sin(f.phase * Math.PI); // 0→1→0: sobe e recolhe
        const s = sunRadius * (0.16 + 0.26 * rise) * (0.5 + f.size);
        const halfH = s * 1.4 * 0.5; // metade da altura (y é alongado)
        const dist = sunRadius * 0.85 + halfH; // base presa na superfície
        f.sprite.position.copy(f.dir).multiplyScalar(dist);
        f.sprite.scale.set(s * 0.5, s * 1.4, 1); // alongado = língua de fogo
        f.sprite.material.opacity = rise * 0.9 * intensity;
      }
    },
  };
}
