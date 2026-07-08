// COMBATE PvE — pacote apartado do resto do jogo (src/combat/).
//
// Máquina de estados do primeiro encontro:
//   idle → opening (portal negro rasga o espaço, nave presa, câmera travada)
//        → arrive  (a nave alien desliza pra fora do portal — mini cinematic)
//        → banner  ("NOVA MISSÃO: Defenda o Sistema Solar", câmera liberada)
//        → fight   (ela atira 1 bolt por vez; 4 hits nela, 8 em nós;
//                    timeout de 2 min → ela abre o portal e FOGE)
//        → leaving (fuga pelo portal) → idle
//
// ENTRAR/SAIR de combate é o contrato com o gameMode: enquanto `active`,
// o GPS some (o gameMode consulta), o áudio ambiente é abafado e a única UI
// de navegação é o marcador vermelho do inimigo (daqui). Ao terminar, tudo
// volta ao normal sozinho.
//
// Dano no jogador (8 hits): borda vermelha pulsa, fagulhas no ponto do
// impacto, a nave SACODE (impulso de angVel) e DESACELERA — o tiro tem peso.

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";
import { playPortalRupture } from "../ui/sfx.js";
import { Portal } from "./portal.js";
import { AlienShip } from "./alienShip.js";

// ASSISTENTE DE MIRA: virar na direção da nave (cone de ~30°) ou ela aparecer
// na tela ENGATA uma trava de 2s — o nariz acompanha o strafe dela, tempo de
// atirar. Depois solta e respira antes de reengatar (não vira aimbot).
const LOCK_SECS = 2.0;
const LOCK_COOLDOWN = 1.4;
const LOCK_CONE = 0.55; // rad (~31°)
const LOCK_RANGE = 14; // u
// mouse (opcional, junto com o teclado): guinada/arfagem pela posição na tela
const MOUSE_RATE = 1.7; // rad/s no máximo
const MOUSE_DEADZONE = 0.1;
const MOUSE_IDLE_MS = 1500; // mouse parado = sem direção (não deriva sozinho)

const PLAYER_MAX_HP = 8;
const FIGHT_TIMEOUT = 120; // s até a nave desistir e fugir
const OPEN_SECS = 1.6; // portal abrindo (nave presa, câmera achando o portal)
const ARRIVE_SECS = 3.2; // nave saindo do portal (cinematic)
const BANNER_SECS = 2.6; // missão na tela; a nave ainda segura o fogo

export class CombatEncounter {
  // ship = ShipFlight; onEnd(result: "victory"|"defeat"|"fled")
  constructor(scene, camera, ship, { onEnd = null } = {}) {
    this.camera = camera;
    this.ship = ship;
    this.onEnd = onEnd;

    this.state = "idle";
    this._t = 0;
    this.playerHp = PLAYER_MAX_HP;

    this.portal = new Portal(scene);
    this.alien = new AlienShip(scene);
    this.alien.onDestroyed = () => this._end("victory");
    this.alien.onPlayerHit = (pos) => this._playerHit(pos);

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._fleeTarget = new THREE.Vector3();
    // câmera cinematográfica: peso 0=chase normal, 1=close-up no alien
    this._camT = 0;
    this._cinePos = new THREE.Vector3();
    this._cineTgt = new THREE.Vector3();

    // assistente de mira + direção por mouse (só no combate)
    this._lock = 0;
    this._lockCd = 0;
    this._m = new THREE.Matrix4();
    this._tmpQ = new THREE.Quaternion();
    this._mouse = { x: 0, y: 0, lastMove: 0 };
    window.addEventListener("mousemove", (e) => {
      this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
      this._mouse.lastMove = performance.now();
    });

    // ---- UI própria do combate -------------------------------------------------
    // vinheta de dano (borda vermelha que pulsa no impacto)
    this.vignette = document.createElement("div");
    this.vignette.className = "dmg-vignette";
    document.body.appendChild(this.vignette);
    this._vigT = 0;

    // barra de vida do JOGADOR (só existe em combate)
    this.hpBar = document.createElement("div");
    this.hpBar.className = "player-hp";
    this.hpBar.innerHTML = '<span>CASCO</span><div class="player-hp-track"><div class="player-hp-fill"></div></div>';
    this.hpBar.style.display = "none";
    document.body.appendChild(this.hpBar);
    this._hpFill = this.hpBar.querySelector(".player-hp-fill");

    // marcador do inimigo (única seta de navegação durante o combate)
    this.mark = document.createElement("div");
    this.mark.className = "enemy-mark";
    this.mark.innerHTML = '<span class="enemy-mark-dot">◆</span><span class="enemy-mark-dist"></span>';
    this.mark.style.display = "none";
    document.body.appendChild(this.mark);
    this._markDist = this.mark.querySelector(".enemy-mark-dist");

    // chip de missão do combate
    this.chip = document.createElement("div");
    this.chip.className = "mission-chip";
    this.chip.style.display = "none";
    document.body.appendChild(this.chip);
    this._chipFade = 0;

    // fagulhas de impacto na nave do jogador (pool)
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

  // nave do jogador presa (física zerada) durante as cinematográficas de
  // chegada E de fuga — na fuga a câmera acompanha o alien indo embora,
  // senão o jogador fica procurando pra onde ele foi
  get holdShip() {
    return this.state === "opening" || this.state === "arrive" || this.state === "leaving";
  }

  // dispara o encontro: portal abre à FRENTE do jogador (perto o bastante
  // pra ser visto; a câmera trava nele já no estado opening)
  trigger() {
    if (this.state !== "idle") return;
    const shipObj = this.ship.ship;
    this._tmp.set(0, 0, -1).applyQuaternion(shipObj.quaternion); // forward
    this._tmp2.set(1, 0, 0).applyQuaternion(shipObj.quaternion); // direita
    const portalPos = shipObj.position
      .clone()
      .addScaledVector(this._tmp, 7)
      .addScaledVector(this._tmp2, 2.2);
    this.portal.openAt(portalPos, 1.4);
    playPortalRupture(); // o "glow glow glow BOM" grave da ruptura
    this.playerHp = PLAYER_MAX_HP;
    this.state = "opening";
    this._t = 0;
    this.alien.load(() => {}); // baixa o GLB enquanto o portal abre
  }

  _showBanner() {
    const banner = document.createElement("div");
    banner.className = "mission-banner";
    banner.innerHTML = "<small>NOVA MISSÃO</small>Defenda o Sistema Solar";
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5200);
    this.chip.textContent = "◈ Missão: defenda o Sistema Solar";
    this.chip.style.display = "";
  }

  _playerHit(pos) {
    if (this.state !== "fight") return;
    this.playerHp -= 1;
    this._vigT = 1; // borda vermelha
    // a nave SENTE o tiro: sacode (impulso de rotação) e perde embalo
    this.ship.angVel.x += (Math.random() - 0.5) * 1.6;
    this.ship.angVel.z += (Math.random() - 0.5) * 2.2;
    this.ship.speed *= 0.55;
    this.ship.velocity.multiplyScalar(0.55);
    // fagulhas no ponto do impacto
    for (let i = 0; i < 3; i++) {
      const p = this.sparks.find((x) => x.life <= 0);
      if (!p) break;
      p.s.position.copy(pos);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9);
      p.s.scale.setScalar(0.05 + Math.random() * 0.05);
      p.s.material.opacity = 1;
      p.life = 0.7;
      p.s.visible = true;
    }
    if (this.playerHp <= 0) {
      this._end("defeat");
      this.ship.explode(); // derrota: a nave do jogador explode (renasce na Terra)
    }
  }

  _end(result) {
    if (this.state === "idle") return;
    if (result === "fled") {
      // fuga: portal atrás da nave alien; ela mergulha nele em "leaving"
      this._tmp.copy(this.alien.group.position).sub(this.ship.ship.position).normalize();
      this._fleeTarget.copy(this.alien.group.position).addScaledVector(this._tmp, 4);
      this.portal.openAt(this._fleeTarget, 1.4);
      playPortalRupture(); // a ruptura também anuncia a fuga
      this.alien.setFiring(false);
      this.state = "leaving";
      this._t = 0;
      this.chip.textContent = "✦ A nave alienígena fugiu pelo portal…";
      this._chipFade = 6;
      return;
    }
    this.state = "idle";
    this.portal.close();
    this.alien.hide();
    this.hpBar.style.display = "none";
    this.mark.style.display = "none";
    this.chip.textContent = result === "victory" ? "✓ Sistema Solar defendido!" : "✖ A nave alien venceu — dessa vez.";
    this._chipFade = 6;
    if (this.onEnd) this.onEnd(result);
  }

  update(dt) {
    this.portal.update(dt);
    this._updateFx(dt);
    if (this.state === "idle") {
      this._updateCinematicCamera(dt); // decai o close-up de volta pra chase
      return;
    }

    const shipObj = this.ship.ship;
    const playerPos = shipObj.position;

    // cinematic: nave do jogador presa (a câmera é tratada depois do switch,
    // com o alien já movido neste frame)
    if (this.holdShip) {
      this.ship.speed = 0;
      this.ship.velocity.set(0, 0, 0);
      this.ship.keys.clear();
    }

    this._t += dt;
    switch (this.state) {
      case "opening":
        if (this._t >= OPEN_SECS && this.alien.loaded) {
          this.alien.spawnAt(this.portal.group.position);
          this.state = "arrive";
          this._t = 0;
        }
        break;

      case "arrive": {
        // a nave desliza do portal até a distância de combate, de frente
        this._tmp.copy(playerPos).sub(this.alien.group.position);
        const d = this._tmp.length();
        if (d > 3.4) this.alien.group.position.addScaledVector(this._tmp.normalize(), dt * 1.6);
        this.alien.group.lookAt(playerPos);
        if (this.alien.group.scale.x < 1) {
          this.alien.group.scale.setScalar(Math.min(1, this.alien.group.scale.x + dt * 0.8));
        }
        if (this._t >= ARRIVE_SECS) {
          this.portal.close();
          this._showBanner();
          this.hpBar.style.display = "";
          this.state = "banner";
          this._t = 0;
        }
        break;
      }

      case "banner":
        this.alien.update(dt, playerPos);
        if (this._t >= BANNER_SECS) {
          this.alien.setFiring(true); // e o primeiro tiro é certeiro…
          this.state = "fight";
          this._t = 0;
        }
        break;

      case "fight":
        this.alien.update(dt, playerPos);
        this._mouseSteer(dt); // mouse mira junto com o teclado (opcional)
        this._aimAssist(dt, playerPos); // trava de 2s quando o alvo entra na mira
        if (this._t >= FIGHT_TIMEOUT) this._end("fled");
        break;

      case "leaving": {
        // mergulha no portal e some
        this._tmp.copy(this._fleeTarget).sub(this.alien.group.position);
        const d = this._tmp.length();
        this.alien.group.position.addScaledVector(this._tmp.normalize(), dt * Math.max(2.5, d));
        this.alien.group.scale.multiplyScalar(Math.max(0, 1 - dt * (d < 1 ? 2.5 : 0)));
        this.alien.update(dt, null); // bolts restantes seguem voando
        if (d < 0.4 || this._t > 4) {
          this.portal.close();
          this.alien.hide();
          this.state = "idle";
          this.hpBar.style.display = "none";
          this.mark.style.display = "none";
          if (this.onEnd) this.onEnd("fled");
        }
        break;
      }
    }

    this._updateCinematicCamera(dt);

    // UI de combate: barra do inimigo + marcador (única "seta" do modo).
    // Nas cinematográficas fica tudo escondido — cena limpa, só nave e portal.
    if (this.holdShip) {
      this.alien.bar.style.display = "none";
      this.mark.style.display = "none";
    } else {
      this.alien.updateBar(this.camera);
      this._updateMark(playerPos);
    }
    this._hpFill.style.width = `${(this.playerHp / PLAYER_MAX_HP) * 100}%`;
  }

  // direção por MOUSE (combate apenas, teclado continua valendo): a posição
  // do cursor vira taxa de giro — esquerda/direita guina, cima/baixo arfa.
  // Mouse parado há 1.5s não conta (cursor esquecido no canto não deriva).
  _mouseSteer(dt) {
    if (performance.now() - this._mouse.lastMove > MOUSE_IDLE_MS) return;
    const shape = (v) =>
      Math.abs(v) < MOUSE_DEADZONE ? 0 : Math.sign(v) * (Math.abs(v) - MOUSE_DEADZONE) / (1 - MOUSE_DEADZONE);
    const ax = shape(this._mouse.x);
    const ay = shape(this._mouse.y);
    if (ax) this.ship.ship.rotateY(-ax * MOUSE_RATE * dt);
    if (ay) this.ship.ship.rotateX(-ay * MOUSE_RATE * dt);
  }

  // assistente de mira: engata quando o alvo entra no cone do nariz OU aparece
  // na tela (a até LOCK_RANGE); trava 2s ACOMPANHANDO o strafe, depois solta e
  // espera o cooldown — janela de tiro sem virar piloto automático.
  _aimAssist(dt, playerPos) {
    if (!this.alien.alive) {
      this._lock = 0;
      this.mark.classList.remove("locked");
      return;
    }
    const shipObj = this.ship.ship;
    this._tmp.copy(this.alien.group.position).sub(playerPos);
    const dist = this._tmp.length();
    this._tmp.normalize();
    this._lockCd -= dt;

    if (this._lock <= 0 && this._lockCd <= 0 && dist < LOCK_RANGE) {
      this._tmp2.set(0, 0, -1).applyQuaternion(shipObj.quaternion); // nariz
      const ang = this._tmp2.angleTo(this._tmp);
      let onScreen = false;
      this._tmp2.copy(this.alien.group.position).project(this.camera);
      if (this._tmp2.z < 1 && Math.abs(this._tmp2.x) < 0.9 && Math.abs(this._tmp2.y) < 0.85) onScreen = true;
      if (ang < LOCK_CONE || onScreen) this._lock = LOCK_SECS;
    }

    if (this._lock > 0) {
      this._lock -= dt;
      // Matrix4.lookAt(eye, target, up): +Z = eye−target ⇒ nariz (−Z) no alvo
      this._m.lookAt(shipObj.position, this.alien.group.position, this.camera.up);
      this._tmpQ.setFromRotationMatrix(this._m);
      shipObj.quaternion.slerp(this._tmpQ, Math.min(1, dt * 5));
      this.mark.classList.add("locked");
      if (this._lock <= 0) this._lockCd = LOCK_COOLDOWN;
    } else {
      this.mark.classList.remove("locked");
    }
  }

  // CLOSE-UP cinematográfico: nas cenas de chegada/fuga a câmera desliza até
  // pertinho do alien (ou do portal, enquanto ele abre), posicionada ENTRE o
  // jogador e o alvo — a nossa nave fica atrás da câmera, fora do quadro.
  // Ao sair da cena, o peso decai e a câmera volta suave pra chase normal.
  _updateCinematicCamera(dt) {
    const cine = this.holdShip;
    this._camT += ((cine ? 1 : 0) - this._camT) * Math.min(1, dt * 2.6);
    if (this._camT <= 0.004) return;
    if (cine) {
      const onPortal = this.state === "opening" || !this.alien.group.visible;
      const focus = onPortal ? this.portal.group.position : this.alien.group.position;
      const dist = onPortal ? 2.3 : 0.8; // portal enquadrado; nave BEM de perto
      this._cineTgt.copy(focus);
      this._tmp.copy(this.ship.ship.position).sub(focus).normalize(); // alvo→jogador
      this._tmp2.crossVectors(this._tmp, this.camera.up);
      if (this._tmp2.lengthSq() < 1e-4) this._tmp2.set(1, 0, 0);
      this._tmp2.normalize();
      this._cinePos
        .copy(focus)
        .addScaledVector(this._tmp, dist)
        .addScaledVector(this._tmp2, dist * 0.3);
      this._cinePos.y += dist * 0.16; // levemente de cima: ângulo de cinema
    }
    // mistura: a chase já posicionou a câmera neste frame; puxa pro close-up
    this.camera.position.lerp(this._cinePos, this._camT);
    this._tmp.copy(this.ship.ship.position).lerp(this._cineTgt, this._camT);
    this.camera.lookAt(this._tmp);
  }

  _updateMark(playerPos) {
    if (!this.alien.alive || this.state === "idle") {
      this.mark.style.display = "none";
      return;
    }
    this._tmp.copy(this.alien.group.position).project(this.camera);
    const behind = this._tmp.z > 1;
    let x = (this._tmp.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-this._tmp.y * 0.5 + 0.5) * window.innerHeight;
    if (behind || Math.abs(this._tmp.x) > 0.97 || Math.abs(this._tmp.y) > 0.95) {
      // fora da tela: gruda na borda apontando a direção
      if (behind) {
        x = window.innerWidth - x;
        y = window.innerHeight - y;
      }
      x = Math.min(Math.max(x, 30), window.innerWidth - 30);
      y = Math.min(Math.max(y, 30), window.innerHeight - 30);
    }
    this.mark.style.display = "";
    this.mark.style.left = `${x}px`;
    this.mark.style.top = `${y}px`;
    this._markDist.textContent = `${this.alien.group.position.distanceTo(playerPos).toFixed(1)}u`;
  }

  _updateFx(dt) {
    // vinheta de dano esmaece
    if (this._vigT > 0) {
      this._vigT = Math.max(0, this._vigT - dt * 1.8);
      this.vignette.style.opacity = this._vigT;
    }
    // fagulhas voam e apagam
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.material.opacity = Math.max(0, p.life / 0.7);
      if (p.life <= 0) p.s.visible = false;
    }
    // chip de fim de combate some sozinho
    if (this._chipFade > 0) {
      this._chipFade -= dt;
      if (this._chipFade <= 0) this.chip.style.display = "none";
    }
  }
}
