// Rede de satélites da Terra (conteúdo SÓ do Game Mode).
//
// Uma CONSTELAÇÃO em grade (estilo Starlink/painéis solares): linhas × colunas
// de satélites idênticos, todos à MESMA altitude acima da superfície, com
// espaçamento de arco EXATO entre vizinhos, cada um com a face apontada pro
// centro da Terra. A rede fica parada em formação — nada orbita.
//
// "Detalhe de aproximação": não existem fisicamente de longe — o modelo
// (OBJ + textura) só é baixado e desenhado quando a nave/câmera chega perto.
// Como o jogo começa na Terra, na prática carregam já no spawn. A grade é
// construída CENTRADA na direção de chegada do jogador: você dá de cara com
// a rede ao voar pro planeta.
//
// Âncora por ALTITUDE (posição = raio atual + ALTITUDE): com o planeta estável
// eles ficam imóveis; quando a Terra infla/desinfla na aproximação da nave,
// acompanham a superfície 1:1 — sem a "disparada" de multiplicar o raio.
//
// Destrutíveis: 2 tiros do canhão de plasma (interface hitTest/destroy plugada
// no PlasmaCannon via addTargetSystem) — dá pra abrir buracos na rede.

import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { radialGlowTexture } from "../core/textures.js";

const ROWS = 4;
const COLS = 6;
const SPACING = 5; // u de arco EXATOS entre satélites vizinhos
const ALTITUDE = 10; // u acima da superfície (a nave cruza a rede na chegada)
const SAT_SIZE = 0.2; // maior dimensão (~classe da nave, que tem ~0.06)
// GLINT: um satélite de 0.2u é subpixel além de ~20u — de longe cada um vira um
// ponto de luz (reflexo do Sol, como satélites reais vistos da Terra) com
// tamanho angular constante; perto o brilho sai de cena e o modelo assume
const GLINT_ANG = 0.007; // escala do sprite = distância × isto (~0.4° na tela)
const GLINT_FADE_NEAR = 4; // u: some por completo aqui
const GLINT_FADE_FAR = 12; // u: 100% daqui pra longe
const SHOW_AT = 6; // aparece a < 6× o raio atual da Terra
const HIDE_AT = 8; // some a > 8× (histerese pra não piscar na fronteira)
// raio de colisão dos bolts: maior que o visual de propósito — o substep do
// canhão (0.12u) atravessaria um alvo de 0.08u sem registrar o hit
const HIT_RADIUS = 0.15;

export class SatelliteSystem {
  constructor(scene, getEarth) {
    this.getEarth = getEarth;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.sats = []; // { id, dir, alive, mesh } — dir é fixo; altitude é ALTITUDE
    this._loading = false;
    this._built = false;
    this._center = new THREE.Vector3();
  }

  // Grade lat/long centrada na direção de chegada: passo angular Δ = arco/raio
  // da casca → distância entre vizinhos = SPACING exato (colunas das bordas
  // variam < 1% — cos do afastamento angular).
  _buildGrid(cameraPos, shellRadius) {
    const d0 = new THREE.Vector3().copy(cameraPos).sub(this._center).normalize();
    const u1 = new THREE.Vector3().crossVectors(d0, new THREE.Vector3(0, 1, 0));
    if (u1.lengthSq() < 1e-4) u1.set(1, 0, 0);
    u1.normalize();
    const u2 = new THREE.Vector3().crossVectors(d0, u1).normalize();
    const step = SPACING / shellRadius; // rad entre vizinhos

    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        const th = (i - (ROWS - 1) / 2) * step;
        const ph = (j - (COLS - 1) / 2) * step;
        const dir = new THREE.Vector3()
          .addScaledVector(d0, Math.cos(th) * Math.cos(ph))
          .addScaledVector(u1, Math.sin(th))
          .addScaledVector(u2, Math.cos(th) * Math.sin(ph))
          .normalize();
        this.sats.push({ id: `sat-${i}-${j}`, dir, alive: true, mesh: null });
      }
    }
  }

  // download + normalização na primeira aproximação (uma vez só)
  _load() {
    if (this._loading) return;
    this._loading = true;
    new OBJLoader().load("models/satellite/Satellite.obj", (obj) => {
      // centraliza o modelo no próprio centro e escala pra SAT_SIZE
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const scale = SAT_SIZE / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      const tex = new THREE.TextureLoader().load("models/satellite/Satellite_BaseColor.png");
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.35 });
      obj.traverse((c) => {
        if (c.isMesh) c.material = mat;
      });
      obj.position.copy(center).multiplyScalar(-scale);
      obj.scale.setScalar(scale);
      const glowTex = radialGlowTexture("#ffffff");
      for (const s of this.sats) {
        // holder centrado: posição/lookAt agem no holder, o filho fica deslocado
        const holder = new THREE.Group();
        holder.add(obj.clone()); // clone compartilha geometria/material
        // material do glint é POR satélite (a opacidade varia com a distância)
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex, color: 0xdfeaff, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })
        );
        holder.add(glow);
        s.glow = glow;
        holder.visible = s.alive;
        this.group.add(holder);
        s.mesh = holder;
      }
    });
  }

  update(dt, cameraPos) {
    const earth = this.getEarth();
    if (!earth) return;
    earth.worldPosition(this._center);
    const r = earth.radius; // raio ATUAL (inflado na aproximação da nave)
    const d = cameraPos.distanceTo(this._center);

    if (!this.group.visible) {
      if (d >= r * SHOW_AT) return; // longe: nem atualiza
      this.group.visible = true;
      if (!this._built) {
        this._built = true;
        // casca no raio FINAL inflado (o atual ainda anima neste momento)
        const shellRadius = Math.max(earth.approachRadius || r, r) * 1.1 + Math.max(ALTITUDE, 2);
        this._buildGrid(cameraPos, shellRadius);
      }
      this._load(); // primeira aproximação baixa o modelo
    } else if (d > r * HIDE_AT) {
      this.group.visible = false;
      return;
    }

    const shell = Math.max(r + ALTITUDE, r * 1.1 + 2);
    for (const s of this.sats) {
      if (!s.alive || !s.mesh) continue;
      s.mesh.position.copy(this._center).addScaledVector(s.dir, shell);
      s.mesh.lookAt(this._center); // face sempre voltada pro planeta
      // glint: tamanho angular constante de longe; esmaece chegando perto
      const dc = cameraPos.distanceTo(s.mesh.position);
      const t = THREE.MathUtils.clamp((dc - GLINT_FADE_NEAR) / (GLINT_FADE_FAR - GLINT_FADE_NEAR), 0, 1);
      s.glow.material.opacity = t * t * (3 - 2 * t) * 0.9;
      s.glow.scale.setScalar(THREE.MathUtils.clamp(dc * GLINT_ANG, 0.05, 0.7));
    }
  }

  // mesma interface dos asteroides (consumida pelo PlasmaCannon)
  hitTest(pos) {
    if (!this.group.visible) return null;
    for (const s of this.sats) {
      if (!s.alive || !s.mesh) continue;
      if (pos.distanceTo(s.mesh.position) < HIT_RADIUS) {
        return { id: s.id, center: s.mesh.position.clone(), r: HIT_RADIUS, maxHp: 2 };
      }
    }
    return null;
  }

  destroy(id) {
    const s = this.sats.find((x) => x.id === id);
    if (!s) return;
    s.alive = false;
    if (s.mesh) s.mesh.visible = false;
  }
}
