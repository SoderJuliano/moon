// Shipwreck — o cemitério atrás de Júpiter (SÓ no Game Mode).
//
// Cena de filme: do outro lado de Júpiter (oposto ao lado de entrada da nave)
// existe uma nuvem de asteroides muito maior que o cinturão principal e, no
// coração dela, um cruzador colonial partido — colidiu com as pedras e ficou
// ali, preso à órbita, tombando devagar junto com o campo. A escala conta a
// história: contra Júpiter gigante (~440u de raio inflado) o cruzador de 12u é
// um cisco; ao lado da nossa nave de 1 tripulante (~0,1u) ele é o Avalon de
// "Passageiros" — nós somos a formiga.
//
//  • O GLB é pesado (~47 MB, ~500k tris): só é BAIXADO quando a nave chega a
//    LOAD_DIST do local e só é RENDERIZADO dentro de VISIBLE_DIST — a mesma
//    faixa em que a nuvem de asteroides toma a tela.
//  • Colisão: esferas ao longo do casco (hitTest → quem integra explode a nave).
//  • Mistério: nenhum marcador de longe. Ao entrar em SIGNAL_DIST, `revealed`
//    liga e o jogo adiciona um "Sinal desconhecido" ao GPS — descoberta, não guia.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AsteroidBelt } from "./asteroidBelt.js";
import { radialGlowTexture } from "../core/textures.js";
import { resolveAssetUrl } from "../game/remoteAssets.js";

// Lado OPOSTO à entrada de Júpiter (ENTRY_OVERRIDES usa [1, 0.02, 0]): o jogador
// precisa contornar o gigante pra chegar aqui. dist 760 deixa a borda interna da
// nuvem (~500u) fora do Júpiter inflado (~440u) e da zona de calor.
const WRECK_DIR = [-1, 0.025, 0.08];
const WRECK_DIST = 760;

const WRECK_LENGTH = 12; // maior eixo do casco (~120× a nave; monólitos chegam a ~10u)
const LOAD_DIST = 3200; // começa o download do GLB (dá tempo de chegar carregado)
const VISIBLE_DIST = 2000; // renderiza os 500k tris só quando já dá pra ver algo
const SIGNAL_DIST = 2300; // "Sinal desconhecido" aparece no GPS

// A nuvem do naufrágio: mesmo AsteroidBelt instanciado dos cinturões, ~4× o
// cinturão principal ([230,70,120] × 2200 pedras). Volume ~10× maior com 4× as
// pedras → mais esparsa nas bordas, imensa na travessia (estilo NMS). triBudget
// acompanha (como no cinturão de Saturno) pra o count não ser cortado por modelo.
export function createWreckCloud() {
  return new AsteroidBelt({
    id: "wreck-cloud",
    anchorId: "jupiter",
    dir: WRECK_DIR,
    dist: WRECK_DIST,
    halfExtents: [560, 140, 260],
    count: 8800,
    triBudget: 2_400_000,
    seed: 9003,
  });
}

export class Shipwreck {
  constructor(scene, getBody) {
    this.scene = scene;
    this.getBody = getBody;

    this.group = new THREE.Group();
    this.group.visible = false;
    // pose de acidente: tombado em relação ao plano orbital, nada alinhado
    this.group.quaternion.setFromEuler(new THREE.Euler(0.55, 2.3, -0.35));
    scene.add(this.group);

    this.loaded = false;
    this.revealed = false; // liga ao entrar em SIGNAL_DIST (o jogo adiciona o marcador)
    this._loading = false;
    this._spheres = []; // { c: Vector3 local, r } ao longo do casco

    this._dir = new THREE.Vector3(...WRECK_DIR).normalize();
    this._tumbleAxis = new THREE.Vector3(0.3, 1, 0.24).normalize();
    this._tumbleSpeed = 0.01; // rad/s — deriva de destroço, quase imperceptível
    this._center = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    // luz de emergência ainda viva no casco: pisca vermelho, fraca e espaçada
    this.beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#ff5a3c"), color: 0xff3418, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.beacon.scale.setScalar(0.9);
    this.group.add(this.beacon);

    // alvo de navegação (mesma interface dos corpos) — só entra no GPS ao revelar
    this.markerTarget = {
      id: "wreck-signal",
      name: "Sinal desconhecido",
      color: "#ff6a4d",
      kind: "ship",
      getWorldPosition: (v) => v.copy(this.group.position),
    };
  }

  // pos = nave em voo (ou câmera fora dela); null esconde
  update(dt, pos) {
    const body = this.getBody ? this.getBody("jupiter") : null;
    if (body) body.worldPosition(this._center);
    else this._center.set(0, 0, 0);
    this._center.addScaledVector(this._dir, WRECK_DIST);
    this.group.position.copy(this._center);

    if (!pos) {
      this.group.visible = false;
      return;
    }
    const d = pos.distanceTo(this._center);
    if (!this._loading && d < LOAD_DIST) this._load();
    if (d < SIGNAL_DIST) this.revealed = true;

    this.group.visible = this.loaded && d < VISIBLE_DIST;
    if (!this.group.visible) return;

    this._q.setFromAxisAngle(this._tumbleAxis, this._tumbleSpeed * dt);
    this.group.quaternion.multiply(this._q);

    // pulso curto com silêncio longo (beacon de emergência, não pisca-pisca)
    const blink = Math.sin(performance.now() * 0.0022);
    this.beacon.material.opacity = Math.pow(Math.max(0, blink), 8) * 0.85;
  }

  _load() {
    this._loading = true;
    // no Android o GLB vem do cache baixado do Drive; na web é o caminho local
    resolveAssetUrl("models/brokenstarship.glb").then((url) =>
    new GLTFLoader().load(
      url,
      (gltf) => {
        const s = gltf.scene;
        // o export traz specularColorFactor 2.0 — sem env map isso estoura o
        // brilho; casco de destroço pede reflexo contido
        s.traverse((o) => {
          if (o.isMesh && o.material && "specularIntensity" in o.material) {
            o.material.specularIntensity = 0.35;
          }
        });

        // normaliza: centro na origem, maior eixo do casco = WRECK_LENGTH
        const box = new THREE.Box3().setFromObject(s);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const k = WRECK_LENGTH / maxDim;
        s.position.sub(center);
        const inner = new THREE.Group();
        inner.scale.setScalar(k);
        inner.add(s);
        this.group.add(inner);

        // esferas de colisão enfileiradas no maior eixo (coords locais do group)
        const dims = size.clone().multiplyScalar(k);
        const axisIdx = dims.x >= dims.y && dims.x >= dims.z ? 0 : dims.y >= dims.z ? 1 : 2;
        const axis = new THREE.Vector3();
        axis.setComponent(axisIdx, 1);
        const len = dims.getComponent(axisIdx);
        const secondary = Math.max(...[0, 1, 2].filter((i) => i !== axisIdx).map((i) => dims.getComponent(i)));
        const r = secondary * 0.45;
        const span = Math.max(len / 2 - r, 0);
        for (let i = 0; i < 5; i++) {
          const t = -span + (2 * span * i) / 4;
          this._spheres.push({ c: axis.clone().multiplyScalar(t), r });
        }

        // beacon perto de uma das pontas do casco
        this.beacon.position.copy(axis).multiplyScalar(len * 0.3);

        this.loaded = true;
      },
      undefined,
      (err) => {
        console.warn("[Shipwreck] falha ao carregar brokenstarship.glb:", err);
        this._loading = false; // permite tentar de novo ao reaproximar
      }
    )
    );
  }

  // nave encostou no casco? (colisão só é consultada fora do supercruise,
  // como nos asteroides — quem integra decide explodir)
  hitTest(shipPos) {
    if (!this.loaded || !this.group.visible) return false;
    this._local.copy(shipPos).sub(this.group.position);
    this._q.copy(this.group.quaternion).invert();
    this._local.applyQuaternion(this._q);
    for (const s of this._spheres) {
      if (this._local.distanceTo(s.c) < s.r) return true;
    }
    return false;
  }
}
