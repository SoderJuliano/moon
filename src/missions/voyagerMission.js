import * as THREE from "three";
import { t } from "../core/i18n.js";

const REPORT_DIST = 12; // Distância da estação para conversar/pegar os núcleos
const REPAIR_DIST = 15; // Distância limite de aproximação das Voyagers para realizar a manutenção

export function createVoyagerMission(scene, voyagersSystem) {
  let ctxRef = null;
  let revealed = false;

  // Botão interativo flutuante (projetado em 3D) para manutenção
  const collectBtn = document.createElement("button");
  collectBtn.className = "invest-btn";
  collectBtn.style.display = "none";
  document.body.appendChild(collectBtn);

  const _v = new THREE.Vector3();

  function nearStation(ctx) {
    const iss = ctx.station;
    return (
      iss?.holder &&
      iss.group.visible &&
      ctx.ship.ship.position.distanceTo(iss.holder.position) < REPORT_DIST
    );
  }

  function stationMarker(ctx, on) {
    if (on) {
      ctx.markers.add({
        id: "voyager-iss",
        name: t("mission.strange.issMarker"),
        color: "#66ccff",
        kind: "poi",
        getWorldPosition: (v) =>
          ctx.station?.glow ? v.copy(ctx.station.glow.position) : v.set(0, 0, 0),
      });
    } else {
      ctx.markers.remove("voyager-iss");
    }
  }

  function markerId(v) {
    return `voyager-gps-${v.id}`;
  }

  function addMarkers(ctx) {
    for (const v of voyagersSystem.voyagers) {
      const repaired = v.id === "voyager1" ? ctx.save.flags.voyager1Repaired : ctx.save.flags.voyager2Repaired;
      if (repaired) continue;
      ctx.markers.add({
        id: markerId(v),
        name: `${t("mission.voyager.marker")} — ${v.name}`,
        color: "#ffe8aa",
        kind: "poi",
        getWorldPosition: (out) => out.copy(v.pos),
      });
    }
  }

  function removeMarkers(ctx) {
    for (const v of voyagersSystem.voyagers) {
      ctx.markers.remove(markerId(v));
    }
  }

  const mission = {
    id: "voyager-mission",
    title: t("mission.voyager.title"),
    kind: "secondary",
    firstPhase: "briefing",
    objective: "",

    onStart(ctx, restoring) {
      ctxRef = ctx;

      // Inicializa as flags de progresso persistidas no save do jogador
      if (ctx.save.flags.voyager1Repaired === undefined) ctx.save.flags.voyager1Repaired = false;
      if (ctx.save.flags.voyager2Repaired === undefined) ctx.save.flags.voyager2Repaired = false;

      let ph = ctx.mgr.phase(this.id) || "briefing";

      // Tratamento para retomada: se o jogo foi fechado com tudo reparado mas sem reportar
      if (ph === "maintenance" && ctx.save.flags.voyager1Repaired && ctx.save.flags.voyager2Repaired) {
        ctx.mgr.setPhase(this.id, "return");
        ph = "return";
      }

      if (ph === "briefing" || ph === "return") {
        stationMarker(ctx, true);
      }

      this._refresh(ctx);
    },

    onPhase(ph, ctx) {
      this._refresh(ctx);
      if (ph === "maintenance") {
        stationMarker(ctx, false);
      }
      if (ph === "return") {
        removeMarkers(ctx);
        revealed = false;
        stationMarker(ctx, true);
      }
    },

    _refresh(ctx) {
      const ph = ctx.mgr.phase(this.id) || "briefing";
      if (ph === "briefing") {
        this.objective = t("mission.voyager.objCollect");
      } else if (ph === "maintenance") {
        let count = 0;
        if (ctx.save.flags.voyager1Repaired) count++;
        if (ctx.save.flags.voyager2Repaired) count++;
        this.objective = t("mission.voyager.objMaintenance", { n: count });
      } else if (ph === "return") {
        this.objective = t("mission.voyager.objReturn");
      }
    },

    update(dt, ctx) {
      const ph = ctx.mgr.phase(this.id) || "briefing";

      if (ph === "briefing") {
        if (nearStation(ctx)) {
          ctx.mgr.stationSay(t("mission.voyager.dialogCollect"), 9, `🧑‍🚀 ${t("mission.voyager.astronaut")}`);
          ctx.mgr.setPhase(this.id, "maintenance");
        }
        return;
      }

      if (ph === "return") {
        if (nearStation(ctx)) {
          this._finish(ctx);
        }
        return;
      }

      // ---- FASE DE MANUTENÇÃO (MAINTENANCE) ----------------------------------
      const shipPos = ctx.ship.ship.position;

      // Segredo/Mecânica do Scanner: ao ligar, revela a posição exata no GPS
      if (ctx.scanner?.active) {
        if (!revealed) {
          addMarkers(ctx);
          revealed = true;
        }
      } else if (revealed) {
        removeMarkers(ctx);
        revealed = false;
      }

      // Detecção de proximidade com Voyager 1 ou 2 que necessita de reparo
      let showInteract = false;
      let targetV = null;

      for (const v of voyagersSystem.voyagers) {
        const repaired = v.id === "voyager1" ? ctx.save.flags.voyager1Repaired : ctx.save.flags.voyager2Repaired;
        if (repaired) continue;

        const dist = shipPos.distanceTo(v.pos);
        if (dist < REPAIR_DIST) {
          showInteract = true;
          targetV = v;
          break;
        }
      }

      // Se estiver próximo o suficiente, exibe e posiciona o botão interativo
      if (showInteract && targetV) {
        _v.copy(targetV.pos).project(ctx.camera);
        // Garante que o objeto está dentro do campo de visão da tela
        if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.9) {
          collectBtn.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
          collectBtn.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
          collectBtn.textContent = t("mission.voyager.interactBtn");
          collectBtn.style.display = "";

          collectBtn.onclick = (e) => {
            e.currentTarget.blur();
            collectBtn.style.display = "none";

            // Repara a respectiva Voyager
            if (targetV.id === "voyager1") {
              ctx.save.flags.voyager1Repaired = true;
              ctx.mgr.stationSay(t("mission.voyager.v1Repaired"), 6, `📡 Voyager 1`);
              ctx.markers.remove(markerId(targetV));
            } else {
              ctx.save.flags.voyager2Repaired = true;
              ctx.mgr.stationSay(t("mission.voyager.v2Repaired"), 6, `📡 Voyager 2`);
              ctx.markers.remove(markerId(targetV));
            }

            ctx.saveManager?.saveNow?.();
            this._refresh(ctx);

            // Se ambas as sondas foram reparadas, avança de fase
            if (ctx.save.flags.voyager1Repaired && ctx.save.flags.voyager2Repaired) {
              ctx.mgr.setPhase(this.id, "return");
            }
          };
        } else {
          collectBtn.style.display = "none";
        }
      } else {
        collectBtn.style.display = "none";
      }
    },

    _finish(ctx) {
      stationMarker(ctx, false);
      removeMarkers(ctx);
      collectBtn.style.display = "none";

      ctx.mgr.stationSay(t("mission.voyager.dialogReturn"), 9, `🧑‍🚀 ${t("mission.voyager.astronaut")}`);
      
      // Recompensa de Prestígio (+15)
      ctx.save.prestige = Math.min(100, (ctx.save.prestige || 0) + 15);
      
      ctx.mgr.complete(this.id);
      ctx.saveManager?.saveNow?.();
    },
  };

  return mission;
}
