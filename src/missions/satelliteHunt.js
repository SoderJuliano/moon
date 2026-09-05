// MISSÃO "Céu Limpo" — a caçada aos satélites espiões (pós-Gêmeos).
//
// LORE: com os Gêmeos abatidos, um astronauta da Estação procura o jogador:
// não sabemos NADA sobre eles — os primeiros contatos não foram amigáveis e a
// tecnologia deles (portais, cascos capitais) está além da nossa. E os sensores
// de longo alcance acharam o pior: SATÉLITES NÃO-HUMANOS estacionados na órbita
// das luas de Júpiter e Saturno — uma rede de espionagem observando a Terra.
// Desta vez não é pra capturar: é pra DERRUBAR todos.
//
// • 6 satélites, um por lua (Io, Europa, Ganimedes, Encélado, Reia, Titã),
//   posicionados como o da missão de captura (direção fixa × raio ATUAL da lua
//   — acompanham a inflação de aproximação). 2 tiros cada.
// • cada satélite tem 3 slimes de guarda que perseguem quem chega perto
//   (encostou → engole → morte, como em Netuno). 5 tiros cada.
// • SEGREDO (não contamos ao jogador): ligar o scanner durante a caçada marca
//   os satélites restantes no GPS por um tempo.
// • recompensa: o Ônibus Espacial da humanidade — nave nova no hangar.
//
// Fases: briefing → hunt → return

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radialGlowTexture } from "../core/textures.js";
import { emit } from "../game/events.js";
import { grantShip } from "../game/hangar.js";
import { t } from "../core/i18n.js";

const MOON_IDS = ["io", "europa", "ganymede", "enceladus", "rhea", "titan"];

const SAT_SIZE = 0.1; // mesmo porte do satélite da missão de captura
const SAT_HP = 2;
const ORBIT_MUL = 3.5; // órbita = múltiplo do raio ATUAL da lua…
const ORBIT_CLEAR = 1.2; // …+ folga mínima em escala de nave (lua não inflada)
const SHOW_DIST_MIN = 22; // u — corte de render (o glow entrega a posição)
const SAT_HIT_R = 0.35;

const GUARDS_PER_SAT = 3;
const GUARD_SIZE = 0.12; // ~2× a nave, igual aos slimes de Netuno
const GUARD_HP = 5;
const GUARD_POST = 0.9; // u — raio do posto de guarda ao redor do satélite
const GUARD_AGGRO = 7; // u da nave ao SATÉLITE pra guarda avançar
const GUARD_SPEED = 0.55;
const GUARD_TOUCH = 0.15;
const GUARD_HIT_R = 0.16;
const SWALLOW_SECS = 1.2;

const REPORT_DIST = 4; // u da Estação pra conversar/reportar
const REVEAL_SECS = 45; // scanner ligado → satélites no GPS por este tempo
const PRESTIGE_BONUS = 20;

export function createSatelliteHuntMission(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const _v = new THREE.Vector3();
  const _c = new THREE.Vector3();
  let satProto = null;
  let guardProto = null;
  let loading = false;
  let ctxRef = null;

  // um "site" por lua: satélite + 3 guardas, tudo ancorado no raio atual
  const sites = MOON_IDS.map((moonId, i) => {
    const golden = i * 2.39996; // espalha as direções de spawn entre as luas
    const dir = new THREE.Vector3(Math.cos(golden), 0.45, Math.sin(golden)).normalize();
    return { moonId, dir, holder: null, glow: null, guards: [], alive: true, visible: false };
  });

  function loadModels() {
    if (loading) return;
    loading = true;
    const norm = (gltf, size) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const scale = size / Math.max(...box.getSize(new THREE.Vector3()).toArray());
      const center = box.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      return model;
    };
    new GLTFLoader().load("models/satelliteAlien.glb", (g) => {
      satProto = norm(g, SAT_SIZE);
      build();
    });
    new GLTFLoader().load("models/SlimeEnemy.glb", (g) => {
      guardProto = norm(g, GUARD_SIZE);
      build();
    });
  }

  // monta holders quando os DOIS protótipos chegarem (clones compartilham malha)
  function build() {
    if (!satProto || !guardProto) return;
    for (const s of sites) {
      if (!s.alive || s.holder) continue;
      s.holder = new THREE.Group();
      s.holder.add(satProto.clone());
      s.holder.visible = false;
      group.add(s.holder);
      s.glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: radialGlowTexture("#ff9d7a"), color: 0xff8f5a, transparent: true,
          opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      group.add(s.glow);
      for (let k = 0; k < GUARDS_PER_SAT; k++) {
        const ang = (k / GUARDS_PER_SAT) * Math.PI * 2;
        const post = new THREE.Vector3(Math.cos(ang), 0.3 * (k - 1), Math.sin(ang))
          .normalize()
          .multiplyScalar(GUARD_POST);
        const mesh = new THREE.Group();
        mesh.add(guardProto.clone());
        mesh.visible = false;
        group.add(mesh);
        s.guards.push({
          id: `hunt-guard-${s.moonId}-${k}`,
          mesh, post, alive: true, placed: false, phase: Math.random() * 6.28,
        });
      }
    }
  }

  // posição do satélite: centro da lua + direção fixa × raio ATUAL (acompanha
  // a inflação de aproximação — nunca distância absoluta perto de corpo)
  function satWorld(s, out) {
    const anchor = ctxRef?.bodyById?.get(s.moonId);
    if (!anchor) return out.set(0, 0, 0);
    anchor.worldPosition(_c);
    return out.copy(_c).addScaledVector(s.dir, anchor.radius * ORBIT_MUL + ORBIT_CLEAR);
  }

  function killed(save) {
    if (!save.flags.satHuntKilled) save.flags.satHuntKilled = {};
    return save.flags.satHuntKilled;
  }
  const remaining = () => sites.filter((s) => s.alive).length;

  function despawnSite(s) {
    s.alive = false;
    if (s.holder) s.holder.visible = false;
    if (s.glow) s.glow.visible = false;
    for (const g of s.guards) {
      g.alive = false;
      g.mesh.visible = false;
    }
  }

  function markerId(s) {
    return `hunt-sat-${s.moonId}`;
  }
  function addMarkers(ctx) {
    for (const s of sites) {
      if (!s.alive) continue;
      ctx.markers.add({
        id: markerId(s),
        name: `${t("mission.hunt.marker")} — ${t("body." + s.moonId)}`,
        color: "#ff8f5a",
        kind: "poi",
        getWorldPosition: (v) => satWorld(s, v),
      });
    }
  }
  function removeMarkers(ctx) {
    for (const s of sites) ctx.markers.remove(markerId(s));
  }

  let swallow = null; // { guard, t } — engolida em curso (morte cinematográfica)
  let revealT = 0; // tempo restante dos satélites no GPS (segredo do scanner)
  let revealed = false;
  let talkT = -1; // conversa com o astronauta em curso (-1 = não começou)
  let talkLine = 0;

  const speaker = () => `🧑‍🚀 ${t("mission.hunt.astronaut")}`;

  // painel de recompensa: a nave nova (mesmo padrão do scanner/escudo)
  const reward = document.createElement("div");
  reward.className = "scan-reward";
  reward.style.display = "none";
  document.body.appendChild(reward);

  function showReward(ctx) {
    reward.innerHTML = `
      <div class="scan-reward-box">
        <small>${t("mission.hunt.rewardTag")}</small>
        <b>${t("mission.hunt.rewardName")}</b>
        <div class="hunt-reward-icon">🚀</div>
        <p>${t("mission.hunt.rewardDesc")}</p>
        <div class="mission-avail-row">
          <button class="modal-btn yes" data-act="hangar">${t("mission.hunt.rewardOpen")}</button>
          <button class="modal-btn" data-act="close">${t("mission.hunt.rewardLater")}</button>
        </div>
      </div>`;
    reward.style.display = "";
    reward.querySelector('[data-act="hangar"]').onclick = (e) => {
      e.currentTarget.blur();
      reward.style.display = "none";
      ctx.shipMenu?.open?.();
    };
    reward.querySelector('[data-act="close"]').onclick = (e) => {
      e.currentTarget.blur();
      reward.style.display = "none";
    };
  }

  function nearStation(ctx) {
    const iss = ctx.station;
    return (
      iss?.holder && iss.group.visible &&
      ctx.ship.ship.position.distanceTo(iss.holder.position) < REPORT_DIST
    );
  }
  function stationMarker(ctx, on) {
    if (on) {
      ctx.markers.add({
        id: "hunt-iss", name: t("mission.strange.issMarker"), color: "#66ccff", kind: "poi",
        getWorldPosition: (v) =>
          ctx.station?.glow ? v.copy(ctx.station.glow.position) : v.set(0, 0, 0),
      });
    } else {
      ctx.markers.remove("hunt-iss");
    }
  }

  const mission = {
    id: "sat-hunt",
    title: t("mission.hunt.title"),
    kind: "primary",
    firstPhase: "briefing",
    objective: "",

    // sistema de alvo do canhão (satélites + guardas), plugado no gameMode
    targets: {
      hitTest(pos) {
        if (!group.visible) return null;
        for (const s of sites) {
          if (!s.alive) continue;
          if (s.holder?.visible && pos.distanceTo(s.holder.position) < SAT_HIT_R) {
            return { id: markerId(s), center: s.holder.position.clone(), r: SAT_HIT_R, maxHp: SAT_HP };
          }
          for (const g of s.guards) {
            if (!g.alive || !g.mesh.visible) continue;
            if (pos.distanceTo(g.mesh.position) < GUARD_HIT_R) {
              return { id: g.id, center: g.mesh.position.clone(), r: GUARD_HIT_R, maxHp: GUARD_HP };
            }
          }
        }
        return null;
      },
      destroy(id) {
        for (const s of sites) {
          if (id === markerId(s)) {
            despawnSite(s); // guardas caem junto com o satélite
            if (ctxRef) {
              killed(ctxRef.save)[s.moonId] = true;
              ctxRef.markers.remove(markerId(s));
              emit("stat", { key: "satellitesDestroyed" });
              const left = remaining();
              if (left > 0) {
                ctxRef.mgr.stationSay(t("mission.hunt.satDown", { n: MOON_IDS.length - left, total: MOON_IDS.length }), 5, speaker());
              } else if (ctxRef.mgr.phase(mission.id) === "hunt") {
                ctxRef.mgr.stationSay(t("mission.hunt.allDownDialog"), 7, speaker());
                ctxRef.mgr.setPhase(mission.id, "return");
              }
              ctxRef.saveManager?.saveNow?.();
            }
            return;
          }
          const g = s.guards.find((x) => x.id === id);
          if (g) {
            g.alive = false;
            g.mesh.visible = false;
            if (swallow?.guard === g) swallow = null;
            emit("stat", { key: "enemyShipsDestroyed" });
            return;
          }
        }
      },
    },

    onStart(ctx, restoring) {
      ctxRef = ctx;
      // retomada: satélites já destruídos em sessões anteriores ficam mortos
      const dead = killed(ctx.save);
      for (const s of sites) if (dead[s.moonId]) s.alive = false;
      let ph = ctx.mgr.phase(this.id) || "briefing";
      // fechou o jogo entre o último satélite e o setPhase? corrige na retomada
      if (ph === "hunt" && remaining() === 0) {
        ctx.mgr.setPhase(this.id, "return");
        ph = "return";
      }
      if (ph === "hunt") {
        group.visible = true;
        loadModels();
      }
      if (ph === "briefing" || ph === "return") stationMarker(ctx, true);
      this._refresh(ctx);
    },

    onPhase(ph, ctx) {
      this._refresh(ctx);
      if (ph === "hunt") {
        stationMarker(ctx, false);
        group.visible = true;
        loadModels();
      }
      if (ph === "return") {
        removeMarkers(ctx);
        revealed = false;
        stationMarker(ctx, true);
      }
    },

    _refresh(ctx) {
      const ph = ctx.mgr.phase(this.id) || "briefing";
      if (ph === "hunt") {
        this.objective = t("mission.hunt.objHunt", {
          n: MOON_IDS.length - remaining(),
          total: MOON_IDS.length,
        });
      } else if (ph === "return") {
        this.objective = t("mission.hunt.objReturn");
      } else {
        this.objective = talkT >= 0 ? t("mission.hunt.objListening") : t("mission.hunt.objTalk");
      }
    },

    update(dt, ctx) {
      const ph = ctx.mgr.phase(this.id) || "briefing";

      if (ph === "briefing") {
        if (talkT < 0 && nearStation(ctx)) {
          talkT = 0;
          talkLine = 0;
          this._refresh(ctx);
        }
        if (talkT >= 0) {
          // o astronauta desabafa: as falas caem em sequência, como no decode
          talkT += dt;
          const LINES = [
            [0.5, t("mission.hunt.talk1")],
            [6.0, t("mission.hunt.talk2")],
            [11.5, t("mission.hunt.talk3")],
            [17.0, t("mission.hunt.talk4")],
            [22.5, t("mission.hunt.talk5")],
            [28.0, t("mission.hunt.talk6")],
          ];
          while (talkLine < LINES.length && talkT >= LINES[talkLine][0]) {
            ctx.mgr.stationSay(LINES[talkLine][1], 5, speaker());
            talkLine += 1;
          }
          if (talkT >= 33) ctx.mgr.setPhase(this.id, "hunt");
        }
        return;
      }

      if (ph === "return") {
        if (nearStation(ctx)) this._finish(ctx);
        return;
      }

      // ---- hunt ---------------------------------------------------------------
      const shipPos = ctx.ship.ship.position;
      const camPos = ctx.camera.position;

      // segredo do scanner: ligou → satélites restantes entram no GPS por um tempo
      if (ctx.scanner?.active) revealT = REVEAL_SECS;
      if (revealT > 0) {
        revealT -= dt;
        if (!revealed) {
          addMarkers(ctx);
          revealed = true;
        }
      } else if (revealed) {
        removeMarkers(ctx);
        revealed = false;
      }

      // engolida em curso: o guarda incha sobre a nave e ela "some" dentro dele
      if (swallow) {
        const sw = swallow;
        sw.t += dt;
        ctx.ship.speed = 0;
        ctx.ship.velocity.set(0, 0, 0);
        const k = Math.min(1, sw.t / SWALLOW_SECS);
        sw.guard.mesh.scale.setScalar(1 + k * 2.5);
        sw.guard.mesh.position.lerp(shipPos, Math.min(1, dt * 6));
        ctx.ship.model.visible = false;
        if (k >= 1) {
          swallow = null;
          sw.guard.mesh.scale.setScalar(1);
          ctx.ship.model.visible = true;
          ctx.ship.explode(); // morte — renasce na aproximação do planeta atual
        }
        return;
      }

      for (const s of sites) {
        if (!s.alive || !s.holder) continue;
        const satPos = satWorld(s, _v);
        const dCam = camPos.distanceTo(satPos);
        const anchor = ctx.bodyById.get(s.moonId);
        const show = dCam < Math.max((anchor?.radius || 1) * 8, SHOW_DIST_MIN);
        s.holder.visible = show;
        s.holder.position.copy(satPos);
        if (show) s.holder.rotation.y += dt * 0.3;

        // glint hostil: visível de longe, esmaece chegando perto (como o alienígena)
        if (s.glow) {
          s.glow.visible = show;
          s.glow.position.copy(satPos);
          const gk = THREE.MathUtils.clamp((dCam - 8) / 14, 0, 1);
          s.glow.material.opacity = gk * gk * (3 - 2 * gk) * 0.9;
          s.glow.scale.setScalar(THREE.MathUtils.clamp(dCam * 0.01, 0.08, 0.9));
        }

        const aggro = shipPos.distanceTo(satPos) < GUARD_AGGRO;
        for (const g of s.guards) {
          if (!g.alive) continue;
          g.mesh.visible = show;
          if (!show) continue;
          if (!g.placed) {
            g.placed = true;
            g.mesh.position.copy(satPos).add(g.post);
          }
          g.mesh.rotation.y += dt * 0.3;
          g.mesh.position.y += Math.sin((g.phase += dt)) * dt * 0.05;
          if (aggro) {
            const d = _c.copy(shipPos).sub(g.mesh.position);
            const dist = d.length();
            if (dist < GUARD_TOUCH) {
              swallow = { guard: g, t: 0 };
              break;
            }
            g.mesh.position.addScaledVector(d.normalize(), GUARD_SPEED * dt);
          } else {
            // sem ameaça por perto: volta devagar pro posto de guarda
            _c.copy(satPos).add(g.post);
            g.mesh.position.lerp(_c, Math.min(1, dt * 0.6));
          }
        }
      }
      this._refresh(ctx);
    },

    _finish(ctx) {
      stationMarker(ctx, false);
      removeMarkers(ctx);
      group.visible = false;
      ctx.mgr.stationSay(t("mission.hunt.finishDialog"), 8, speaker());
      emit("milestone", { id: "spy-network-cleared" });
      ctx.save.prestige = Math.min(100, (ctx.save.prestige || 0) + PRESTIGE_BONUS);
      grantShip(ctx.save, "shuttle");
      ctx.mgr.complete(this.id);
      showReward(ctx);
    },
  };

  return mission;
}
