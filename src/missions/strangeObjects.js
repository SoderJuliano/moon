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
const SIZE = 0.1;
const SHOW_AT = 6;
const HIDE_AT = 8;
const HIT_RADIUS = 0.35;
const TOW_PROMPT_DIST = 2.3;
const TOW_TRAIL = 0.20;
const DELIVER_DIST = 9.0;
const LOCK_ON_DIST = 16;
const PRESTIGE_REWARD = 25;
const SAFE_ALTITUDE = 49.4; // alterei manualmente objeto estava dentro de saturno
const MIN_WORLD_CLEARANCE = 8;
const MIN_CAMERA_CLEARANCE = 20;
const PLANET_CLEARANCE_MUL = 40.2;
const CAMERA_BIAS_MUL = 2.2;
const MIN_VERTICAL_OFFSET = 40; // alterei manualmente objeto estava dentro de saturno // Agora é possível chegar no satelite

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
    this._center = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._world = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._spawnDirection = null;
    this._spawnRadius = 0;
    this._lockedPosition = null;

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#a6ff8f"), color: 0x9dff7a, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    scene.add(this.glow);
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
      if (this._lockedPosition) this.holder.position.copy(this._lockedPosition);
      this.loaded = true;
    });
  }

  _ensureLockedPosition(anchor, cameraPos = null) {
    anchor.worldPosition(this._center);
    const r = anchor.radius;

    if (!this._spawnDirection) {
      const awayFromCenter = this._pos.copy(cameraPos || this._up).sub(this._center);
      if (awayFromCenter.lengthSq() < 0.001) awayFromCenter.set(1, 0.35, 0.25);
      awayFromCenter.normalize();

      this._spawnDirection = awayFromCenter
        .multiplyScalar(CAMERA_BIAS_MUL)
        .addScaledVector(this._up, 1)
        .normalize();

      if (this._spawnDirection.y < 0.35) {
        this._spawnDirection.y = 0.35;
        this._spawnDirection.normalize();
      }
    }

    if (!this._spawnRadius) {
      this._spawnRadius = Math.max(
        r * PLANET_CLEARANCE_MUL,
        r * SAFE_ALTITUDE,
        r + MIN_WORLD_CLEARANCE,
        MIN_CAMERA_CLEARANCE
      );
    }

    if (!this._lockedPosition) {
      this._lockedPosition = new THREE.Vector3();
    }
    
    this._lockedPosition.copy(this._center)
      .addScaledVector(this._spawnDirection, this._spawnRadius)
      .addScaledVector(this._up, Math.max(MIN_VERTICAL_OFFSET, r * 0.35));
  }

  worldPosition(v) {
    if (this._lockedPosition) return v.copy(this._lockedPosition);
    const anchor = this.getAnchor?.();
    if (anchor) {
      this._ensureLockedPosition(anchor);
      return v.copy(this._lockedPosition);
    }
    if (this.holder) return this.holder.getWorldPosition(v);
    return v.copy(this.group.position);
  }

  update(dt, cameraPos, ship) {
    if (!this.alive) return;
    if (this.towing) {
      this._updateTow(dt, ship);
      return;
    }
    if (!this.getAnchor) return;
    const anchor = this.getAnchor();
    if (!anchor) return;

    anchor.worldPosition(this._center);
    const r = anchor.radius;
    const d = cameraPos.distanceTo(this._center);
    if (!this.group.visible) {
      if (d >= r * SHOW_AT) return;
      this.group.visible = true;
      this._ensureLockedPosition(anchor, cameraPos);
      this._load();
    } else if (d > r * HIDE_AT) {
      this.group.visible = false;
      this.glow.visible = false;
      return;
    } else {
      this._ensureLockedPosition(anchor, cameraPos);
    }

    if (this.holder && this._lockedPosition) {
      this.holder.position.copy(this._lockedPosition);
      this.holder.rotation.y += dt * 0.3;
    }

    if (this._lockedPosition) {
      this.glow.visible = this.group.visible;
      this.glow.position.copy(this._lockedPosition);
      const dc = cameraPos.distanceTo(this.glow.position);
      const t = THREE.MathUtils.clamp((dc - 8) / 14, 0, 1);
      this.glow.material.opacity = t * t * (3 - 2 * t) * 0.9;
      this.glow.scale.setScalar(THREE.MathUtils.clamp(dc * 0.01, 0.08, 0.9));
    }
  }

  _updateTow(dt, ship) {
    if (!this.holder || !ship) return;
    this.group.visible = true;
    this.glow.visible = false;
    this.glow.material.opacity = 0;
    const back = this._pos.set(0, 0, 1).applyQuaternion(ship.ship.quaternion);
    const down = this._world.set(0, -1, 0).applyQuaternion(ship.ship.quaternion);
    const target = this._center
      .copy(ship.ship.position)
      .addScaledVector(back, TOW_TRAIL)
      .addScaledVector(down, 0.08);
    this.holder.position.copy(target);
    this.holder.rotation.y += dt * 0.5;
  }

  hitTest(pos) {
    if (!this.alive || this.towing || !this.group.visible || !this.holder) return null;
    const satPos = this.holder.getWorldPosition(this._world);
    if (pos.distanceTo(satPos) < HIT_RADIUS) {
      return { id: "alien-sat", center: satPos.clone(), r: HIT_RADIUS, maxHp: 2 };
    }
    return null;
  }

  destroy() {
      this.alive = false;
      this.group.visible = false;
      this.glow.visible = false;
      this.onDestroyed?.();
    }
  }

export function createStrangeObjectsMission(scene) {

  const sat = new AlienSatellite(scene, null);
  const cable = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0x9fb0c0 })
  );
  cable.visible = false;
  scene.add(cable);
  let anchorModel = null;
  new GLTFLoader().load("models/SteelCableAnchorPoint.glb", (g) => {
    anchorModel = g.scene;
    const box = new THREE.Box3().setFromObject(anchorModel);
    const s = 0.03 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    anchorModel.scale.setScalar(s);
    anchorModel.visible = false;
    scene.add(anchorModel);
  });

  const collectBtn = document.createElement("button");
  collectBtn.className = "invest-btn";
  collectBtn.textContent = "⚓ Coletar e rebocar";
  collectBtn.style.display = "none";
  document.body.appendChild(collectBtn);

  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _satWorld = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  let cutscene = 0;



  const mission = {
    id: "strange-objects",
    title: "Objetos estranhos no Sistema Solar",
    firstPhase: "investigate",
    objective: "",
    active: false,
    sat,

    onStart(ctx) {
      sat.getAnchor = () => ctx.bodyById.get(ANCHOR_ID);
      sat.onDestroyed = () => this._onSatDestroyed(ctx);
      ctx.markers.add({
        id: "alien-sat", name: "Objeto estranho", color: "#9dff7a", kind: "poi",
        getWorldPosition: (v) => sat.worldPosition(v),
      });
      this._setObjective(ctx);
      ctx.ship.clearObjectLock?.();
      collectBtn.onclick = (e) => {
        e.currentTarget.blur();
        this._beginAttach(ctx);
      };
      const ph = ctx.mgr.phase(this.id);
      if (ph === "tow" || ph === "attaching") {
        sat._load();
        sat.alive = true;
        sat.towing = true;
        cable.visible = true;
        if (anchorModel) anchorModel.visible = true;
        if (ph === "attaching") {
          ctx.mgr.setPhase(this.id, "tow");
        } else {
          ctx.markers.remove("alien-sat");
          ctx.markers.add({
            id: "iss-delivery", name: "Estação Espacial", color: "#66ccff", kind: "poi",
            getWorldPosition: (v) => {
              if (ctx.station && ctx.station.glow) return v.copy(ctx.station.glow.position);
              return v.set(0, 0, 0);
            }
          });
        }
      }
    },

    onPhase(phase, ctx) {
      this._setObjective(ctx);
      if (phase === "tow") {
        ctx.markers.remove("alien-sat");
        ctx.markers.add({
          id: "iss-delivery", name: "Estação Espacial", color: "#66ccff", kind: "poi",
          getWorldPosition: (v) => {
            if (ctx.station && ctx.station.glow) return v.copy(ctx.station.glow.position);
            return v.set(0, 0, 0);
          }
        });
      }
    },

    _setObjective(ctx) {
      const ph = ctx.mgr.phase(this.id);
      if (ph === "tow") this.objective = "Reboque o objeto até a Estação Espacial Internacional (Terra)";
      else this.objective = "Investigue o objeto estranho na órbita de Saturno";
    },

    _onSatDestroyed(ctx) {
      collectBtn.style.display = "none";
      ctx.ship.clearObjectLock?.();
      ctx.markers.remove("alien-sat");
      emit("stat", { key: "strangeObjectsDestroyed" });
      if (ctx.combat && !ctx.combat.active) ctx.combat.trigger();
      ctx.mgr.complete(this.id);
      ctx.mgr.start("neptune-incident");
    },

    _beginAttach(ctx) {
      collectBtn.style.display = "none";
      ctx.ship.clearObjectLock?.();
      cable.visible = true;
      if (anchorModel) anchorModel.visible = true;
      cutscene = 0;
      this._satFrom = sat.holder.getWorldPosition(_satWorld).clone();
      ctx.mgr.setPhase(this.id, "attaching");
    },

    update(dt, ctx) {
      const ph = ctx.mgr.phase(this.id);
      const shipPos = ctx.ship.ship.position;

      if (ph === "attaching") {
        ctx.ship.speed = 0;
        ctx.ship.velocity.set(0, 0, 0);
        ctx.ship.keys.clear();
        cutscene += dt;
        const CUT_DUR = 4.2;
        const t = Math.min(1, cutscene / CUT_DUR);
        const e = t * t * (3 - 2 * t);

        if (sat.holder && this._satFrom) {
          const back = _v.set(0, 0, 1).applyQuaternion(ctx.ship.ship.quaternion);
          const down = _v3.set(0, -1, 0).applyQuaternion(ctx.ship.ship.quaternion);
          const tow = _v2.copy(ctx.ship.ship.position).addScaledVector(back, TOW_TRAIL).addScaledVector(down, 0.08);
          const worldPos = _satWorld.copy(this._satFrom).lerp(tow, e);
          sat.holder.position.copy(worldPos);
          sat.holder.rotation.y += dt * 0.7;
        }
        this._updateCable(ctx);
        if (anchorModel && t > 0.55) anchorModel.rotation.z += dt * 4;

        const camDir = _v.set(1, 0.35, 0.35).applyQuaternion(ctx.ship.ship.quaternion).normalize();
        const desired = _v2.copy(ctx.ship.ship.position).addScaledVector(camDir, 2.4);
        ctx.camera.position.lerp(desired, Math.min(1, dt * 3));
        const mid = _v3.copy(ctx.ship.ship.position).add(sat.holder ? sat.holder.position : shipPos).multiplyScalar(0.5);
        ctx.camera.lookAt(mid);

        if (t >= 1) {
          sat.towing = true;
          ctx.mgr.setPhase(this.id, "tow");
        }
        return;
      }

      if (ph === "tow") {
        sat.update(dt, ctx.camera.position, ctx.ship);
        this._updateCable(ctx);
        
        ctx.station?.update(dt, shipPos);
        const iss = ctx.station;
        if (iss?.holder && iss.group.visible) {
          if (shipPos.distanceTo(iss.holder.position) < DELIVER_DIST) this._deliver(ctx);
        }
        return;
      }

      sat.update(dt, ctx.camera.position, ctx.ship);
      let show = false;
      if (sat.alive && sat.holder && sat.group.visible) {
        const satPos = sat.holder.getWorldPosition(_satWorld);
        const d = shipPos.distanceTo(satPos);
        const toSat = _v.copy(satPos).sub(shipPos);
        const dist = toSat.length();
        const forwardDot = dist > 0.001
          ? toSat.normalize().dot(_forward.set(0, 0, -1).applyQuaternion(ctx.ship.ship.quaternion))
          : 1;

        if (d < LOCK_ON_DIST && forwardDot > 0.5 && !ctx.ship.objectLock) {
          ctx.ship.setObjectLock?.({
            active: true,
            minDot: 0,
            maxDistance: LOCK_ON_DIST + 5,
            breakSecs: 2,
            getWorldPosition: (out) => sat.worldPosition(out),
          });
        }

        if (d < TOW_PROMPT_DIST) {
          _v.copy(satPos).project(ctx.camera);
          if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.9) {
            collectBtn.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
            collectBtn.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
            show = true;
          }
        }
      }
      if (!show && ctx.ship.objectLock?.getWorldPosition && !sat.towing) {
        const satPos = sat.worldPosition(_satWorld);
        if (shipPos.distanceTo(satPos) > LOCK_ON_DIST + 3) ctx.ship.clearObjectLock?.();
      }
      collectBtn.style.display = show ? "" : "none";
    },

    _updateCable(ctx) {
      if (!sat.holder) return;
      const tail = _v.set(0, -0.03, 0.1).applyQuaternion(ctx.ship.ship.quaternion).add(ctx.ship.ship.position);
      const satPos = sat.holder.getWorldPosition(_satWorld);
      const p = cable.geometry.attributes.position;
      p.setXYZ(0, tail.x, tail.y, tail.z);
      p.setXYZ(1, satPos.x, satPos.y, satPos.z);
      p.needsUpdate = true;
      if (anchorModel) {
        anchorModel.position.copy(satPos);
        anchorModel.lookAt(tail);
      }
    },

    _deliver(ctx) {
      cable.visible = false;
      if (anchorModel) anchorModel.visible = false;
      sat.alive = false;
      sat.towing = false;
      sat.group.visible = false;
      ctx.ship.clearObjectLock?.();
      ctx.markers.remove("alien-sat");
      ctx.markers.remove("iss-delivery");
      emit("stat", { key: "strangeObjectsTowed" });
      emit("milestone", { id: "alien-tech-home" });
      ctx.save.prestige = Math.min(100, (ctx.save.prestige || 0) + PRESTIGE_REWARD);
      ctx.mgr.stationSay("Impressionante! Esse objeto alienígena vai render muita ciência. Obrigado, piloto.", 7);
      ctx.mgr.complete(this.id);
    },
  };

  return mission;
}
