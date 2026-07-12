// Estação Espacial Internacional em órbita da Terra (Game + Exploração).
//
// Ao contrário da REDE de satélites (que fica PARADA numa grade fixa), a ISS
// ORBITA: desliza num grande círculo inclinado ~51,6° (como a de verdade),
// dando uma volta lenta e apreciável. Fica numa CASCA RADIAL PRÓPRIA, abaixo
// da rede de satélites — como órbitas de raios diferentes nunca se cruzam,
// jamais colide com os satélites fixos, seja qual for a posição angular.
//
// "Detalhe de aproximação": não existe de longe — o GLB (~3,3MB, leve) só é
// baixado e desenhado quando a câmera/nave chega perto da Terra; longe, custo
// zero. Vale nos dois modos.
//
// No Game Mode é destrutível com 3 tiros (interface hitTest/destroy plugada no
// PlasmaCannon). Na Exploração é só cenário (não há canhão lá).

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";

const SIZE = 3.8; // ~64× a nave (0.06): estação claramente enorme perto dela
// Órbita em MÚLTIPLO do raio ATUAL: a Terra infla ~60× ao se aproximar e a
// colisão fica em 1.1×raio; uma altitude ABSOLUTA cairia dentro da colisão e a
// colisão fica em 1.1×raio. Usamos uma altitude fixa de 14 para acompanhar a
// expansão da superfície sem o efeito visual de 'fugir' do jogador. Garantimos 
// que fique sempre acima do raio de colisão (r * 1.1).
const ALTITUDE = 14;
const INCLINATION = (51.6 * Math.PI) / 180; // inclinação orbital real da ISS
const ORBIT_RATE = 0; // rad/s — parada no espaço
const SHOW_AT = 6; // aparece a < 6× o raio atual da Terra (igual à rede)
const HIDE_AT = 8; // some a > 8× (histerese)
const HIT_RADIUS = 1.6; // generoso: alvo grande, e o substep dos bolts é 0.12u
const GLINT_ANG = 0.01; // ponto de luz de longe (tamanho angular ~constante)
const GLINT_FADE_NEAR = 8;
const GLINT_FADE_FAR = 22;

export class SpaceStation {
  constructor(scene, getEarth) {
    this.getEarth = getEarth;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.alive = true;
    this.loaded = false;
    this._loading = false;
    this._angle = Math.random() * Math.PI * 2; // fase orbital inicial
    // base ortonormal do plano orbital inclinado (fixa no mundo)
    this._u = new THREE.Vector3(Math.cos(INCLINATION), Math.sin(INCLINATION), 0).normalize();
    this._v = new THREE.Vector3(0, 0, 1); // ⊥ a _u
    this._center = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._prev = new THREE.Vector3(); // p/ orientar a estação na direção do voo

    // glint: um ponto de luz pra achar a estação de longe (reflexo do Sol)
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#ffffff"), color: 0xdfeaff, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.group.add(this.glow);
  }

  _load() {
    if (this._loading) return;
    this._loading = true;
    new GLTFLoader().load("models/InternationalSpaceStation.glb", (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = SIZE / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      this.holder = new THREE.Group(); // holder p/ posição/orientação; modelo centrado dentro
      this.holder.add(model);
      this.group.add(this.holder);
      this.loaded = true;
    });
  }

  update(dt, cameraPos) {
    const earth = this.getEarth();
    if (!earth || !this.alive) return;
    earth.worldPosition(this._center);
    const r = earth.radius; // raio ATUAL (inflado na aproximação)
    const d = cameraPos.distanceTo(this._center);

    // Avança na órbita e calcula a posição SEMPRE, mesmo invisível,
    // para que o marcador da missão saiba onde a estação está.
    this._angle += ORBIT_RATE * dt;
    const shell = Math.max(r + ALTITUDE, r * 1.1 + 4); // Garante que a estação fique fora da parede invisível (r * 1.1)
    const dir = this._pos
      .copy(this._u).multiplyScalar(Math.cos(this._angle))
      .addScaledVector(this._v, Math.sin(this._angle));

    this.glow.position.copy(this._center).addScaledVector(dir, shell);

    if (!this.group.visible) {
      if (d >= r * SHOW_AT) return; // longe: não atualiza o modelo
      this.group.visible = true;
      this._load(); // primeira aproximação baixa o modelo
    } else if (d > r * HIDE_AT) {
      this.group.visible = false;
      return;
    }

    if (this.holder) {
      const pos = this._center.clone().addScaledVector(dir, shell);
      this.holder.position.copy(pos);
      // Nose in orbit tangent direction; "up" pointing away from Earth center (stable rotation)
      const tangent = new THREE.Vector3()
        .copy(this._v).multiplyScalar(Math.cos(this._angle))
        .addScaledVector(this._u, -Math.sin(this._angle))
        .normalize();
      this.holder.up.copy(dir);
      this.holder.lookAt(pos.clone().add(tangent));
    }

    // glint esmaecendo ao chegar perto (o modelo assume)
    const dc = cameraPos.distanceTo(this.glow.position);
    const t = THREE.MathUtils.clamp((dc - GLINT_FADE_NEAR) / (GLINT_FADE_FAR - GLINT_FADE_NEAR), 0, 1);
    this.glow.material.opacity = t * t * (3 - 2 * t) * 0.85;
    this.glow.scale.setScalar(THREE.MathUtils.clamp(dc * GLINT_ANG, 0.08, 0.9));
  }

  // interface de alvo do PlasmaCannon (só usada no Game Mode)
  hitTest(pos) {
    if (!this.group.visible || !this.alive || !this.holder) return null;
    if (pos.distanceTo(this.holder.position) < HIT_RADIUS) {
      return { id: "iss", center: this.holder.position.clone(), r: HIT_RADIUS, maxHp: 3 };
    }
    return null;
  }

  destroy() {
    this.alive = false;
    this.group.visible = false;
  }
}
