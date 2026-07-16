// Fábrica de missões de REBOQUE DE ROCHAS — reaproveitável (a mesma mecânica
// de coletar+rebocar+entregar na Estação, usada várias vezes).
//
// opts:
//   id, title, kind ("primary"|"secondary"), goal (nº de rochas),
//   material (null = qualquer; senão só conta rochas desse tipo — exige o
//     scanner pra saber quais são),
//   reward(ctx)  — chamado ao concluir (ex.: dar o scanner),
//   onDone(ctx)  — encadeamento (ex.: liberar a próxima secundária).
//
// A cada entrega o NPC da estação agradece e o progresso n/goal atualiza no
// chip (primário ou secundário conforme o kind).

import * as THREE from "three";
import { TowController } from "./towController.js";
import { composition } from "../systems/scanner.js";
import { t } from "../core/i18n.js";

const PROMPT_DIST = 4.5;
const DELIVER_DIST = 6.0;

function makeFallbackRock() {
  const geo = new THREE.IcosahedronGeometry(0.14, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.8 + Math.random() * 0.4;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7a6f63, roughness: 1, metalness: 0.1 }));
}

export function createRockDeliveryMission(scene, opts) {
  const { id, title, kind = "secondary", goal = 10, material = null, reward = null, onDone = null } = opts;
  const tow = new TowController(scene);
  const rock = new THREE.Group();
  scene.add(rock);

  const collectBtn = document.createElement("button");
  collectBtn.className = "invest-btn";
  const matName = material ? (t("material." + material) || material) : "";
  collectBtn.textContent = material ? t("mission.rocks.collectMat", { mat: matName }) : t("mission.rocks.collect");
  collectBtn.style.display = "none";
  document.body.appendChild(collectBtn);

  const _v = new THREE.Vector3();

  const mission = {
    id,
    title,
    kind,
    firstPhase: "collect",
    objective: "",

    _count(ctx) {
      return ctx.save.missions[this.id]?.count || 0;
    },
    _setCount(ctx, n) {
      const st = ctx.save.missions[this.id] || (ctx.save.missions[this.id] = { status: "active" });
      st.count = n;
      ctx.saveManager?.saveNow?.();
    },
    _refresh(ctx) {
      const n = this._count(ctx);
      const matName = material ? (t("material." + material) || material) : "";
      const what = material ? t("mission.rocks.whatMat", { mat: matName }) : t("mission.rocks.whatSpace");
      this.objective = t("mission.rocks.objective", { goal, what, n });
    },

    onStart(ctx) {
      this._refresh(ctx);
      collectBtn.onclick = (e) => {
        e.currentTarget.blur();
        this._grab(ctx);
      };

      // Clique direto sobre o asteroide na tela 3D
      this._onMouseDown = (e) => {
        if (e.button !== 0) return;
        // Evita disparar ao clicar em botões, inputs ou links da UI
        if (e.target?.closest("button") || e.target?.closest("input") || e.target?.closest("a")) return;
        if (tow.phase) return;

        const near = this._eligible(ctx);
        if (near) {
          const proj = new THREE.Vector3().copy(near.center).project(ctx.camera);
          if (proj.z < 1) {
            const screenX = (proj.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-proj.y * 0.5 + 0.5) * window.innerHeight;
            const dx = e.clientX - screenX;
            const dy = e.clientY - screenY;
            const distPx = Math.sqrt(dx * dx + dy * dy);
            
            // Tolerância aumentada para 120px para melhor jogabilidade
            if (distPx < 120) {
              this._grab(ctx);
            }
          }
        }
      };
      window.addEventListener("mousedown", this._onMouseDown);
    },

    onComplete(ctx) {
      if (this._onMouseDown) {
        window.removeEventListener("mousedown", this._onMouseDown);
        this._onMouseDown = null;
      }
      if (document.body.style.cursor === "pointer") {
        document.body.style.cursor = "";
      }
      collectBtn.style.display = "none";
    },

    // só oferece coletar rochas ELEGÍVEIS (material certo, se a missão exige)
    _eligible(ctx) {
      const near = ctx.asteroids.nearestActive(ctx.ship.ship.position, PROMPT_DIST);
      if (!near) return null;
      if (material && composition(near.id).material !== material) return null;
      return near;
    },

    _grab(ctx) {
      const near = this._eligible(ctx);
      if (!near) return;
      collectBtn.style.display = "none";

      // 1) Descobre qual é a rocha original que capturamos e clona seu visual/material
      let originalMesh = null;
      const astSys = ctx.asteroids;

      // Busca nos cinturões instanciados
      for (const belt of astSys.belts) {
        const rockInfo = belt._byId.get(near.id);
        if (rockInfo) {
          originalMesh = new THREE.Mesh(rockInfo.mesh.geometry, rockInfo.mesh.material);
          originalMesh.scale.copy(rockInfo.scale);
          originalMesh.quaternion.copy(rockInfo.quat);
          break;
        }
      }

      // Busca nos asteroides ativos de streaming
      if (!originalMesh) {
        const inst = astSys._active.get(near.id);
        if (inst && inst.obj) {
          originalMesh = inst.obj.clone();
          originalMesh.position.set(0, 0, 0);
        }
      }

      // Fallback genérico caso falhe
      if (!originalMesh) {
        originalMesh = makeFallbackRock();
      }

      // Limpa os filhos anteriores do reboque
      while (rock.children.length > 0) {
        rock.remove(rock.children[0]);
      }

      // Adiciona o mesh original ao grupo de reboque
      rock.add(originalMesh);

      // Limita o tamanho visual da rocha rebocada para não tampar a nave toda
      const box = new THREE.Box3().setFromObject(originalMesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const limit = 0.45;
      if (maxDim > limit) {
        const factor = limit / maxDim;
        originalMesh.scale.multiplyScalar(factor);
      }

      rock.position.copy(near.center);
      rock.visible = true;
      ctx.asteroids.destroyAsteroid(near.id);
      tow.attach(rock);

      // Adiciona o marcador da ISS para orientar o voo de entrega
      ctx.markers.add({
        id: "iss-delivery", name: t("mission.strange.issMarker"), color: "#66ccff", kind: "poi",
        getWorldPosition: (v) => {
          if (ctx.station && ctx.station.glow) return v.copy(ctx.station.glow.position);
          return v.set(0, 0, 0);
        }
      });
    },

    update(dt, ctx) {
      if (tow.phase) {
        // Reseta o cursor se começou a rebocar
        if (document.body.style.cursor === "pointer") {
          document.body.style.cursor = "";
        }
        tow.update(dt, ctx.ship, ctx.camera);
        if (tow.isTowing()) {
          ctx.station?.update(dt, ctx.ship.ship.position);
          const iss = ctx.station;
          if (iss?.holder && iss.group.visible && ctx.ship.ship.position.distanceTo(iss.holder.position) < DELIVER_DIST) {
            this._deliver(ctx);
          }
        }
        return;
      }
      const near = this._eligible(ctx);
      let show = false;
      if (near) {
        _v.copy(near.center).project(ctx.camera);
        if (_v.z < 1 && Math.abs(_v.x) < 1.0 && Math.abs(_v.y) < 1.0) {
          collectBtn.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
          collectBtn.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
          show = true;
          document.body.style.cursor = "pointer"; // Indica que a rocha é clicável
        }
      }
      if (!show) {
        if (document.body.style.cursor === "pointer") {
          document.body.style.cursor = "";
        }
      }
      collectBtn.style.display = show ? "" : "none";
    },

    _deliver(ctx) {
      tow.release();
      rock.visible = false;
      ctx.markers.remove("iss-delivery");
      const n = this._count(ctx) + 1;
      this._setCount(ctx, n);
      this._refresh(ctx);
      const matName = material ? (t("material." + material) || material) : "";
      if (n >= goal) {
        ctx.mgr.stationSay(material ? t("mission.rocks.doneMatDialog", { mat: matName }) : t("mission.rocks.doneDialog"), 6);
        reward?.(ctx);
        ctx.mgr.complete(this.id);
        onDone?.(ctx);
      } else {
        ctx.mgr.stationSay(material ? t("mission.rocks.progressMatDialog", { mat: matName, n, goal }) : t("mission.rocks.progressDialog", { n, goal }), 4);
      }
    },
  };

  return mission;
}
