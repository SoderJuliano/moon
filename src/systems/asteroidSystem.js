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
    this.loaded = false;
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
  // active=false (supercruise ou fora do voo) → despawn de tudo, mantém os dados.
  update(dt, { active, shipPos } = {}) {
    this._t += dt;
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

  // colisão: nave dentro do raio de algum asteroide ATIVO (só durante voo normal).
  // Retorna o descritor atingido (p/ futuro: dano/recurso) ou null.
  hitTest(shipPos) {
    if (!shipPos) return null;
    for (const inst of this._active.values()) {
      if (shipPos.distanceTo(inst.world) < inst.collisionR) return inst.desc;
    }
    return null;
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

  dispose() {
    this._despawnAll();
    this._pool.clear();
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
