import * as THREE from "three";
import { materialTint } from "./materials.js";

const AU = 23480; // 1 AU na escala do jogo (raios terrestres)
const CELL_SIZE = 12000; // Tamanho de cada chunk de streaming (XZ)
const R_INNER = 35 * AU; // Limite interno do cinturão (~821.800 unidades)
const R_OUTER = 110 * AU; // Limite externo do cinturão (~2.582.800 unidades)
const Y_HEIGHT = 1.5 * AU; // Meia-altura (espessura) vertical do cinturão (~35.220 unidades)
const SPIN_RADIUS = 300; // Pedras até esta distância da nave ganham rotação física

// RNG determinístico (mulberry32)
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

export class OuterAsteroidBelt {
  constructor(scene, asteroidsSystem) {
    this.scene = scene;
    this.asteroidsSystem = asteroidsSystem;

    this.activeChunks = new Map(); // "cx,cz" -> { group, cx, cz, rocks: [...] }
    this.destroyedRocks = new Set(); // ID de pedras destruídas pelo canhão
    this.sourceMap = null; // Cache dos protos merged de AsteroidSystem

    this._m = new THREE.Matrix4();
    this._col = new THREE.Color();
    this._q = new THREE.Quaternion();
  }

  buildSourceMap() {
    if (this.sourceMap) return true;
    if (!this.asteroidsSystem.loaded) return false;
    const sources = this.asteroidsSystem._beltSources();
    if (sources && sources.length > 0) {
      this.sourceMap = new Map(sources.map((s) => [s.key, s]));
      return true;
    }
    return false;
  }

  update(dt, shipPos) {
    if (!shipPos) return;

    // Se o jogador estiver muito acima ou abaixo do plano do cinturão, esvazia
    if (Math.abs(shipPos.y) > Y_HEIGHT + CELL_SIZE) {
      this.clearAll();
      return;
    }

    // Tenta montar o cache de modelos se ainda não estiver pronto
    if (!this.buildSourceMap()) return;

    const shipCx = Math.floor(shipPos.x / CELL_SIZE);
    const shipCz = Math.floor(shipPos.z / CELL_SIZE);

    const activeKeys = new Set();
    const radius = 2; // Raio de vizinhança de chunks (5x5 chunks)

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = shipCx + dx;
        const cz = shipCz + dz;

        const centerX = cx * CELL_SIZE + CELL_SIZE / 2;
        const centerZ = cz * CELL_SIZE + CELL_SIZE / 2;

        // Distância do chunk ao Sol (centro do sistema solar)
        const distToSun = Math.hypot(centerX, centerZ);

        // Se o chunk está fora do anel do cinturão de Kuiper, ignora
        if (distToSun < R_INNER - CELL_SIZE || distToSun > R_OUTER + CELL_SIZE) {
          continue;
        }

        // Filtro esférico ao redor da nave
        const distToShip = Math.hypot(shipPos.x - centerX, shipPos.z - centerZ);
        if (distToShip > CELL_SIZE * 2.2) {
          continue;
        }

        const key = `${cx},${cz}`;
        activeKeys.add(key);

        if (!this.activeChunks.has(key)) {
          this.loadChunk(cx, cz);
        }
      }
    }

    // Descarrega chunks distantes
    for (const key of this.activeChunks.keys()) {
      if (!activeKeys.has(key)) {
        this.unloadChunk(key);
      }
    }

    // Atualiza rotação física e colisão de pedras muito próximas
    this.updatePhysics(dt, shipPos);
  }

  loadChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const centerX = cx * CELL_SIZE + CELL_SIZE / 2;
    const centerZ = cz * CELL_SIZE + CELL_SIZE / 2;

    const chunkGroup = new THREE.Group();
    chunkGroup.position.set(centerX, 0, centerZ);

    // Seed baseada nas coordenadas espaciais
    const seed = Math.abs((cx * 73856093) ^ (cz * 19349663)) || 1;
    const rng = mulberry32(seed);

    // Número de asteroides por chunk
    const count = 40 + Math.floor(rng() * 30);
    const rocks = [];

    // Estrutura para agrupar por modelo
    const modelGroups = {};

    for (let i = 0; i < count; i++) {
      const lx = (rng() - 0.5) * CELL_SIZE;
      const lz = (rng() - 0.5) * CELL_SIZE;
      // Distribuição triangular em Y para concentrar na eclíptica
      const ly = (rng() + rng() - 1) * Y_HEIGHT * 0.4;

      const gx = centerX + lx;
      const gz = centerZ + lz;

      // Garante que cada rocha respeita exatamente o anel do cinturão
      const distToSun = Math.hypot(gx, gz);
      if (distToSun < R_INNER || distToSun > R_OUTER) {
        continue;
      }

      // Distribuição de escalas (pequenas, médias e monólitos raros)
      const t = rng();
      let scale;
      if (t < 0.65) scale = 0.8 + rng() * 1.6;
      else if (t < 0.96) scale = 2.5 + rng() * 7.0;
      else scale = 11.0 + rng() * 18.0;

      const base = scale;
      const rockScale = new THREE.Vector3(base, base, base);
      const axis = (rng() * 3) | 0;
      rockScale.setComponent(axis, base * (1 + rng() * rng() * 1.6));
      if (rng() < 0.3) {
        rockScale.setComponent((axis + 1) % 3, base * (0.6 + rng() * 0.35));
      }

      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2)
      );

      const spinAxis = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      const spinSpeed = THREE.MathUtils.lerp(0.015, 0.16, rng()) * (rng() < 0.5 ? -1 : 1);

      const id = `outer-belt:${key}:${i}`;

      const keys = ["rockSingle", "rockHi", "rocksSmall"];
      const modelKey = keys[Math.floor(rng() * keys.length)];

      const rock = {
        id,
        localPos: new THREE.Vector3(lx, ly, lz),
        worldPos: new THREE.Vector3(gx, ly, gz),
        scale: rockScale,
        quat,
        modelKey,
        spinAxis,
        spinSpeed,
        collisionR: 0.7 * Math.max(rockScale.x, rockScale.y, rockScale.z),
        mesh: null,
        index: -1,
      };

      rocks.push(rock);

      if (!modelGroups[modelKey]) modelGroups[modelKey] = [];
      modelGroups[modelKey].push(rock);
    }

    // Instancia as meshes no grupo do chunk
    for (const [modelKey, rocksForModel] of Object.entries(modelGroups)) {
      const src = this.sourceMap.get(modelKey);
      if (!src) continue;

      const instMesh = new THREE.InstancedMesh(src.geometry, src.material, rocksForModel.length);
      instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instMesh.frustumCulled = false;

      for (let idx = 0; idx < rocksForModel.length; idx++) {
        const r = rocksForModel[idx];
        
        // Se a rocha já foi destruída anteriormente, nasce com escala zero
        const isDestroyed = this.destroyedRocks.has(r.id);
        const finalScale = isDestroyed ? new THREE.Vector3(0, 0, 0) : r.scale;

        this._m.compose(r.localPos, r.quat, finalScale);
        instMesh.setMatrixAt(idx, this._m);
        instMesh.setColorAt(idx, materialTint(r.id, this._col));

        r.mesh = instMesh;
        r.index = idx;
      }

      chunkGroup.add(instMesh);
    }

    this.scene.add(chunkGroup);
    this.activeChunks.set(key, { group: chunkGroup, cx, cz, rocks });
  }

  unloadChunk(key) {
    const chunk = this.activeChunks.get(key);
    if (!chunk) return;

    this.scene.remove(chunk.group);
    chunk.group.clear();
    this.activeChunks.delete(key);
  }

  clearAll() {
    for (const key of this.activeChunks.keys()) {
      this.unloadChunk(key);
    }
    this.activeChunks.clear();
  }

  updatePhysics(dt, shipPos) {
    const r2 = SPIN_RADIUS * SPIN_RADIUS;

    for (const chunk of this.activeChunks.values()) {
      // Pula chunks distantes da física fina
      const distToShipSq = shipPos.distanceToSquared(chunk.group.position);
      if (distToShipSq > CELL_SIZE * CELL_SIZE * 1.5) continue;

      let needsMatrixUpdate = false;

      for (const rock of chunk.rocks) {
        if (this.destroyedRocks.has(rock.id)) continue;

        // Verifica se a rocha está no raio de rotação ativa da nave
        if (rock.worldPos.distanceToSquared(shipPos) > r2) continue;

        // Aplica a rotação da rocha
        this._q.setFromAxisAngle(rock.spinAxis, rock.spinSpeed * dt);
        rock.quat.multiply(this._q);

        this._m.compose(rock.localPos, rock.quat, rock.scale);
        rock.mesh.setMatrixAt(rock.index, this._m);
        
        rock.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  hitTest(shipPos) {
    const cx = Math.floor(shipPos.x / CELL_SIZE);
    const cz = Math.floor(shipPos.z / CELL_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.activeChunks.get(`${cx + dx},${cz + dz}`);
        if (!chunk) continue;

        for (const rock of chunk.rocks) {
          if (this.destroyedRocks.has(rock.id)) continue;

          if (shipPos.distanceTo(rock.worldPos) < rock.collisionR) {
            return {
              id: rock.id,
              r: rock.collisionR,
              center: rock.worldPos.clone(),
            };
          }
        }
      }
    }
    return null;
  }

  destroyRock(id) {
    if (this.destroyedRocks.has(id)) return false;
    this.destroyedRocks.add(id);

    // Atualiza visualmente na hora se o chunk estiver ativo
    const parts = id.split(":");
    if (parts.length >= 3) {
      const chunkKey = parts[1];
      const chunk = this.activeChunks.get(chunkKey);
      if (chunk) {
        const rock = chunk.rocks.find((r) => r.id === id);
        if (rock && rock.mesh) {
          this._m.compose(rock.localPos, rock.quat, new THREE.Vector3(0, 0, 0));
          rock.mesh.setMatrixAt(rock.index, this._m);
          rock.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
    return true;
  }

  rockWorld(id, out) {
    if (this.destroyedRocks.has(id)) return null;
    
    const parts = id.split(":");
    if (parts.length >= 3) {
      const chunkKey = parts[1];
      const chunk = this.activeChunks.get(chunkKey);
      if (chunk) {
        const rock = chunk.rocks.find((r) => r.id === id);
        if (rock) {
          return out.copy(rock.worldPos);
        }
      }
    }
    return null;
  }

  nearestActive(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;

    const cx = Math.floor(pos.x / CELL_SIZE);
    const cz = Math.floor(pos.z / CELL_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.activeChunks.get(`${cx + dx},${cz + dz}`);
        if (!chunk) continue;

        for (const rock of chunk.rocks) {
          if (this.destroyedRocks.has(rock.id)) continue;
          const radius = rock.collisionR || 0.1;
          const d = pos.distanceTo(rock.worldPos) - radius;
          if (d < bestD) {
            bestD = d;
            best = { id: rock.id, center: rock.worldPos.clone(), dist: d, radius };
          }
        }
      }
    }
    return best;
  }

  rocksNear(pos, maxDist = Infinity) {
    const out = [];
    const cx = Math.floor(pos.x / CELL_SIZE);
    const cz = Math.floor(pos.z / CELL_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.activeChunks.get(`${cx + dx},${cz + dz}`);
        if (!chunk) continue;

        for (const rock of chunk.rocks) {
          if (this.destroyedRocks.has(rock.id)) continue;
          const radius = rock.collisionR || 0.1;
          const d = pos.distanceTo(rock.worldPos) - radius;
          if (d < maxDist) {
            out.push({ id: rock.id, center: rock.worldPos.clone(), dist: d, radius });
          }
        }
      }
    }
    return out;
  }

  dispose() {
    this.clearAll();
  }
}
