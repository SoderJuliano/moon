// MISSÃO "Incidente de Netuno" — o RAMO alternativo quando o jogador DESTRÓI o
// satélite alien em vez de rebocá-lo.
//
// Fluxo: reportar na Estação → ir até Netuno (algo estranho foi avistado) →
// enfrentar 5 criaturas (enxame de slimes) → voltar e reportar. Ao concluir dá
// a MESMA recompensa (scanner) e segue pras missões secundárias — colocando o
// jogador de volta no fluxo normal.
//
// Fases: report1 → goto-neptune → fight → report2

import * as THREE from "three";
import { emit } from "../game/events.js";
import { SlimeSwarm } from "../combat/slimeSwarm.js";

const ISS_DIST = 2.6; // u da ISS pra "reportar"
const NEPTUNE_MUL = 6; // <6× o raio de Netuno pra chegar

export function createNeptuneIncident(scene) {
  const swarm = new SlimeSwarm(scene, null); // Netuno injetado no onStart
  const _v = new THREE.Vector3();

  const mission = {
    id: "neptune-incident",
    title: "Incidente em Netuno",
    kind: "primary",
    firstPhase: "report1",
    objective: "",
    swarm, // exposto pro gameMode plugar no canhão

    onStart(ctx, restoring) {
      swarm.getNeptune = () => ctx.bodyById.get("neptune");
      swarm.onCleared = () => {
        ctx.mgr.stationSay("As criaturas foram eliminadas. Volte e reporte — bom trabalho, piloto.", 6);
        ctx.mgr.setPhase(this.id, "report2");
      };
      swarm.onSwallow = () => ctx.ship.explode(); // engolido = morte (renasce)
      this._refresh(ctx);
      // retomada em fase de luta: reativa o enxame
      if (restoring && ctx.mgr.phase(this.id) === "fight") swarm.spawn(ctx.ship);
    },

    onPhase(_p, ctx) {
      this._refresh(ctx);
    },
    _refresh(ctx) {
      const ph = ctx.mgr.phase(this.id);
      this.objective =
        ph === "report2" ? "Volte à Estação Espacial e reporte o ocorrido"
        : ph === "fight" ? `Elimine as criaturas na órbita de Netuno (${5 - swarm.remaining}/5)`
        : ph === "goto-neptune" ? "Vá até Netuno investigar a perturbação avistada"
        : "Volte à Estação Espacial e reporte o objeto destruído";
    },

    _nearISS(ctx) {
      const shipPos = ctx.ship.ship.position;
      ctx.station?.update(0, shipPos);
      const iss = ctx.station;
      return iss?.holder && iss.group.visible && shipPos.distanceTo(iss.holder.position) < ISS_DIST;
    },
    _nearNeptune(ctx) {
      const n = ctx.bodyById.get("neptune");
      if (!n) return false;
      n.worldPosition(_v);
      return ctx.ship.ship.position.distanceTo(_v) < n.radius * NEPTUNE_MUL + 4;
    },

    update(dt, ctx) {
      const ph = ctx.mgr.phase(this.id);

      if (ph === "report1") {
        if (this._nearISS(ctx)) {
          ctx.mgr.stationSay("Você destruiu o objeto? Entendido. Detectamos algo se movendo na órbita de Netuno… vá investigar.", 7);
          ctx.mgr.setPhase(this.id, "goto-neptune");
        }
        return;
      }

      if (ph === "goto-neptune") {
        if (this._nearNeptune(ctx)) {
          swarm.spawn(ctx.ship);
          ctx.mgr.stationSay("Contato! Criaturas desconhecidas. Cuidado — não deixe que encostem na nave.", 6);
          ctx.mgr.setPhase(this.id, "fight");
        }
        return;
      }

      if (ph === "fight") {
        // congela a nave enquanto está sendo engolido (a morte é cinematográfica)
        swarm.update(dt, ctx.ship);
        if (swarm.swallowing) {
          ctx.ship.speed = 0;
          ctx.ship.velocity.set(0, 0, 0);
        }
        this._refresh(ctx); // atualiza o N/5
        return;
      }

      if (ph === "report2") {
        if (this._nearISS(ctx)) this._finish(ctx);
      }
    },

    _finish(ctx) {
      swarm.clear();
      emit("milestone", { id: "neptune-cleared" }); // conquista
      ctx.scanner?.grant(); // MESMA recompensa do outro ramo: o scanner
      ctx.mgr.stationSay("Excelente. Aqui está um scanner — vai te ajudar nas próximas tarefas. Obrigado, piloto.", 7);
      ctx.mgr.complete(this.id);
      ctx.mgr.makeAvailable("sec-ferro"); // segue pras secundárias
    },
  };

  return mission;
}
