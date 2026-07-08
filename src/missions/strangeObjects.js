// MISSÃO SECUNDÁRIA — "Objetos estranhos no Sistema Solar".
//
// O primeiro objeto é um satélite ALIENÍGENA orbitando Saturno. Fica disponível
// 1 min após derrotar a 1ª nave inimiga. Ao aceitar, marca o satélite no GPS.
// Dois caminhos (nenhuma dica — o jogador descobre):
//   • DESTRUIR (2 tiros): surge outra nave inimiga (igual à última) e a missão
//     encerra sem prêmio.
//   • REBOCAR: chegando quase encostado aparece "Coletar e rebocar"; um braço/
//     imã (SteelCableAnchorPoint) prende o satélite atrás da nave — cena curta —
//     e a missão vira "leve ao planeta natal". Entregar dá conquista +prestígio.
//
// Fases: investigate → (destroyed | attaching → tow → delivered)

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";
import { emit } from "../game/events.js";

const ANCHOR_ID = "saturn";
// Órbita em MÚLTIPLO do raio ATUAL (não absoluto): os planetas INFLAM ao se
// aproximar, e a colisão fica em 1.1×raio. Uma altitude fixa somada ao raio
// inflado cai DENTRO da zona de colisão → o objeto vira inalcançável. 1.5× o
// raio fica sempre acima da colisão (1.1×) e abaixo do calor forte (3.2×).
const SHELL_MUL = 1.5;
const ORBIT_RATE = 0.05;
const SIZE = 0.5;
const SHOW_AT = 6;
const HIDE_AT = 8;
const HIT_RADIUS = 0.35; // alvo (2 tiros)
const TOW_PROMPT_DIST = 1.6; // "quase encostar" pra aparecer Coletar e rebocar
const TOW_TRAIL = 1.5; // distância que o objeto fica atrás da nave rebocado
const DELIVER_DIST = 2.5; // u da ISS pra considerar entregue (destino do reboque)
const PRESTIGE_REWARD = 25;

// ---- O objeto: satélite alien orbitando Saturno -----------------------------
class AlienSatellite {
  constructor(scene, getAnchor) {
    this.getAnchor = getAnchor;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.alive = true;
    this.towing = false;
    this.loaded = false;
    this._loading = false;
    this.onDestroyed = null;
    this._angle = Math.random() * Math.PI * 2;
    this._u = new THREE.Vector3(1, 0.2, 0).normalize();
    this._v = new THREE.Vector3(0, 0, 1);
    this._center = new THREE.Vector3();
    this._pos = new THREE.Vector3();

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#a6ff8f"), color: 0x9dff7a, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.group.add(this.glow);
  }

  _load() {
    if (this._loading) return;
    this._loading = true;
    new GLTFLoader().load("models/satelliteAlien.glb", (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = SIZE / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      this.holder = new THREE.Group();
      this.holder.add(model);
      this.group.add(this.holder);
      this.loaded = true;
    });
  }

  // posição no MUNDO — usada pelo marcador do GPS. Precisa valer MESMO de longe
  // (antes do modelo carregar): computa a órbita em torno de Saturno na hora,
  // senão o marcador cairia na origem (dentro do Sol). Rebocado → onde estiver.
  worldPosition(v) {
    if (this.towing && this.holder) return v.copy(this.holder.position);
    const anchor = this.getAnchor?.();
    if (anchor) {
      anchor.worldPosition(this._center);
      const dir = this._pos.copy(this._u).multiplyScalar(Math.cos(this._angle)).addScaledVector(this._v, Math.sin(this._angle));
      return v.copy(this._center).addScaledVector(dir, anchor.radius * SHELL_MUL);
    }
    return v.copy(this.holder ? this.holder.position : this.group.position);
  }

  // órbita em Saturno; se rebocado, segue atrás da nave (posição vinda do update)
  update(dt, cameraPos, ship) {
    if (!this.alive) return;
    if (this.towing) {
      this._updateTow(dt, ship);
      return;
    }
    if (!this.getAnchor) return; // anchor (Saturno) só é injetado quando a missão inicia
    const anchor = this.getAnchor();
    if (!anchor) return;
    anchor.worldPosition(this._center);
    const r = anchor.radius;
    const d = cameraPos.distanceTo(this._center);
    if (!this.group.visible) {
      if (d >= r * SHOW_AT) return;
      this.group.visible = true;
      this._load();
    } else if (d > r * HIDE_AT) {
      this.group.visible = false;
      return;
    }
    this._angle += ORBIT_RATE * dt;
    const dir = this._pos.copy(this._u).multiplyScalar(Math.cos(this._angle)).addScaledVector(this._v, Math.sin(this._angle));
    const shell = r * SHELL_MUL;
    if (this.holder) {
      this.holder.position.copy(this._center).addScaledVector(dir, shell);
      this.holder.rotation.y += dt * 0.3;
    }
    this.glow.position.copy(this._center).addScaledVector(dir, shell);
    const dc = cameraPos.distanceTo(this.glow.position);
    const t = THREE.MathUtils.clamp((dc - 8) / 14, 0, 1);
    this.glow.material.opacity = t * t * (3 - 2 * t) * 0.9;
    this.glow.scale.setScalar(THREE.MathUtils.clamp(dc * 0.01, 0.08, 0.9));
  }

  _updateTow(dt, ship) {
    if (!this.holder || !ship) return;
    this.group.visible = true;
    this.glow.material.opacity = 0;
    const back = this._pos.set(0, 0, 1).applyQuaternion(ship.ship.quaternion); // atrás da nave
    const target = this._center.copy(ship.ship.position).addScaledVector(back, TOW_TRAIL).addScaledVector(new THREE.Vector3(0, -1, 0), 0.15);
    this.holder.position.lerp(target, Math.min(1, dt * 6));
    this.holder.rotation.y += dt * 0.5;
  }

  hitTest(pos) {
    if (!this.alive || this.towing || !this.group.visible || !this.holder) return null;
    if (pos.distanceTo(this.holder.position) < HIT_RADIUS) {
      return { id: "alien-sat", center: this.holder.position.clone(), r: HIT_RADIUS, maxHp: 2 };
    }
    return null;
  }
  destroy() {
    this.alive = false;
    this.group.visible = false;
    this.onDestroyed?.();
  }
}

// ---- A missão ---------------------------------------------------------------
export function createStrangeObjectsMission(scene) {
  const sat = new AlienSatellite(scene, null); // anchor injetado no onStart via ctx
  const cable = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0x9fb0c0 })
  );
  cable.visible = false;
  scene.add(cable);
  let anchorModel = null; // SteelCableAnchorPoint (imã) na ponta do cabo
  new GLTFLoader().load("models/SteelCableAnchorPoint.glb", (g) => {
    anchorModel = g.scene;
    const box = new THREE.Box3().setFromObject(anchorModel);
    const s = 0.12 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    anchorModel.scale.setScalar(s);
    anchorModel.visible = false;
    scene.add(anchorModel);
  });

  // botão "Coletar e rebocar" projetado sobre o satélite
  const collectBtn = document.createElement("button");
  collectBtn.className = "invest-btn";
  collectBtn.textContent = "⚓ Coletar e rebocar";
  collectBtn.style.display = "none";
  document.body.appendChild(collectBtn);

  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  let cutscene = 0; // s decorridos da cena de acoplamento

  const mission = {
    id: "strange-objects",
    title: "Objetos estranhos no Sistema Solar",
    firstPhase: "investigate",
    objective: "",
    active: false,
    sat, // exposto pro gameMode plugar no canhão

    onStart(ctx) {
      sat.getAnchor = () => ctx.bodyById.get(ANCHOR_ID);
      sat.onDestroyed = () => this._onSatDestroyed(ctx);
      // marcador do satélite no GPS
      ctx.markers.add({
        id: "alien-sat", name: "Objeto estranho", color: "#9dff7a", kind: "poi",
        getWorldPosition: (v) => sat.worldPosition(v),
      });
      this._setObjective(ctx);
      collectBtn.onclick = (e) => {
        e.currentTarget.blur();
        this._beginAttach(ctx);
      };
      // RETOMADA de save no meio do reboque: reancora o objeto atrás da nave
      // (a cutscene não recomeça — considera-se já acoplado).
      const ph = ctx.mgr.phase(this.id);
      if (ph === "tow" || ph === "attaching") {
        sat._load();
        sat.alive = true;
        sat.towing = true;
        cable.visible = true;
        if (anchorModel) anchorModel.visible = true;
        if (ph === "attaching") ctx.mgr.setPhase(this.id, "tow");
      }
    },

    onPhase(phase, ctx) {
      this._setObjective(ctx);
      // ao começar a rebocar, tira o marcador do objeto (agora colado na nave):
      // o rumo passa a ser a Terra/ISS, que o GPS já mostra
      if (phase === "tow") ctx.markers.remove("alien-sat");
    },

    _setObjective(ctx) {
      const ph = ctx.mgr.phase(this.id);
      if (ph === "tow") this.objective = "Reboque o objeto até a Estação Espacial Internacional (Terra)";
      else this.objective = "Investigue o objeto estranho na órbita de Saturno";
    },

    _onSatDestroyed(ctx) {
      collectBtn.style.display = "none";
      ctx.markers.remove("alien-sat");
      emit("stat", { key: "strangeObjectsDestroyed" });
      // surge outra nave inimiga (igual à última) — usa o mesmo pacote de combate
      if (ctx.combat && !ctx.combat.active) ctx.combat.trigger();
      ctx.mgr.complete(this.id);
      // RAMO alternativo: destruir (em vez de rebocar) leva ao incidente de
      // Netuno, que termina dando o MESMO scanner e seguindo pras secundárias.
      ctx.mgr.start("neptune-incident");
    },

    _beginAttach(ctx) {
      collectBtn.style.display = "none";
      cable.visible = true;
      if (anchorModel) anchorModel.visible = true;
      cutscene = 0; // decorre em _cutDur na fase attaching
      this._satFrom = sat.holder.position.clone(); // ponto de captura (de onde é puxado)
      ctx.mgr.setPhase(this.id, "attaching");
    },

    update(dt, ctx) {
      const ph = ctx.mgr.phase(this.id);
      const shipPos = ctx.ship.ship.position;

      // CUTSCENE de acoplamento: nave congelada, câmera lateral enquadrando
      // nave + objeto, o satélite é PUXADO até a posição de reboque atrás da
      // nave e o imã trava — depois vira "tow".
      if (ph === "attaching") {
        ctx.ship.speed = 0;
        ctx.ship.velocity.set(0, 0, 0);
        ctx.ship.keys.clear();
        cutscene += dt;
        const CUT_DUR = 4.2;
        const t = Math.min(1, cutscene / CUT_DUR);
        const e = t * t * (3 - 2 * t); // smoothstep

        if (sat.holder && this._satFrom) {
          const back = _v.set(0, 0, 1).applyQuaternion(ctx.ship.ship.quaternion);
          const tow = _v2
            .copy(ctx.ship.ship.position)
            .addScaledVector(back, TOW_TRAIL)
            .addScaledVector(_v3.set(0, -1, 0), 0.15);
          sat.holder.position.copy(this._satFrom).lerp(tow, e); // puxa o objeto
          sat.holder.rotation.y += dt * 0.7;
        }
        this._updateCable(ctx);
        if (anchorModel && t > 0.55) anchorModel.rotation.z += dt * 4; // "aparafusando" o imã

        // câmera cinematográfica: desliza pra lateral, mira o meio nave↔objeto
        const camDir = _v.set(1, 0.35, 0.35).applyQuaternion(ctx.ship.ship.quaternion).normalize();
        const desired = _v2.copy(ctx.ship.ship.position).addScaledVector(camDir, 2.4);
        ctx.camera.position.lerp(desired, Math.min(1, dt * 3));
        const mid = _v3.copy(ctx.ship.ship.position).add(sat.holder ? sat.holder.position : shipPos).multiplyScalar(0.5);
        ctx.camera.lookAt(mid);

        if (t >= 1) {
          sat.towing = true; // daqui em diante o objeto segue a nave sozinho
          ctx.mgr.setPhase(this.id, "tow");
        }
        return;
      }

      // rebocando: objeto segue atrás; entrega na ISS (Estação Espacial Intl.)
      if (ph === "tow") {
        sat.update(dt, ctx.camera.position, ctx.ship);
        this._updateCable(ctx);
        ctx.station?.update(dt, shipPos); // garante a ISS renderizada perto da Terra
        const iss = ctx.station;
        if (iss?.holder && iss.group.visible) {
          if (shipPos.distanceTo(iss.holder.position) < DELIVER_DIST) this._deliver(ctx);
        }
        return;
      }

      // investigando: satélite na órbita; oferece rebocar se quase encostar
      sat.update(dt, ctx.camera.position, ctx.ship);
      let show = false;
      if (sat.alive && sat.holder && sat.group.visible) {
        const d = shipPos.distanceTo(sat.holder.position);
        if (d < TOW_PROMPT_DIST) {
          _v.copy(sat.holder.position).project(ctx.camera);
          if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.9) {
            collectBtn.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
            collectBtn.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
            show = true;
          }
        }
      }
      collectBtn.style.display = show ? "" : "none";
    },

    _updateCable(ctx) {
      if (!sat.holder) return;
      // ponta do cabo na nave (abaixo/atrás dela) → satélite rebocado
      const tail = _v.set(0, -0.03, 0.1).applyQuaternion(ctx.ship.ship.quaternion).add(ctx.ship.ship.position);
      const p = cable.geometry.attributes.position;
      p.setXYZ(0, tail.x, tail.y, tail.z);
      p.setXYZ(1, sat.holder.position.x, sat.holder.position.y, sat.holder.position.z);
      p.needsUpdate = true;
      if (anchorModel) anchorModel.position.copy(sat.holder.position);
    },

    _deliver(ctx) {
      // entregue na ISS: some o cabo, o imã/gancho e o próprio objeto
      cable.visible = false;
      if (anchorModel) anchorModel.visible = false;
      sat.alive = false;
      sat.towing = false;
      sat.group.visible = false;
      ctx.markers.remove("alien-sat");
      emit("stat", { key: "strangeObjectsTowed" });
      emit("milestone", { id: "alien-tech-home" }); // conquista
      ctx.save.prestige = Math.min(100, (ctx.save.prestige || 0) + PRESTIGE_REWARD);
      ctx.mgr.stationSay("Impressionante! Esse objeto alienígena vai render muita ciência. Obrigado, piloto.", 7);
      ctx.mgr.complete(this.id);
    },
  };

  return mission;
}
