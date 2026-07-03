// AsteroidField — DADOS de um campo de asteroides (sem meshes, sem THREE pesado).
//
// Um campo descreve uma região do espaço e gera, de forma DETERMINÍSTICA (RNG com
// seed), uma lista de "descritores" de asteroide: posição local, escala, eixo e
// velocidade de giro, drift mínimo e qual modelo usar. Os descritores são só
// números — milhares deles custam quase nada. O AsteroidSystem é quem decide
// quando virar mesh de verdade (streaming/pooling).
//
// O campo pode ser ANCORADO a um corpo (fica na vizinhança dele, deslocado para
// FORA da "bolha gigante" de aproximação) ou flutuar em coordenadas absolutas.
//
// Futuro: cada descritor pode ganhar campos (material, recurso/minério, raridade)
// sem afetar o streaming — a instância em runtime (no AsteroidSystem) é quem
// carrega estado mutável (hp, dano, etc.).

import * as THREE from "three";

// Espelha as constantes de aproximação da ShipFlight (planeta infla ~40×, mínimo
// 60u p/ os pequenos). Mantém os asteroides FORA do planeta quando ele fica gigante.
const APPROACH_MUL = 40;
const MIN_APPROACH_R = 60;

// RNG determinístico (mulberry32): mesma seed → mesmo campo sempre.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AsteroidField {
  // def: {
  //   id, kind: 'cluster'|'belt'|'scatter',
  //   anchorId?: string,        // corpo p/ ancorar (vizinhança); ausente = absoluto
  //   center?: [x,y,z],         // centro absoluto se não ancorado
  //   count, models: [key...],  // chaves de modelo (ver AsteroidSystem)
  //   scaleRange: [min,max],    // raio do asteroide em unidades de mundo
  //   spinRange: [min,max],     // rad/s
  //   drift?: number,           // velocidade de drift máxima (u/s) — bem pequena
  //   spread?: number,          // meia-extensão (cluster/scatter)
  //   torus?: { R, r },         // anel (belt)
  //   seed?: number,
  // }
  constructor(def) {
    this.id = def.id;
    this.def = def;
    this.descriptors = null; // lazy (gerado no 1º uso)
    this._offset = null; // deslocamento fixo a partir do corpo ancorado (seeded)
    this._rng = mulberry32((def.seed ?? 1) >>> 0);
  }

  _giantRadius(body) {
    const base = body.baseRadius || 1;
    return base * Math.max(APPROACH_MUL, MIN_APPROACH_R / base);
  }

  // gera os descritores uma vez (posições LOCAIS, relativas ao centro do campo)
  build() {
    if (this.descriptors) return this.descriptors;
    const d = this.def;
    const rng = this._rng;
    const out = [];
    const spread = d.spread ?? 8;
    for (let i = 0; i < d.count; i++) {
      const local = new THREE.Vector3();
      if (d.kind === "belt" && d.torus) {
        const ang = rng() * Math.PI * 2;
        const rr = d.torus.R + (rng() * 2 - 1) * d.torus.r;
        local.set(Math.cos(ang) * rr, (rng() * 2 - 1) * d.torus.r, Math.sin(ang) * rr);
      } else {
        // cluster (esfera achatada) / scatter (esfera grande esparsa)
        local.set((rng() * 2 - 1) * spread, (rng() * 2 - 1) * spread * 0.6, (rng() * 2 - 1) * spread);
      }
      // escala enviesada p/ pequenos (mais pedras pequenas que grandes)
      const t = Math.pow(rng(), 2);
      const scale = THREE.MathUtils.lerp(d.scaleRange[0], d.scaleRange[1], t);
      const modelKey = d.models[(rng() * d.models.length) | 0];
      const spinAxis = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      const spinSpeed = THREE.MathUtils.lerp(d.spinRange[0], d.spinRange[1], rng()) * (rng() < 0.5 ? -1 : 1);
      const drift = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).multiplyScalar(d.drift ?? 0);
      // orientação base aleatória (variedade visual), determinística
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2)
      );
      out.push({ id: `${this.id}:${i}`, modelKey, local, scale, spinAxis, spinSpeed, drift, quat });
    }
    this.descriptors = out;
    return out;
  }

  // raio aproximado do campo (broad-phase de streaming)
  get boundingRadius() {
    const d = this.def;
    if (d.kind === "belt" && d.torus) return d.torus.R + d.torus.r + (d.scaleRange?.[1] ?? 1);
    return (d.spread ?? 8) + (d.scaleRange?.[1] ?? 1);
  }

  // centro do campo em coordenadas de MUNDO. Ancorado: posição do corpo + um
  // deslocamento fixo. Se offsetDir/offsetDist forem fornecidos no def, usam-se
  // valores explícitos (cinturões posicionados com precisão); caso contrário o
  // deslocamento é gerado a partir da seed para FORA da bolha gigante.
  getCenter(getBody, out) {
    const d = this.def;
    if (d.anchorId && getBody) {
      const body = getBody(d.anchorId);
      if (body) {
        body.worldPosition(out);
        if (!this._offset) {
          let dir;
          if (d.offsetDir) {
            dir = new THREE.Vector3(...d.offsetDir).normalize();
          } else {
            const r = this._rng;
            dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
            if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
            dir.normalize();
          }
          const dist = d.offsetDist ?? (this._giantRadius(body) * 2.5 + this.boundingRadius);
          this._offset = dir.multiplyScalar(dist);
        }
        return out.add(this._offset);
      }
    }
    return out.set(d.center?.[0] ?? 0, d.center?.[1] ?? 0, d.center?.[2] ?? 0);
  }
}
