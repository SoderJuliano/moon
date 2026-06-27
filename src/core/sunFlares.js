// Labaredas (proeminências) do Sol — línguas de fogo que brotam da borda, sobem,
// tremulam e recolhem, renascendo em pontos aleatórios. Cada uma é um plano com
// textura de chama orientado RADIALMENTE pra fora (a base presa na superfície) e
// encarando a câmera — assim parece fogo saindo do Sol, não discos flutuando.
// Procedural e leve (sem vídeo/gif, que não casa com a esfera).

import * as THREE from "three";
import { flameTexture } from "./textures.js";

function randomDir(out) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(a), u, s * Math.sin(a));
}

export function createSunFlares(scene, count = 14) {
  const group = new THREE.Group();
  scene.add(group);

  const tex = flameTexture();
  const geo = new THREE.PlaneGeometry(1, 1);
  const flares = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    flares.push({
      mesh,
      dir: randomDir(new THREE.Vector3()),
      phase: Math.random(),
      speed: 0.2 + Math.random() * 0.4, // ciclos/s (varia)
      size: 0.1 + Math.random() * 0.25,
      wob: Math.random() * Math.PI * 2, // fase do tremor
    });
  }

  const _right = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _toCam = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  return {
    group,
    // sunRadius = raio atual; cameraPos p/ orientar; intensity 0..1 (forte de perto)
    update(dt, sunRadius, cameraPos, intensity = 1) {
      const now = performance.now();
      for (const f of flares) {
        f.phase += dt * f.speed;
        if (f.phase >= 1) {
          // renasce diferente: outro ponto, outro tamanho/velocidade (imprevisível)
          f.phase -= 1;
          randomDir(f.dir);
          f.size = 0.1 + Math.random() * 0.25;
          f.speed = 0.2 + Math.random() * 0.4;
        }
        const rise = Math.sin(f.phase * Math.PI); // 0→1→0
        const flick = 0.8 + 0.2 * Math.sin(now * 0.01 + f.wob); // tremor
        const h = sunRadius * (0.3 + 0.95 * rise) * (0.4 + f.size) * flick; // altura
        const w = sunRadius * (0.1 + 0.16 * f.size) * flick; // largura
        const dist = sunRadius * 0.9 + h * 0.5; // base ancorada na superfície

        f.mesh.position.copy(f.dir).multiplyScalar(dist);
        // base ortonormal: up = radial (f.dir); normal encara a câmera
        _toCam.copy(cameraPos).sub(f.mesh.position).normalize();
        _right.crossVectors(f.dir, _toCam);
        if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
        else _right.normalize();
        _fwd.crossVectors(_right, f.dir).normalize();
        _m.makeBasis(_right, f.dir, _fwd);
        f.mesh.quaternion.setFromRotationMatrix(_m);
        f.mesh.scale.set(w, h, 1);
        f.mesh.material.opacity = rise * 0.9 * intensity;
      }
    },
  };
}
