// FleetEncounter — encontros com MÚLTIPLOS inimigos (pacote src/combat/).
//
// Dois modos, mesma máquina de estados (idle → opening → arrive → banner → fight):
//   • "invasion": 3 batedores (AlienShip) saem de 3 portais pequenos — a onda
//     de treino antes do chefe. Sem fuga: ou eles caem, ou o jogador cai.
//   • "boss": OS GÊMEOS — dois cruzadores capitais (BossShip) saem de UM portal
//     sinistro gigante (carmesim, onda de choque, ruptura mais grave). Escudo
//     de 10 tiros + casco de 20 cada, barras LONGAS estilo Dark Souls embaixo
//     da tela, passadas rasantes com tremor + ronco de cargueiro.
//
// ASSISTENTE DE MIRA (regra pedida): quando um inimigo APARECE NA TELA, a mira
// cola nele por 2s (acompanha o movimento) e solta; só recola quando o jogador
// VIRA DE FRENTE pro inimigo de novo, com intervalo mínimo de 5s entre uma
// colada e outra — ajuda sem virar piloto automático.
//
// SONS: batalha épica é a exceção autorizada — canhões estilo Star Wars,
// escudo, explosões e o ronco da passada (ver battleSfx.js).

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";
import { Portal } from "./portal.js";
import { AlienShip, ALIEN_MAX_HP } from "./alienShip.js";
import { BossShip, BOSS_SHIELD_HP, BOSS_HULL_HP } from "./bossShip.js";
import { playBossRupture, playFlybyRumble, playExplosionBig, playEmpShockwave } from "./battleSfx.js";
import { playPortalRupture } from "../ui/sfx.js";
import { emit } from "../game/events.js";
import { t } from "../core/i18n.js";

const PLAYER_MAX_HP = 8;
const LOCK_SECS = 2.0; // mira colada por 2s…
const LOCK_INTERVAL = 5.0; // …e pelo menos 5s entre uma colada e outra
const LOCK_CONE = 0.5; // rad — "virar de frente" pro inimigo
const LOCK_RANGE = 18;
const MOUSE_RATE = 1.7;
const MOUSE_DEADZONE = 0.1;
const MOUSE_IDLE_MS = 1500;

const SINISTER = {
  core: "#070208", veil: "#3a0a1a", halo: "#6e1030", rim: "#ff3b57", spark: "#ff7d95",
};

export class FleetEncounter {
  // ship = ShipFlight; shield = PlayerShield|null; renderer = pré-compila
  // shaders dos bosses no preload; onEnd(result, mode)
  constructor(scene, camera, ship, { onEnd = null, shield = null, renderer = null } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.ship = ship;
    this.shield = shield;
    this.renderer = renderer;
    this.onEnd = onEnd;

    this.state = "idle";
    this.mode = null; // "invasion" | "boss"
    this._t = 0;
    this.playerHp = PLAYER_MAX_HP;
    this.lastResult = null; // { result, mode } — as missões leem depois da luta
    this.lastBattlePos = new THREE.Vector3(); // onde a batalha terminou (destroços)

    // portais: 1 gigante sinistro (boss) + 3 pequenos (invasão)
    this.bossPortal = new Portal(scene, { colors: SINISTER, sparks: 14, shockwave: true });
    this.smallPortals = [new Portal(scene), new Portal(scene), new Portal(scene)];

    // inimigos criados sob demanda no trigger (os GLB dos bosses têm ~86MB
    // cada — só baixam quando a luta arma)
    this.scouts = null; // AlienShip[3]
    this.bosses = null; // BossShip[2]
    this.enemies = []; // os vivos do encontro atual

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._tmpQ = new THREE.Quaternion();
    this._camT = 0;
    this._cinePos = new THREE.Vector3();
    this._cineTgt = new THREE.Vector3();
    this._shake = 0; // tremor de câmera (passada rasante)

    // mira assistida (regra 2s / 5s / de frente)
    this._lock = 0;
    this._lockGap = 0; // tempo desde a última colada
    this._lockedBefore = false; // 1ª colada pode ser "apareceu na tela"
    this._lockTarget = null;
    this._mouse = { x: 0, y: 0, lastMove: 0 };
    window.addEventListener("mousemove", (e) => {
      this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
      this._mouse.lastMove = performance.now();
    });

    // ---- UI --------------------------------------------------------------------
    this.vignette = document.createElement("div");
    this.vignette.className = "dmg-vignette";
    document.body.appendChild(this.vignette);
    this._vigT = 0;

    this.hpBar = document.createElement("div");
    this.hpBar.className = "player-hp";
    this.hpBar.innerHTML = `<span>${t("combat.hull")}</span><div class="player-hp-track"><div class="player-hp-fill"></div></div>`;
    this.hpBar.style.display = "none";
    document.body.appendChild(this.hpBar);
    this._hpFill = this.hpBar.querySelector(".player-hp-fill");

    // barras LONGAS dos bosses (Dark Souls: nome + barra larga embaixo)
    this.bossBars = document.createElement("div");
    this.bossBars.className = "boss-bars";
    this.bossBars.style.display = "none";
    document.body.appendChild(this.bossBars);
    this._barEls = [];

    // marcadores de inimigo (um por alvo — única seta de navegação em combate)
    this.marks = [];
    for (let i = 0; i < 3; i++) {
      const m = document.createElement("div");
      m.className = "enemy-mark";
      m.innerHTML = '<span class="enemy-mark-dot">◆</span><span class="enemy-mark-dist"></span>';
      m.style.display = "none";
      document.body.appendChild(m);
      this.marks.push(m);
    }

    this.chip = document.createElement("div");
    this.chip.className = "mission-chip";
    this.chip.style.display = "none";
    document.body.appendChild(this.chip);
    this._chipFade = 0;

    // Alerta de EMP (controles desligados com contagem regressiva)
    this.empAlert = document.createElement("div");
    this.empAlert.className = "emp-alert";
    this.empAlert.style.display = "none";
    document.body.appendChild(this.empAlert);
    this.empCountdown = 0;

    // fagulhas de impacto na nave do jogador
    this.sparks = [];
    const sparkTex = radialGlowTexture("#ffb36a");
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: sparkTex, color: 0xffa050, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      s.visible = false;
      scene.add(s);
      this.sparks.push({ s, life: 0, vel: new THREE.Vector3() });
    }
  }

  get active() {
    return this.state !== "idle";
  }
  get holdShip() {
    return this.state === "opening" || this.state === "arrive";
  }

  // ---- triggers ------------------------------------------------------------------
  triggerInvasion() {
    if (this.state !== "idle") return;
    this.mode = "invasion";
    if (!this.scouts) {
      this.scouts = [0, 1, 2].map((i) => new AlienShip(this.scene));
      this.scouts.forEach((s, i) => (s.idTag = `scout-${i}`));
      for (const s of this.scouts) {
        s.onDestroyed = () => this._enemyDown(s);
        s.onPlayerHit = (pos) => this._playerHit(pos, 1);
      }
    }
    this.enemies = [...this.scouts];
    const shipObj = this.ship.ship;
    this._tmp.set(0, 0, -1).applyQuaternion(shipObj.quaternion);
    // 3 portais pequenos em leque à frente
    const right = this._tmp2.set(1, 0, 0).applyQuaternion(shipObj.quaternion).clone();
    this.smallPortals.forEach((p, i) => {
      const pos = shipObj.position
        .clone()
        .addScaledVector(this._tmp, 7 + i * 0.8)
        .addScaledVector(right, (i - 1) * 3.2);
      pos.y += (i - 1) * 0.9;
      p.openAt(pos, 1.3);
    });
    playPortalRupture();
    for (const s of this.scouts) s.load(() => {});
    this._begin();
  }

  _ensureBosses() {
    if (this.bosses) return;
    this.bosses = [
      new BossShip(this.scene, { id: "boss-eclipse", name: t("boss.eclipse"), modelUrl: "models/starship.glb" }),
      new BossShip(this.scene, {
        id: "boss-vortice",
        name: t("boss.vortice"),
        modelUrl: "models/combatstarship.glb",
        yaw: -Math.PI / 2,
      }),
    ];
    for (const b of this.bosses) {
      b.onDestroyed = (boss) => {
        playExplosionBig();
        this._shake = Math.max(this._shake, 1.2);
        this._enemyDown(boss);
      };
      b.onPlayerHit = (pos, dmg, vel) => this._playerHit(pos, dmg, vel);
      b.onFlyby = () => {
        playFlybyRumble(); // o cargueiro roçando no bote
        this._shake = Math.max(this._shake, 1.8);
      };
      b.onShieldBreakEMP = (pos) => this._onShieldBreakEMP(pos);
    }
    this._buildBossBars();
  }

  // PRÉ-CARREGAMENTO dos bosses (modelos ORIGINAIS, pesados de propósito):
  // chamado quando a missão dos Gêmeos é aceita — muito antes do portal.
  // O download roda em paralelo pelo navegador; ao chegar, o compileAsync
  // pré-compila os shaders e sobe as texturas pra GPU (a "compilação de
  // shaders" dos jogos) — quando o portal abrir, o custo já foi pago.
  // Se ainda assim não deu tempo, o próprio portal É a tela de loading:
  // o estado "opening" só solta os bosses quando os dois estão prontos.
  preloadBosses() {
    this._ensureBosses();
    for (const b of this.bosses) {
      b.load(() => {
        if (!this.renderer?.compileAsync) return;
        this.renderer.compileAsync(b.group, this.camera, this.scene).catch(() => {});
      });
    }
  }

  triggerBoss() {
    if (this.state !== "idle") return;
    this.mode = "boss";
    this._ensureBosses();
    this.enemies = [...this.bosses];
    for (const b of this.bosses) b.sfx = true;
    const shipObj = this.ship.ship;
    this._tmp.set(0, 0, -1).applyQuaternion(shipObj.quaternion);
    const portalPos = shipObj.position.clone().addScaledVector(this._tmp, 13);
    this.bossPortal.openAt(portalPos, 6.5); // GIGANTE — o rasgo domina a tela
    playBossRupture();
    for (const b of this.bosses) b.load(() => {});
    this._begin();
  }

  _begin() {
    this.playerHp = PLAYER_MAX_HP;
    this.state = "opening";
    this._t = 0;
    this._lock = 0;
    this._lockGap = LOCK_INTERVAL; // a 1ª colada não espera intervalo
    this._lockedBefore = false;
  }

  _buildBossBars() {
    this.bossBars.innerHTML = this.bosses
      .map(
        (b) => `<div class="boss-bar">
          <div class="boss-bar-head"><span class="boss-name">${b.name}</span><span class="boss-stage"></span></div>
          <div class="boss-track"><div class="boss-fill"></div></div>
        </div>`
      )
      .join("");
    this._barEls = [...this.bossBars.querySelectorAll(".boss-bar")].map((el) => ({
      el,
      fill: el.querySelector(".boss-fill"),
      stage: el.querySelector(".boss-stage"),
    }));
  }

  // ---- interface de alvo do PlasmaCannon (uma pra frota toda) ---------------------
  hitTest(pos) {
    for (const e of this.enemies) {
      const hit = e.hitTest(pos);
      if (hit) return hit;
    }
    return null;
  }
  isImmune(id) {
    for (const e of this.enemies) {
      if ((e.idTag || e.id) === id && e instanceof BossShip) {
        return e.invulnerableTimer > 0;
      }
    }
    return false;
  }
  tryTriggerInvulnerability(id) {
    for (const e of this.enemies) {
      if ((e.idTag || e.id) === id && e instanceof BossShip) {
        if (!e.invulnerableUsed) {
          e.triggerInvulnerability();
          return true;
        }
      }
    }
    return false;
  }
  onDamaged(id, hp, maxHp, at) {
    for (const e of this.enemies) {
      if ((e.idTag || e.id) === id) {
        e.onDamaged?.(id, hp, maxHp, at);
        return;
      }
    }
  }
  destroy(id) {
    for (const e of this.enemies) {
      if ((e.idTag || e.id) === id) {
        e.destroy();
        return;
      }
    }
  }

  _enemyDown(enemy) {
    this.enemies = this.enemies.filter((e) => e !== enemy && e.alive);
    if (this.mode === "invasion" || !(enemy instanceof BossShip)) {
      emit("stat", { key: "enemyShipsDestroyed" });
    }
    if (this.enemies.length === 0) this._end("victory");
  }

  _playerHit(pos, dmg = 1, boltVel = null) {
    if (this.state !== "fight") return;
    // ESCUDO do jogador (se equipado e com carga): absorve — bolha azul acende
    if (this.shield?.tryAbsorb(pos)) return;
    this.playerHp -= dmg;
    this._vigT = 1;

    // Empurrão cinético violento do tiro pesado
    if (boltVel) {
      this._tmp2.copy(boltVel).normalize();
      this.ship.velocity.addScaledVector(this._tmp2, 8.5);
    }
    this.ship.angVel.x += (Math.random() - 0.5) * 5.5 * dmg;
    this.ship.angVel.y += (Math.random() - 0.5) * 5.5 * dmg;
    this.ship.angVel.z += (Math.random() - 0.5) * 8.0 * dmg;
    this._shake = Math.max(this._shake, 2.2);

    this.ship.speed *= 0.55;
    this.ship.velocity.multiplyScalar(0.75);
    for (let i = 0; i < 4; i++) {
      const p = this.sparks.find((x) => x.life <= 0);
      if (!p) break;
      p.s.position.copy(pos);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2);
      p.s.scale.setScalar(0.06 + Math.random() * 0.07);
      p.s.material.opacity = 1;
      p.life = 0.8;
      p.s.visible = true;
    }
    if (this.playerHp <= 0) {
      this._end("defeat");
      this.ship.explode();
    }
  }

  _onShieldBreakEMP(pos) {
    playEmpShockwave();
    this._shake = Math.max(this._shake, 2.8);
    const dist = this.ship.ship.position.distanceTo(pos);
    if (dist < 14.5) {
      this.triggerPlayerEMP(5.0, pos);
    }
  }

  triggerPlayerEMP(secs, originPos) {
    this.ship.empTimer = secs;
    this.empCountdown = secs;
    this.empAlert.style.display = "";
    // Onda de choque magnética arremessa a nave
    this._tmp.copy(this.ship.ship.position).sub(originPos).normalize();
    this.ship.velocity.addScaledVector(this._tmp, 16.0);
    this.ship.angVel.set((Math.random() - 0.5) * 7.0, (Math.random() - 0.5) * 7.0, (Math.random() - 0.5) * 9.0);
  }

  _end(result) {
    if (this.state === "idle") return;
    const mode = this.mode;
    this.lastResult = { result, mode };
    // local da batalha: um pouco à frente do jogador (onde os destroços ficam)
    this._tmp.set(0, 0, -1).applyQuaternion(this.ship.ship.quaternion);
    this.lastBattlePos.copy(this.ship.ship.position).addScaledVector(this._tmp, 4);
    this.state = "idle";
    this.empCountdown = 0;
    this.empAlert.style.display = "none";
    this.bossPortal.close();
    for (const p of this.smallPortals) p.close();
    for (const e of [...(this.scouts || []), ...(this.bosses || [])]) e.hide();
    this.enemies = [];
    this.hpBar.style.display = "none";
    this.bossBars.style.display = "none";
    for (const m of this.marks) m.style.display = "none";
    this.chip.textContent =
      result === "victory"
        ? mode === "boss"
          ? t("fleet.bossVictory")
          : t("fleet.invasionVictory")
        : t("fleet.defeat");
    this._chipFade = 7;
    this.onEnd?.(result, mode);
  }

  _showBanner() {
    const banner = document.createElement("div");
    banner.className = "mission-banner" + (this.mode === "boss" ? " boss" : "");
    banner.innerHTML =
      this.mode === "boss"
        ? `<small>${t("fleet.capitalThreat")}</small>${t("fleet.twinsTitle")}`
        : `<small>${t("fleet.invasion")}</small>${t("fleet.scoutsTitle")}`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5600);
    this.chip.textContent =
      this.mode === "boss" ? t("fleet.bossObjective") : t("fleet.invasionObjective");
    this.chip.style.display = "";
  }

  update(dt) {
    this.bossPortal.update(dt);
    for (const p of this.smallPortals) p.update(dt);
    this._updateFx(dt);
    if (this.state === "idle") {
      this._updateCinematicCamera(dt);
      this._applyShake(dt);
      return;
    }

    const shipObj = this.ship.ship;
    const playerPos = shipObj.position;
    if (this.holdShip) {
      this.ship.speed = 0;
      this.ship.velocity.set(0, 0, 0);
      this.ship.keys.clear();
    }

    this._t += dt;
    const openSecs = this.mode === "boss" ? 3.4 : 1.6; // portal do boss demora — tensão
    const arriveSecs = this.mode === "boss" ? 6.0 : 3.0;
    const bannerSecs = 2.8;

    switch (this.state) {
      case "opening": {
        const allLoaded = this.enemies.every((e) => e.loaded);
        if (this._t >= openSecs && allLoaded) {
          if (this.mode === "boss") {
            // os dois saem do MESMO portal gigante, lado a lado
            this.enemies[0].spawnAt(this._tmp.copy(this.bossPortal.group.position).add(this._tmp2.set(-1.6, 0.5, 0)));
            this.enemies[1].spawnAt(this._tmp.copy(this.bossPortal.group.position).add(this._tmp2.set(1.6, -0.5, 0)));
          } else {
            this.enemies.forEach((s, i) => {
              s.spawnAt(this.smallPortals[i].group.position);
              s._firstShot = false; // 3 tiros teleguiados de uma vez seria covardia
            });
          }
          this.state = "arrive";
          this._t = 0;
        }
        break;
      }

      case "arrive": {
        // deslizam do portal pras posições de combate, de frente pro jogador
        this.enemies.forEach((e, i) => {
          this._tmp.copy(playerPos).sub(e.group.position);
          const d = this._tmp.length();
          const stop = this.mode === "boss" ? 6.5 : 3.4;
          const spd = this.mode === "boss" ? 1.1 : 1.6;
          if (d > stop) e.group.position.addScaledVector(this._tmp.normalize(), dt * spd);
          e.group.lookAt(playerPos);
          const grow = this.mode === "boss" ? 0.35 : 0.8;
          if (e.group.scale.x < 1) e.group.scale.setScalar(Math.min(1, e.group.scale.x + dt * grow));
        });
        if (this._t >= arriveSecs) {
          this.bossPortal.close();
          for (const p of this.smallPortals) p.close();
          this._showBanner();
          this.hpBar.style.display = "";
          if (this.mode === "boss") this.bossBars.style.display = "";
          this.state = "banner";
          this._t = 0;
        }
        break;
      }

      case "banner":
        for (const e of this.enemies) e.update(dt, playerPos, this.ship);
        if (this._t >= bannerSecs) {
          for (const e of this.enemies) e.setFiring(true);
          this.state = "fight";
          this._t = 0;
        }
        break;

      case "fight":
        for (const e of this.enemies) e.update(dt, playerPos, this.ship);
        this._mouseSteer(dt);
        this._aimAssist(dt, playerPos);
        break;
    }

    this._updateCinematicCamera(dt);
    this._applyShake(dt);

    // Atualiza o display de alerta de EMP
    if (this.empCountdown > 0) {
      this.empCountdown -= dt;
      const secs = Math.ceil(this.empCountdown);
      if (secs > 0) {
        this.empAlert.className = "emp-alert active";
        this.empAlert.innerHTML = `
          <div class="emp-alert-icon">⚡</div>
          <div class="emp-alert-body">
            <div class="emp-alert-title">${t("combat.empAlertTitle")}</div>
            <div class="emp-alert-sub">${t("combat.empAlertSub", { secs })}</div>
          </div>
          <div class="emp-alert-timer">${secs}s</div>
        `;
      } else {
        this.empAlert.className = "emp-alert restored";
        this.empAlert.innerHTML = `
          <div class="emp-alert-icon">✓</div>
          <div class="emp-alert-body">
            <div class="emp-alert-title">${t("combat.empRestoredTitle")}</div>
          </div>
        `;
        setTimeout(() => {
          if (this.empCountdown <= 0) this.empAlert.style.display = "none";
        }, 1500);
      }
    }

    if (this.holdShip) {
      for (const m of this.marks) m.style.display = "none";
      if (this.scouts) for (const s of this.scouts) s.bar.style.display = "none";
      this.bossBars.style.display = "none";
    } else {
      this._updateMarks(playerPos);
      if (this.mode === "invasion") {
        for (const s of this.scouts) s.updateBar(this.camera);
      } else if (this.state !== "idle") {
        this.bossBars.style.display = "";
        this._updateBossBars();
      }
    }
    this._hpFill.style.width = `${(this.playerHp / PLAYER_MAX_HP) * 100}%`;
  }

  _updateBossBars() {
    this.bosses.forEach((b, i) => {
      const ui = this._barEls[i];
      if (!ui) return;
      if (!b.alive) {
        ui.el.className = "boss-bar down";
        ui.fill.style.width = "0%";
        ui.stage.textContent = t("fleet.destroyed");
        return;
      }
      if (b.invulnerableTimer > 0) {
        ui.el.className = "boss-bar invulnerable";
        ui.fill.className = "boss-fill invulnerable";
        ui.fill.style.width = "100%";
        ui.stage.textContent = `🛡️ ${t("fleet.invulnerable")} (${b.invulnerableTimer.toFixed(1)}s)`;
      } else if (b.shielded) {
        ui.el.className = "boss-bar";
        ui.fill.className = "boss-fill shield";
        ui.fill.style.width = `${(b.shieldHp / BOSS_SHIELD_HP) * 100}%`;
        ui.stage.textContent = t("fleet.shield");
      } else {
        ui.el.className = "boss-bar";
        ui.fill.className = "boss-fill hull";
        ui.fill.style.width = `${(b.hullHp / BOSS_HULL_HP) * 100}%`;
        ui.stage.textContent = t("fleet.hull");
      }
    });
  }

  _mouseSteer(dt) {
    if (performance.now() - this._mouse.lastMove > MOUSE_IDLE_MS) return;
    const shape = (v) =>
      Math.abs(v) < MOUSE_DEADZONE ? 0 : (Math.sign(v) * (Math.abs(v) - MOUSE_DEADZONE)) / (1 - MOUSE_DEADZONE);
    const ax = shape(this._mouse.x);
    const ay = shape(this._mouse.y);
    if (ax) this.ship.ship.rotateY(-ax * MOUSE_RATE * dt);
    if (ay) this.ship.ship.rotateX(-ay * MOUSE_RATE * dt);
  }

  // regra pedida: 1ª colada quando o inimigo APARECE NA TELA; recoladas só
  // VIRANDO DE FRENTE (cone), com 2s de trava e 5s mínimos entre coladas
  _aimAssist(dt, playerPos) {
    this._lockGap += dt;
    const alive = this.enemies.filter((e) => e.alive);
    if (!alive.length) {
      this._lock = 0;
      return;
    }
    const shipObj = this.ship.ship;

    if (this._lock <= 0 && this._lockGap >= LOCK_INTERVAL) {
      // candidato: o inimigo vivo mais próximo dentro do alcance
      let best = null;
      let bestD = LOCK_RANGE;
      for (const e of alive) {
        const d = e.group.position.distanceTo(playerPos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        this._tmp.copy(best.group.position).sub(playerPos).normalize();
        this._tmp2.set(0, 0, -1).applyQuaternion(shipObj.quaternion);
        const facing = this._tmp2.angleTo(this._tmp) < LOCK_CONE;
        let onScreen = false;
        if (!this._lockedBefore) {
          this._tmp2.copy(best.group.position).project(this.camera);
          onScreen = this._tmp2.z < 1 && Math.abs(this._tmp2.x) < 0.9 && Math.abs(this._tmp2.y) < 0.85;
        }
        if (facing || onScreen) {
          this._lock = LOCK_SECS;
          this._lockTarget = best;
          this._lockedBefore = true;
        }
      }
    }

    if (this._lock > 0 && this._lockTarget?.alive) {
      this._lock -= dt;
      this._m.lookAt(shipObj.position, this._lockTarget.group.position, this.camera.up);
      this._tmpQ.setFromRotationMatrix(this._m);
      shipObj.quaternion.slerp(this._tmpQ, Math.min(1, dt * 5));
      for (const m of this.marks) m.classList.add("locked");
      if (this._lock <= 0) this._lockGap = 0; // o intervalo de 5s começa aqui
    } else {
      this._lock = 0;
      for (const m of this.marks) m.classList.remove("locked");
    }
  }

  _updateCinematicCamera(dt) {
    const cine = this.holdShip;
    this._camT += ((cine ? 1 : 0) - this._camT) * Math.min(1, dt * 2.2);
    if (this._camT <= 0.004) return;
    if (cine) {
      const boss = this.mode === "boss";
      const onPortal = this.state === "opening" || !this.enemies[0]?.group.visible;
      const focus = onPortal
        ? boss
          ? this.bossPortal.group.position
          : this.smallPortals[1].group.position
        : this._midpoint();
      const dist = onPortal ? (boss ? 7.5 : 3.2) : boss ? 4.2 : 1.2;
      this._cineTgt.copy(focus);
      this._tmp.copy(this.ship.ship.position).sub(focus).normalize();
      this._tmp2.crossVectors(this._tmp, this.camera.up);
      if (this._tmp2.lengthSq() < 1e-4) this._tmp2.set(1, 0, 0);
      this._tmp2.normalize();
      this._cinePos
        .copy(focus)
        .addScaledVector(this._tmp, dist)
        .addScaledVector(this._tmp2, dist * 0.3);
      this._cinePos.y += dist * 0.16;
    }
    this.camera.position.lerp(this._cinePos, this._camT);
    this._tmp.copy(this.ship.ship.position).lerp(this._cineTgt, this._camT);
    this.camera.lookAt(this._tmp);
  }

  _midpoint() {
    this._cineTgt.set(0, 0, 0);
    let n = 0;
    for (const e of this.enemies) {
      if (!e.group.visible) continue;
      this._cineTgt.add(e.group.position);
      n++;
    }
    if (n) this._cineTgt.multiplyScalar(1 / n);
    return this._cineTgt;
  }

  // tremor de câmera: passadas rasantes e explosões grandes sacodem a tela
  _applyShake(dt) {
    if (this._shake <= 0) return;
    this._shake = Math.max(0, this._shake - dt * 0.7);
    const a = this._shake * this._shake * 0.06;
    this.camera.position.x += (Math.random() - 0.5) * a;
    this.camera.position.y += (Math.random() - 0.5) * a;
    this.camera.position.z += (Math.random() - 0.5) * a;
  }

  _updateMarks(playerPos) {
    const alive = this.enemies.filter((e) => e.alive);
    this.marks.forEach((mark, i) => {
      const e = alive[i];
      if (!e || this.state === "idle") {
        mark.style.display = "none";
        return;
      }
      this._tmp.copy(e.group.position).project(this.camera);
      const behind = this._tmp.z > 1;
      let x = (this._tmp.x * 0.5 + 0.5) * window.innerWidth;
      let y = (-this._tmp.y * 0.5 + 0.5) * window.innerHeight;
      if (behind || Math.abs(this._tmp.x) > 0.97 || Math.abs(this._tmp.y) > 0.95) {
        if (behind) {
          x = window.innerWidth - x;
          y = window.innerHeight - y;
        }
        x = Math.min(Math.max(x, 30), window.innerWidth - 30);
        y = Math.min(Math.max(y, 30), window.innerHeight - 30);
      }
      mark.style.display = "";
      mark.style.left = `${x}px`;
      mark.style.top = `${y}px`;
      mark.querySelector(".enemy-mark-dist").textContent = `${e.group.position.distanceTo(playerPos).toFixed(1)}u`;
    });
  }

  _updateFx(dt) {
    if (this._vigT > 0) {
      this._vigT = Math.max(0, this._vigT - dt * 1.8);
      this.vignette.style.opacity = this._vigT;
    }
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.material.opacity = Math.max(0, p.life / 0.7);
      if (p.life <= 0) p.s.visible = false;
    }
    if (this._chipFade > 0) {
      this._chipFade -= dt;
      if (this._chipFade <= 0) this.chip.style.display = "none";
    }
  }
}
