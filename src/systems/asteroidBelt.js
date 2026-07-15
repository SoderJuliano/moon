// AsteroidBelt — cinturão DENSO via instancing (estilo No Man's Sky).
//
// Diferente dos AsteroidFields (streaming de meshes individuais, bom para
// dezenas de pedras), o cinturão desenha MILHARES de pedras em ~4 draw calls
// com THREE.InstancedMesh: as matrizes vivem na GPU, o custo por pedra é quase
// zero e o campo inteiro fica visível de longe — cresce na tela conforme a
// aproximação, sem pop-in e sem streaming.
//
//  • Ancorado a um planeta (dir × dist) e alinhado ao anel orbital: alongado no
//    tangencial, achatado no vertical. A entrada da nave (ENTRY_OVERRIDES usa a
//    MESMA direção) garante o cinturão sempre no caminho spawn → planeta.
//  • Orçamento de triângulos POR MODELO: modelos pesados ganham poucas
//    instâncias, leves ganham muitas — o total fica estável seja qual for o mix.
//  • Colisão via grade espacial (hash) construída uma vez, em coords locais.
//  • Vida: só as pedras a até SPIN_RADIUS da nave giram (as demais nem são
//    tocadas pela CPU).

import * as THREE from "three";
import { materialTint } from "./materials.js";

const TRI_BUDGET_PER_MODEL = 550_000; // teto de tris instanciados por modelo (padrão)
const SPIN_RADIUS = 90; // pedras até essa distância da nave ganham rotação
const VISIBLE_DIST = 2600; // além disso (do bounding), o grupo some de vez
const CELL = 24; // célula da grade de colisão (maior que o maior monólito)

// RNG determinístico (mulberry32): mesma seed → mesmo cinturão sempre.
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

export class AsteroidBelt {
  // def: {
  //   id, anchorId,               // planeta âncora
  //   dir: [x,y,z], dist,         // centro = planeta + dir×dist (dir = eixo de entrada)
  //   halfExtents: [tang, vert, radial], // meia-extensão em cada eixo do anel
  //   count,                      // total de pedras (limitado pelo orçamento de tris)
  //   triBudget,                  // (opcional) tris por modelo — cinturões maiores
  //                               // precisam de mais para o count não ser cortado
  //   seed,
  // }
  constructor(def) {
    this.id = def.id;
    this.def = def;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.built = false;

    this._dir = new THREE.Vector3(...def.dir).normalize(); // radial (eixo de voo)
    this._tang = new THREE.Vector3().crossVectors(this._dir, new THREE.Vector3(0, 1, 0));
    if (this._tang.lengthSq() < 1e-6) this._tang.set(1, 0, 0);
    this._tang.normalize();
    this._vert = new THREE.Vector3().crossVectors(this._tang, this._dir).normalize();

    this._center = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._col = new THREE.Color();
    this._rocks = []; // { id, mesh, index, pos, quat, scale, spinAxis, spinSpeed, collisionR }
    this._byId = new Map();
    this._grid = new Map(); // "ix,iy,iz" -> [índices em _rocks]
    this._destroyed = new Set();
  }

  get boundingRadius() {
    const [a, b, c] = this.def.halfExtents;
    return Math.hypot(a, b, c);
  }

  getCenter(getBody, out) {
    const body = getBody ? getBody(this.def.anchorId) : null;
    if (body) body.worldPosition(out);
    else out.set(0, 0, 0);
    return out.addScaledVector(this._dir, this.def.dist);
  }

  // sources: [{ key, geometry, material, tris }] (geometrias fundidas, raio ~1)
  build(scene, sources) {
    if (this.built || !sources.length) return;
    const rng = mulberry32((this.def.seed ?? 1) >>> 0);
    const [hx, hy, hz] = this.def.halfExtents;
    const triBudget = this.def.triBudget ?? TRI_BUDGET_PER_MODEL;

    // instâncias por modelo: pesados primeiro (pegam pouco), o mais leve herda a
    // sobra — mantém o total de tris dentro do orçamento com qualquer mix.
    const per = sources
      .map((s) => ({ s, cap: Math.max(1, Math.floor(triBudget / Math.max(s.tris, 1))), n: 0 }))
      .sort((a, b) => b.s.tris - a.s.tris);
    let remaining = this.def.count;
    for (let i = 0; i < per.length; i++) {
      const want = Math.ceil(remaining / (per.length - i));
      per[i].n = Math.min(per[i].cap, want, remaining);
      remaining -= per[i].n;
    }
    const lightest = per[per.length - 1];
    lightest.n += Math.min(remaining, lightest.cap - lightest.n);

    const rand2 = () => rng() + rng() - 1; // -1..1 triangular (viés pro miolo)
    let rockId = 0;
    for (const { s, n } of per) {
      if (n <= 0) continue;
      const mesh = new THREE.InstancedMesh(s.geometry, s.material, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // o grupo inteiro liga/desliga por distância
      for (let i = 0; i < n; i++) {
        const pos = new THREE.Vector3()
          .addScaledVector(this._tang, rand2() * hx)
          .addScaledVector(this._vert, rand2() * hy)
          .addScaledVector(this._dir, rand2() * hz);

        // tamanho em bandas: cabe-um-dedo → maior que a nave → monólito raro
        const t = rng();
        let base;
        if (t < 0.5) base = 0.06 + rng() * 0.5;       // pequenas (1–9× a nave)
        else if (t < 0.86) base = 0.55 + rng() * 1.3; // bem maiores que a nave
        else if (t < 0.985) base = 1.8 + rng() * 2.4; // grandes
        else base = 5 + rng() * 5;                    // monólito (raro, até ~10u)

        // forma: compridos × redondos (estica um eixo, às vezes achata outro)
        const scale = new THREE.Vector3(base, base, base);
        const axis = (rng() * 3) | 0;
        scale.setComponent(axis, base * (1 + rng() * rng() * 1.8));
        if (rng() < 0.3) scale.setComponent((axis + 1) % 3, base * (0.55 + rng() * 0.4));

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2)
        );
        const spinAxis = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
        const spinSpeed = THREE.MathUtils.lerp(0.02, 0.35, rng()) * (rng() < 0.5 ? -1 : 1);

        this._m.compose(pos, quat, scale);
        mesh.setMatrixAt(i, this._m);

        const rock = {
          id: `${this.id}:${rockId++}`,
          mesh, index: i, pos, quat, scale, spinAxis, spinSpeed,
          collisionR: 0.7 * Math.max(scale.x, scale.y, scale.z),
        };
        // COR por material: tinge a instância (instanceColor multiplica o
        // material) — cada pedra ganha a tonalidade da sua composição.
        mesh.setColorAt(i, materialTint(rock.id, this._col));
        const ri = this._rocks.length;
        this._rocks.push(rock);
        this._byId.set(rock.id, rock);
        const key = `${Math.floor(pos.x / CELL)},${Math.floor(pos.y / CELL)},${Math.floor(pos.z / CELL)}`;
        let cell = this._grid.get(key);
        if (!cell) this._grid.set(key, (cell = []));
        cell.push(ri);
      }
      this.group.add(mesh);
    }
    scene.add(this.group);
    this.built = true;
  }

  // pos = nave em voo, câmera fora dele. visible=false (modo fantasia) esconde.
  update(dt, pos, visible, getBody) {
    if (!this.built) return;
    this.getCenter(getBody, this._center);
    this.group.position.copy(this._center);
    if (!visible || !pos) {
      this.group.visible = false;
      return;
    }
    const d = pos.distanceTo(this._center);
    this.group.visible = d < VISIBLE_DIST + this.boundingRadius;
    if (!this.group.visible) return;

    // rotação só nas pedras vizinhas (as outras ficam estáticas — de longe não
    // dá pra perceber, e a CPU não paga pelas 2 mil)
    if (d > this.boundingRadius + SPIN_RADIUS) return;
    this._local.copy(pos).sub(this._center);
    const r2 = SPIN_RADIUS * SPIN_RADIUS;
    for (const rock of this._rocks) {
      if (rock.pos.distanceToSquared(this._local) > r2) continue;
      if (this._destroyed.has(rock.id)) continue;
      this._q.setFromAxisAngle(rock.spinAxis, rock.spinSpeed * dt);
      rock.quat.multiply(this._q);
      this._m.compose(rock.pos, rock.quat, rock.scale);
      rock.mesh.setMatrixAt(rock.index, this._m);
      rock.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // colisão: grade local (célula da nave + 26 vizinhas). Devolve id + raio +
  // centro em mundo (r/center alimentam dano e efeitos dos tiros; a nave só usa id).
  hitTest(shipPos) {
    if (!this.built || !this.group.visible) return null;
    this._local.copy(shipPos).sub(this.group.position);
    const cx = Math.floor(this._local.x / CELL);
    const cy = Math.floor(this._local.y / CELL);
    const cz = Math.floor(this._local.z / CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix++)
      for (let iy = cy - 1; iy <= cy + 1; iy++)
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const cell = this._grid.get(`${ix},${iy},${iz}`);
          if (!cell) continue;
          for (const ri of cell) {
            const rock = this._rocks[ri];
            if (this._destroyed.has(rock.id)) continue;
            if (this._local.distanceTo(rock.pos) < rock.collisionR) {
              return {
                id: rock.id,
                r: rock.collisionR,
                center: rock.pos.clone().add(this.group.position),
              };
            }
          }
        }
    return null;
  }

  // posição em mundo de uma pedra por id ("beltId:n") — os rótulos do scanner
  // recomputam a cada frame (o centro do cinturão acompanha o planeta). null se
  // não existe mais (destruída) ou não é deste cinturão.
  rockWorld(id, getBody, out) {
    const rock = this._byId.get(id);
    if (!rock || this._destroyed.has(id)) return null;
    this.getCenter(getBody, out);
    return out.add(rock.pos);
  }

  // esconde a pedra atingida (escala 0 — não deixa "fantasma" nem buraco no buffer)
  destroyRock(id) {
    const rock = this._byId.get(id);
    if (!rock || this._destroyed.has(id)) return false;
    this._destroyed.add(id);
    this._m.compose(rock.pos, rock.quat, new THREE.Vector3(0, 0, 0));
    rock.mesh.setMatrixAt(rock.index, this._m);
    rock.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose(scene) {
    scene.remove(this.group);
    for (const child of this.group.children) child.dispose?.(); // buffers de instância
    this.group.clear();
    this._rocks.length = 0;
    this._byId.clear();
    this._grid.clear();
    this._destroyed.clear();
    this.built = false;
  }
}
