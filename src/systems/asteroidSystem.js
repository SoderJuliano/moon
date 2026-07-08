// AsteroidSystem — runtime/streaming dos asteroides (independente da ShipFlight).
//
// Responsabilidades:
//  • carregar os modelos (GLB + FBX) uma vez, normalizados a raio 1 e com material
//    decente (textura PBR de rocha real só onde o modelo não traz textura própria);
//  • STREAMING: a partir dos DADOS dos campos (AsteroidField), instanciar meshes só
//    para os asteroides dentro de um raio ao redor da nave; remover/devolver ao
//    POOL os que saem; durante o supercruise, despawnar tudo (mantém só os dados);
//  • COLISÃO: hitTest(pos) contra os asteroides ATIVOS — o disparo da explosão é
//    feito por quem integra (main.js), reutilizando ship.explode() (sem sistema
//    paralelo).
//
// Acoplamento: NÃO importa ShipFlight. Recebe estado já pronto via update()/hitTest.
//
// Futuro (sem reescrever): a "instância" em runtime ({ desc, obj, world, collisionR })
// é o lugar natural pra hp/dano/material/minério; tiros usam hitTest; destroços e
// partículas entram como efeitos disparados aqui; estações/sondas podem ser outros
// AsteroidField com modelos próprios.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// modelos disponíveis (servidos de /public/models). needsRock = aplica PBR de rocha
// real (modelo sem textura própria). type fbx|glb.
const DEFAULT_MODELS = {
  rocksSmall: { url: "models/Asteroid.glb", type: "glb", needsRock: false }, // grupo de pedras, texturizado
  rocksField: { url: "models/Asteroids.glb", type: "glb", needsRock: false }, // cinturão denso (material baked)
  rockSingle: { url: "models/AsteroidSingle.glb", type: "glb", needsRock: true }, // pedra única (tem UV, sem textura)
  rockHi: { url: "models/AsteroidRock.fbx", type: "fbx", needsRock: true }, // pedra FBX (geometria pura)
};

// textura de rocha real (CC0, Poly Haven "rock_06"); baixada em /public/textures
const ROCK_TEX = {
  map: "textures/rock_06_diff_1k.jpg",
  normal: "textures/rock_06_nor_gl_1k.jpg",
  rough: "textures/rock_06_rough_1k.jpg",
};

export class AsteroidSystem {
  constructor(scene, { getBody = null, streamRadius = 35, poolCap = 32, models = DEFAULT_MODELS } = {}) {
    this.scene = scene;
    this.getBody = getBody;
    this.streamRadius = streamRadius;
    this.poolCap = poolCap;
    this.modelDefs = models;

    this.fields = [];
    this.belts = []; // cinturões densos instanciados (AsteroidBelt)
    this.loaded = false;
    this._sources = null; // geometrias fundidas p/ instancing (lazy, pós-load)
    this._protos = new Map(); // key -> Object3D (root scale 1, inner normalizado a raio 1)
    this._pool = new Map(); // key -> [Object3D livres]
    this._active = new Map(); // descId -> { desc, obj, world:Vector3, collisionR }
    this._disposables = []; // geometrias/materiais/texturas p/ dispose()

    this._t = 0;
    this._tmp = new THREE.Vector3();
    this._center = new THREE.Vector3();
    this._need = new Set();
  }

  addField(field) {
    this.fields.push(field);
    field.build(); // gera os descritores (dados) já — barato
    return this;
  }

  // cinturão denso (instanciado). Construído no 1º update após o load dos modelos.
  addBelt(belt) {
    this.belts.push(belt);
    return this;
  }

  // remove um campo e despawna seus asteroides ativos (espelho de addField; usado
  // pelos campos dinâmicos/temporários dos encontros — AsteroidEncounter).
  removeField(id) {
    const idx = this.fields.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const [field] = this.fields.splice(idx, 1);
    for (const desc of field.descriptors || []) {
      const inst = this._active.get(desc.id);
      if (inst) {
        this._despawn(inst);
        this._active.delete(desc.id);
      }
    }
  }

  // carrega modelos + textura de rocha. Idempotente; resolve quando pronto.
  async load() {
    if (this.loaded || this._loading) return this._loading;
    this._loading = this._loadAll().catch((err) => {
      console.warn("[AsteroidSystem] carregamento falhou:", err);
    });
    await this._loading;
    this.loaded = true;
  }

  async _loadAll() {
    const gltf = new GLTFLoader();
    const fbx = new FBXLoader();
    const texLoader = new THREE.TextureLoader();

    // textura de rocha real (compartilhada pelos modelos sem textura). Se falhar,
    // segue sem ela (modelos sem textura ficam com o material baked).
    let rock = null;
    try {
      rock = await this._loadRockMaterialTextures(texLoader);
    } catch (err) {
      console.warn("[AsteroidSystem] textura de rocha indisponível, usando material baked:", err);
    }

    await Promise.all(
      Object.entries(this.modelDefs).map(async ([key, def]) => {
        try {
          let obj;
          if (def.type === "fbx") {
            obj = await fbx.loadAsync(def.url);
          } else {
            const g = await gltf.loadAsync(def.url);
            obj = g.scene;
          }
          this._prepareMaterials(obj, def.needsRock ? rock : null);
          this._protos.set(key, this._normalize(obj));
        } catch (err) {
          console.warn(`[AsteroidSystem] falha ao carregar ${def.url}:`, err);
        }
      })
    );
  }

  async _loadRockMaterialTextures(loader) {
    const [map, normalMap, roughnessMap] = await Promise.all([
      loader.loadAsync(ROCK_TEX.map),
      loader.loadAsync(ROCK_TEX.normal),
      loader.loadAsync(ROCK_TEX.rough),
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      this._disposables.push(t);
    }
    return { map, normalMap, roughnessMap };
  }

  // garante materiais bem iluminados; aplica a rocha PBR onde o modelo não tem textura
  _prepareMaterials(root, rock) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      if (rock) {
        const mat = new THREE.MeshStandardMaterial({
          map: rock.map, normalMap: rock.normalMap, roughnessMap: rock.roughnessMap,
          roughness: 1, metalness: 0, color: 0x9a8f82,
        });
        o.material = mat;
        this._disposables.push(mat);
      } else if (o.material) {
        // modelo já texturizado: só garante que não fique espelhado/plástico
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if ("metalness" in m) m.metalness = Math.min(m.metalness ?? 0, 0.1);
          if ("roughness" in m) m.roughness = Math.max(m.roughness ?? 0.8, 0.8);
        }
      }
    });
  }

  // centraliza e escala p/ raio 1, em DUAS camadas: o root fica com scale 1 (livre
  // p/ o clone definir a escala do asteroide); a camada interna guarda a normalização.
  _normalize(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius || 1;
    obj.position.sub(sphere.center); // centro do modelo na origem

    const norm = new THREE.Group();
    norm.scale.setScalar(1 / r);
    norm.add(obj);

    const proto = new THREE.Group();
    proto.add(norm);
    proto.userData.isAsteroidProto = true;
    return proto;
  }

  // ---- streaming -----------------------------------------------------------
  // active=false (supercruise ou explosão) → despawn dos CAMPOS, mantém os dados.
  // Os CINTURÕES instanciados ficam visíveis mesmo no supercruise (são cenário
  // fixo; só a colisão é gateada lá fora) — beltsVisible=false os esconde
  // (modo fantasia, onde a escala do sistema é outra).
  update(dt, { active, shipPos, beltsVisible = true } = {}) {
    this._t += dt;

    if (this.loaded) {
      for (const belt of this.belts) {
        if (!belt.built) belt.build(this.scene, this._beltSources());
        belt.update(dt, shipPos, beltsVisible, this.getBody);
      }
    }

    if (!active || !shipPos) {
      if (this._active.size) this._despawnAll();
      return;
    }
    if (!this.loaded) return;

    const need = this._need;
    need.clear();
    const reach = this.streamRadius;

    for (const field of this.fields) {
      const center = field.getCenter(this.getBody, this._center);
      // broad-phase: pula o campo inteiro se longe demais
      if (shipPos.distanceTo(center) > reach + field.boundingRadius) continue;
      for (const desc of field.descriptors) {
        const world = this._tmp
          .copy(center)
          .add(desc.local)
          .addScaledVector(desc.drift, this._t); // drift lentíssimo
        if (shipPos.distanceTo(world) > reach) continue;
        need.add(desc.id);
        let inst = this._active.get(desc.id);
        if (!inst) inst = this._spawn(desc);
        if (!inst) continue; // modelo ainda não carregado
        inst.world.copy(world);
        inst.obj.position.copy(world);
        inst.obj.rotateOnAxis(desc.spinAxis, desc.spinSpeed * dt);
      }
    }

    // despawna os ativos que não são mais necessários
    for (const [id, inst] of this._active) {
      if (!need.has(id)) {
        this._despawn(inst);
        this._active.delete(id);
      }
    }
  }

  // colisão: ponto dentro do raio de algum asteroide ATIVO (nave OU projétil).
  // Retorna { id, r, center } do atingido (r/center p/ dano e efeitos) ou null.
  hitTest(shipPos) {
    if (!shipPos) return null;
    for (const inst of this._active.values()) {
      if (shipPos.distanceTo(inst.world) < inst.collisionR) {
        return { id: inst.desc.id, r: inst.collisionR, center: inst.world.clone() };
      }
    }
    for (const belt of this.belts) {
      const hit = belt.hitTest(shipPos);
      if (hit) return hit;
    }
    return null;
  }

  // asteroide ATIVO mais próximo de um ponto (dentro de maxDist) — o scanner usa
  // pra rotular a rocha em mira. { id, center, dist } ou null. (só instâncias
  // streaming; os cinturões densos têm hitTest próprio e não entram aqui.)
  nearestActive(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const inst of this._active.values()) {
      const d = pos.distanceTo(inst.world);
      if (d < bestD) {
        bestD = d;
        best = { id: inst.desc.id, center: inst.world.clone(), dist: d };
      }
    }
    return best;
  }

  // remove um asteroide específico (campo OU cinturão) — despawna/esconde e apaga
  // o descritor. Chamado ao colidir: o asteroide some junto com a nave.
  destroyAsteroid(id) {
    for (const belt of this.belts) {
      if (belt.destroyRock(id)) return true;
    }
    const inst = this._active.get(id);
    if (inst) {
      this._despawn(inst);
      this._active.delete(id);
    }
    for (const field of this.fields) {
      if (!field.descriptors) continue;
      const idx = field.descriptors.findIndex((d) => d.id === id);
      if (idx !== -1) {
        field.descriptors.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  // ---- pooling -------------------------------------------------------------
  _spawn(desc) {
    const proto = this._protos.get(desc.modelKey);
    if (!proto) return null;
    const free = this._pool.get(desc.modelKey);
    const obj = free && free.length ? free.pop() : proto.clone(true);
    obj.scale.setScalar(desc.scale);
    obj.quaternion.copy(desc.quat);
    obj.visible = true;
    this.scene.add(obj);
    const inst = { desc, obj, world: new THREE.Vector3(), collisionR: desc.scale * 0.75 };
    this._active.set(desc.id, inst);
    return inst;
  }

  _despawn(inst) {
    this.scene.remove(inst.obj);
    let free = this._pool.get(inst.desc.modelKey);
    if (!free) this._pool.set(inst.desc.modelKey, (free = []));
    if (free.length < this.poolCap) free.push(inst.obj); // reaproveita; excedente vai p/ GC
  }

  _despawnAll() {
    for (const inst of this._active.values()) this._despawn(inst);
    this._active.clear();
  }

  // ---- fontes p/ instancing (cinturões) -------------------------------------
  // Funde as meshes de cada proto numa geometria única (com a normalização a
  // raio 1 aplicada) e escolhe um material — é o que o InstancedMesh precisa.
  _beltSources() {
    if (this._sources) return this._sources;
    const out = [];
    for (const [key, proto] of this._protos) {
      const src = this._mergeProto(key, proto);
      if (src) out.push(src);
    }
    return (this._sources = out);
  }

  _mergeProto(key, proto) {
    proto.updateMatrixWorld(true);
    const geos = [];
    let material = null;
    proto.traverse((o) => {
      if (!o.isMesh) return;
      let g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed(); // merge exige tudo indexado ou nada
      geos.push(g);
      if (!material) material = Array.isArray(o.material) ? o.material[0] : o.material;
    });
    if (!geos.length) return null;

    // atributos consistentes p/ o merge: position/normal sempre; uv/color só se
    // TODAS as partes tiverem (senão o merge falha)
    const hasUv = geos.every((g) => g.attributes.uv);
    const hasColor = geos.every((g) => g.attributes.color);
    for (const g of geos) {
      for (const name of Object.keys(g.attributes)) {
        const keep =
          name === "position" || name === "normal" ||
          (name === "uv" && hasUv) || (name === "color" && hasColor);
        if (!keep) g.deleteAttribute(name);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
    }

    let geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geometry) geometry = geos[0];
    // sem UV não dá pra texturizar: material de rocha liso (evita mapa quebrado)
    if (!hasUv && material?.map) material = this._plainRockMaterial();
    this._disposables.push(geometry);
    return { key, geometry, material, tris: geometry.attributes.position.count / 3 };
  }

  _plainRockMaterial() {
    if (!this._plainMat) {
      this._plainMat = new THREE.MeshStandardMaterial({ color: 0x8d8175, roughness: 1, metalness: 0 });
      this._disposables.push(this._plainMat);
    }
    return this._plainMat;
  }

  dispose() {
    this._despawnAll();
    this._pool.clear();
    for (const belt of this.belts) belt.dispose(this.scene);
    this.belts.length = 0;
    this._sources = null;
    for (const proto of this._protos.values()) {
      proto.traverse((o) => {
        if (o.isMesh) o.geometry?.dispose();
      });
    }
    this._protos.clear();
    for (const d of this._disposables) d.dispose?.();
    this._disposables.length = 0;
    this.loaded = false;
  }
}
