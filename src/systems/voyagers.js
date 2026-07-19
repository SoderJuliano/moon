import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";

const AU = 23480; // 1 AU em raios terrestres (escala do jogo)

// Direções eclípticas aproximadas baseadas nas posições reais das Voyagers:
// Voyager 1: Ascensão Reta ~17h 13m, Declinação +12° 28' => Longitude ~258°, Latitude ~35°
const V1_DIR = new THREE.Vector3(
  Math.cos(35 * Math.PI / 180) * Math.cos(258 * Math.PI / 180),
  Math.sin(35 * Math.PI / 180),
  Math.cos(35 * Math.PI / 180) * Math.sin(258 * Math.PI / 180)
).normalize();

// Voyager 2: Ascensão Reta ~20h 02m, Declinação -58° => Longitude ~290°, Latitude ~-37°
const V2_DIR = new THREE.Vector3(
  Math.cos(-37 * Math.PI / 180) * Math.cos(290 * Math.PI / 180),
  Math.sin(-37 * Math.PI / 180),
  Math.cos(-37 * Math.PI / 180) * Math.sin(290 * Math.PI / 180)
).normalize();

const SHOW_DIST = 150; // Distância (em unidades de cena) para exibir o modelo 3D
const SIZE = 0.4; // Tamanho visual da sonda na cena

export class VoyagerSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Voyager 1
    this.v1 = {
      id: "voyager1",
      name: "Voyager 1",
      dir: V1_DIR,
      baseDist: 163, // AU
      speedPerDay: 0.00986, // AU/dia (~3.6 AU por ano)
      mesh: null,
      glow: null,
      pos: new THREE.Vector3(),
    };

    // Voyager 2
    this.v2 = {
      id: "voyager2",
      name: "Voyager 2",
      dir: V2_DIR,
      baseDist: 136, // AU
      speedPerDay: 0.00877, // AU/dia (~3.2 AU por ano)
      mesh: null,
      glow: null,
      pos: new THREE.Vector3(),
    };

    this.voyagers = [this.v1, this.v2];
    this._loading = false;
    this._loaded = false;
    this._proto = null;

    this._initGlows();
  }

  _initGlows() {
    const glowTex = radialGlowTexture("#ffe8aa"); // Brilho dourado/quente característico (disco de ouro)
    for (const v of this.voyagers) {
      v.glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffddaa,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.group.add(v.glow);
    }
  }

  _loadModel() {
    if (this._loading) return;
    this._loading = true;
    new GLTFLoader().load("models/voyager.glb", (gltf) => {
      const model = gltf.scene;

      // Normaliza as dimensões do modelo 3D para SIZE
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = SIZE / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());

      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);

      this._proto = model;
      this._loaded = true;

      // Cria clones do modelo para cada Voyager
      for (const v of this.voyagers) {
        v.mesh = new THREE.Group();
        v.mesh.add(this._proto.clone());
        v.mesh.visible = false;
        this.group.add(v.mesh);
      }
    });
  }

  update(dt, simDays, cameraPos) {
    for (const v of this.voyagers) {
      // Afastamento dinâmico baseado nos dias de simulação decorridos
      const currentDistAU = v.baseDist + v.speedPerDay * simDays;
      v.pos.copy(v.dir).multiplyScalar(currentDistAU * AU);

      // Posiciona o sprite de brilho (sempre visível de longe)
      v.glow.position.copy(v.pos);

      const dCam = cameraPos.distanceTo(v.pos);

      // Ajusta escala do brilho para mantê-lo visível a distâncias interestelares
      v.glow.scale.setScalar(THREE.MathUtils.clamp(dCam * 0.006, 6, 30000));

      const isNear = dCam < SHOW_DIST;
      if (isNear) {
        if (!this._loaded && !this._loading) {
          this._loadModel();
        }
        if (v.mesh) {
          v.mesh.position.copy(v.pos);
          v.mesh.visible = true;
          // Rotação sutil no espaço profundo
          v.mesh.rotation.y += dt * 0.12;
          v.mesh.rotation.x += dt * 0.04;
        }
        // Desvanece o brilho de longe à medida que nos aproximamos do modelo real
        const gk = THREE.MathUtils.clamp((dCam - 12) / (SHOW_DIST - 12), 0, 1);
        v.glow.material.opacity = gk * 0.9;
      } else {
        if (v.mesh) v.mesh.visible = false;
        v.glow.material.opacity = 0.9;
      }
    }
  }
}
