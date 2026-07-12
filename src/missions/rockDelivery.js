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

const PROMPT_DIST = 2.2;
const DELIVER_DIST = 6.0;

function makeRock() {
  const geo = new THREE.IcosahedronGeometry(0.14, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.8 + Math.random() * 0.4;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7a6f63, roughness: 1, metalness: 0.1 }));
  mesh.visible = false;
  return mesh;
}

export function createRockDeliveryMission(scene, opts) {
  const { id, title, kind = "secondary", goal = 10, material = null, reward = null, onDone = null } = opts;
  const tow = new TowController(scene);
  const rock = makeRock();
  scene.add(rock);

  const collectBtn = document.createElement("button");
  collectBtn.className = "invest-btn";
  collectBtn.textContent = material ? `⚓ Coletar rocha de ${material}` : "⚓ Coletar rocha";
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
      const what = material ? `rochas de ${material}` : "rochas espaciais";
      this.objective = `Reboque ${goal} ${what} até a Estação Espacial (${n}/${goal})`;
    },

    onStart(ctx) {
      this._refresh(ctx);
      collectBtn.onclick = (e) => {
        e.currentTarget.blur();
        this._grab(ctx);
      };
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
      rock.position.copy(near.center);
      rock.visible = true;
      ctx.asteroids.destroyAsteroid(near.id);
      tow.attach(rock);
    },

    update(dt, ctx) {
      if (tow.phase) {
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
        if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.9) {
          collectBtn.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
          collectBtn.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
          show = true;
        }
      }
      collectBtn.style.display = show ? "" : "none";
    },

    _deliver(ctx) {
      tow.release();
      rock.visible = false;
      const n = this._count(ctx) + 1;
      this._setCount(ctx, n);
      this._refresh(ctx);
      const what = material ? `de ${material} ` : "";
      if (n >= goal) {
        ctx.mgr.stationSay(`Última rocha ${what}recebida! Missão concluída. Obrigado pelo empenho.`, 6);
        reward?.(ctx);
        ctx.mgr.complete(this.id);
        onDone?.(ctx);
      } else {
        ctx.mgr.stationSay(`Rocha ${what}recebida. ${n}/${goal} — obrigado, piloto!`, 4);
      }
    },
  };

  return mission;
}
