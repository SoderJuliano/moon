// ARCO DOS GÊMEOS — a linha de história que leva à boss fight.
//
// LORE: o cruzador abandonado perto de Júpiter nunca pediu socorro — o
// transmissor que o jogador ouviu na primeira missão TRANSMITE a posição do
// Sistema Solar há décadas. Escaneando o casco (missão "Eco no Cemitério"),
// o diário de bordo revela: o cruzador foi partido ao meio por DOIS contatos
// capitais — os Gêmeos do Ocaso, Eclipse e Vórtice. A navezinha do primeiro
// combate e o satélite de Saturno eram batedores respondendo ao sinal.
// Reportar a descoberta na Estação dispara a resposta: primeiro uma onda de
// 3 batedores (o treino), depois o portal sinistro — e os Gêmeos em pessoa.
//
// Missões:
//   • ghost-signal (primária)  — escanear o cruzador + reportar na Estação.
//   • twins (primária)         — a invasão de treino e a boss fight em fases;
//                                derrota não perde a missão (eles voltam).
//   • sec-destrocos (secundária) — rebocar os destroços da batalha até a
//                                Estação (opcional; prestígio se fizer).
//
// A batalha em si vive no FleetEncounter (src/combat/) — aqui é só a história,
// os gatilhos e as recompensas.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TowController } from "./towController.js";
import { emit } from "../game/events.js";

const SCAN_DIST = 30; // u do casco pra "escanear" o cruzador
const REPORT_DIST = 4; // u da Estação pra reportar
const INVASION_DELAY = 20; // s após reportar → batedores
const BOSS_DELAY = 30; // s após a invasão → os Gêmeos (e entre tentativas)
const DEBRIS_LOAD_DIST = 80; // lazy-load do GLB de 88MB só chegando perto
const DEBRIS_PROMPT = 2.4;
const DELIVER_DIST = 2.5;

// ---- Missão 1: Eco no Cemitério -------------------------------------------------
export function createGhostSignalMission() {
  const _v = new THREE.Vector3();
  return {
    id: "ghost-signal",
    title: "Eco no Cemitério",
    kind: "primary",
    firstPhase: "scan",
    objective: "",
    _t: 0,
    _line: 0,

    onStart(ctx, restoring) {
      const ph = ctx.mgr.phase(this.id) || "scan";
      if (ph === "report") this.objective = "Reporte a descoberta na Estação Espacial (Terra)";
      else this.objective = "Escaneie o casco do cruzador destruído perto de Júpiter (scanner ligado: G)";
      if (restoring && ph === "decode") ctx.mgr.setPhase(this.id, "scan"); // decode não persiste no meio
    },

    update(dt, ctx) {
      const ph = ctx.mgr.phase(this.id) || "scan";

      if (ph === "scan") {
        if (!ctx.scanner?.equipped) {
          this.objective = "Equipe o scanner para investigar o cruzador destruído";
          return;
        }
        this.objective = "Escaneie o casco do cruzador destruído perto de Júpiter (scanner ligado: G)";
        const wreckPos = ctx.wreck?.group?.position;
        if (ctx.scanner.active && wreckPos && ctx.ship.ship.position.distanceTo(wreckPos) < SCAN_DIST) {
          this._t = 0;
          this._line = 0;
          ctx.mgr.setPhase(this.id, "decode");
        }
        return;
      }

      if (ph === "decode") {
        // a decodificação roda no lugar: as falas caem em sequência
        this._t += dt;
        const LINES = [
          [0.5, "Assinatura reconhecida… decodificando o diário de bordo do cruzador."],
          [4.5, "…não foi acidente. O registro mostra DOIS contatos capitais momentos antes da perda do casco."],
          [9.0, "O transmissor nunca pediu socorro. Ele TRANSMITE a nossa posição. Há décadas."],
          [13.5, "Piloto, volte AGORA. Isso precisa chegar ao comando."],
        ];
        this.objective = "Decodificando o diário de bordo…";
        while (this._line < LINES.length && this._t >= LINES[this._line][0]) {
          ctx.mgr.stationSay(LINES[this._line][1], 4.5);
          this._line += 1;
        }
        if (this._t >= 15) ctx.mgr.setPhase(this.id, "report");
        return;
      }

      // report: chegar na Estação
      this.objective = "Reporte a descoberta na Estação Espacial (Terra)";
      const iss = ctx.station;
      if (iss?.holder && iss.group.visible && ctx.ship.ship.position.distanceTo(iss.holder.position) < REPORT_DIST) {
        ctx.mgr.stationSay("Entendido. Se o sinal foi ouvido… eles JÁ estão vindo. Prepare a nave.", 6);
        ctx.mgr.complete(this.id);
        ctx.mgr.makeAvailable("twins");
      }
    },
  };
}

// ---- Missão 2: Os Gêmeos do Ocaso (invasão de treino + boss fight) ---------------
export function createTwinsMission() {
  return {
    id: "twins",
    title: "Os Gêmeos do Ocaso",
    kind: "primary",
    firstPhase: "invasion-wait",
    objective: "",
    _cd: INVASION_DELAY,

    onStart(ctx, restoring) {
      const ph = ctx.mgr.phase(this.id) || "invasion-wait";
      // retomada no meio de uma fase de combate: rearma a espera correspondente
      if (ph === "invasion") ctx.mgr.setPhase(this.id, "invasion-wait");
      if (ph === "boss") ctx.mgr.setPhase(this.id, "boss-wait");
      this._cd = ph.startsWith("boss") ? BOSS_DELAY : INVASION_DELAY;
      // os GLBs ORIGINAIS dos Gêmeos começam a baixar/compilar JÁ — a espera
      // e a invasão de treino inteiras escondem o carregamento
      ctx.fleet?.preloadBosses?.();
    },

    update(dt, ctx) {
      const fleet = ctx.fleet;
      if (!fleet) return;
      const ph = ctx.mgr.phase(this.id) || "invasion-wait";

      if (ph === "invasion-wait") {
        this.objective = "⚠ Assinaturas de salto detectadas — batedores se aproximam…";
        this._cd -= dt;
        if (this._cd <= 0 && !fleet.active) {
          fleet.triggerInvasion();
          ctx.mgr.setPhase(this.id, "invasion");
        }
        return;
      }

      if (ph === "invasion") {
        this.objective = "Repila os batedores alienígenas";
        // o manager pausa este update durante o combate — se estamos rodando,
        // a luta acabou; o resultado ficou em fleet.lastResult
        if (!fleet.active && fleet.lastResult?.mode === "invasion") {
          if (fleet.lastResult.result === "victory") {
            ctx.mgr.stationSay("Batedores neutralizados… mas os sensores acusam DUAS assinaturas capitais. São ELES.", 7);
            this._cd = BOSS_DELAY;
            ctx.mgr.setPhase(this.id, "boss-wait");
          } else {
            this._cd = BOSS_DELAY; // caiu: os batedores voltam pra revanche
            ctx.mgr.setPhase(this.id, "invasion-wait");
          }
        }
        return;
      }

      if (ph === "boss-wait") {
        this.objective = "⚠ ALERTA MÁXIMO — os Gêmeos do Ocaso entraram no sistema…";
        this._cd -= dt;
        if (this._cd <= 0 && !fleet.active) {
          fleet.triggerBoss();
          ctx.mgr.setPhase(this.id, "boss");
        }
        return;
      }

      if (ph === "boss") {
        this.objective = "Destrua os cruzadores ECLIPSE e VÓRTICE";
        if (!fleet.active && fleet.lastResult?.mode === "boss") {
          if (fleet.lastResult.result === "victory") {
            // A VITÓRIA: flag + conquista + escudo + destroços rebocáveis
            ctx.save.flags.twinsDefeated = true;
            emit("milestone", { id: "twins-defeated" });
            emit("stat", { key: "enemyShipsDestroyed" });
            emit("stat", { key: "enemyShipsDestroyed" }); // eram DOIS
            if (fleet.lastBattlePos) {
              ctx.save.flags.debrisPos = fleet.lastBattlePos.toArray();
              ctx.save.flags.debrisTowed = false;
            }
            ctx.mgr.stationSay("Você… derrubou os dois?! O sinal do cemitério finalmente silenciou. O sistema é seu, piloto.", 8);
            ctx.mgr.complete(this.id);
            ctx.shieldItem?.grant(); // o troféu: Shield Gen SG-01 danificado
            ctx.mgr.makeAvailable("sec-destrocos");
          } else {
            this._cd = BOSS_DELAY; // caiu: eles continuam no sistema — revanche
            ctx.mgr.setPhase(this.id, "boss-wait");
          }
        }
      }
    },
  };
}

// ---- Missão 3 (secundária): rebocar os destroços da batalha ----------------------
// O que sobrou dos Gêmeos (destrocosDaNave.glb) fica flutuando onde a batalha
// terminou. Rebocar até a Estação é OPCIONAL — mas rende prestígio extra.
export function createDebrisChore(scene) {
  const tow = new TowController(scene);
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  let loaded = false;
  let loading = false;

  const btn = document.createElement("button");
  btn.className = "invest-btn";
  btn.textContent = "⚓ Rebocar destroços";
  btn.style.display = "none";
  document.body.appendChild(btn);

  const _v = new THREE.Vector3();

  function loadModel() {
    if (loaded || loading) return;
    loading = true;
    new GLTFLoader().load("models/destrocosDaNave.glb", (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = 0.9 / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      group.add(model);
      loaded = true;
    });
  }

  return {
    id: "sec-destrocos",
    title: "Destroços da batalha",
    kind: "secondary",
    firstPhase: "fetch",
    objective: "",
    _marked: false,

    onStart(ctx, restoring) {
      const pos = ctx.save.flags.debrisPos;
      if (!pos || ctx.save.flags.debrisTowed) return;
      group.position.fromArray(pos);
      const towing = restoring && ctx.mgr.phase(this.id) === "tow";
      if (towing) {
        // retomada no meio do reboque: destroços re-acoplados atrás da nave
        loadModel();
        group.visible = true;
        tow.attach(group);
        tow.state = "tow";
        this.objective = "Reboque os destroços até a Estação Espacial";
      } else {
        this.objective = "Recolha os destroços dos Gêmeos no local da batalha";
        loadModel(); // aceitou a missão = vai até lá; baixa o GLB original já
      }
      if (!this._marked) {
        ctx.markers.add({
          id: "battle-debris",
          name: "Destroços",
          color: "#c9a15a",
          kind: "ship",
          getWorldPosition: (v) => v.copy(group.position),
        });
        this._marked = true;
      }
      btn.onclick = (e) => {
        e.currentTarget.blur();
        btn.style.display = "none";
        tow.attach(group);
        ctx.mgr.setPhase(this.id, "tow");
        this.objective = "Reboque os destroços até a Estação Espacial";
      };
    },

    update(dt, ctx) {
      if (ctx.save.flags.debrisTowed) return;
      const shipPos = ctx.ship.ship.position;

      if (tow.phase) {
        tow.update(dt, ctx.ship, ctx.camera);
        if (tow.isTowing()) {
          const iss = ctx.station;
          if (iss?.holder && iss.group.visible && shipPos.distanceTo(iss.holder.position) < DELIVER_DIST) {
            tow.release();
            group.visible = false;
            ctx.save.flags.debrisTowed = true;
            ctx.markers.remove("battle-debris");
            ctx.save.prestige = Math.min(100, (ctx.save.prestige || 0) + 15); // bônus além do padrão
            ctx.mgr.stationSay("Tecnologia capital intacta?! Isso muda TUDO pra nós. O planeta inteiro te deve uma.", 7);
            ctx.mgr.complete(this.id);
          }
        }
        return;
      }

      // lazy-load do GLB pesado só na aproximação do local da batalha
      const d = shipPos.distanceTo(group.position);
      if (d < DEBRIS_LOAD_DIST) loadModel();
      group.visible = loaded && d < DEBRIS_LOAD_DIST;
      if (group.visible) group.rotation.y += dt * 0.05; // tombando devagar, morto

      let show = false;
      if (group.visible && d < DEBRIS_PROMPT) {
        _v.copy(group.position).project(ctx.camera);
        if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.9) {
          btn.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
          btn.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
          show = true;
        }
      }
      btn.style.display = show ? "" : "none";
    },
  };
}
