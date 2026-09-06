// CockpitView — Módulo de visualização em 1ª Pessoa / Cockpit / Câmera de Ação Espacial.
//
// Três estilos conforme a nave ativa:
//  • XR-07 (Nave Base): Cockpit envidraçado com 3 janelas [Lateral Esquerda][Frente][Lateral Direita],
//    com divisórias estruturais metálicas, mira HUD no vidro e visão dos tiros saindo de baixo das asas.
//  • Ônibus Espacial (Shuttle): Cockpit de nave pesada com 3 janelas reforçadas [Esquerda][Frente][Direita],
//    painéis de voo orbitais e tiro central concentrado no nariz.
//  • Caça Estelar (SW-X): Visão estilo "Gravação Espacial" (Câmera de Ação Externa) com HUD [● REC],
//    sem moldura de vidro tradicional, com os 4 canhões montados nas 4 pontas das asas visíveis nos
//    4 cantos da tela e os 4 feixes de laser disparando em direção à mira central.
//
// Efeitos Especiais Integrados:
//  • Supercruise: Distorção relativística do espaço com raios de dobra expandindo do centro (efeito filme).
//  • Aceleração normal: Riscos de poeira cósmica / partículas passando rápido pela tela ao acelerar.
//  • Dano frontal / Impacto: Flash vermelho no visor, glitch de energia no vidro e som de blindagem atingida.
//  • Áudio em 1ª pessoa: Sons de canhão específicos para o caça, nave base tecnológica e ônibus espacial.

import {
  playFighterCannonShot,
  playBaseTechShot,
  playShuttleShot,
  playArmorImpact,
} from "../combat/battleSfx.js";

export class CockpitView {
  constructor(container = document.body) {
    this.container = container;
    this.active = false;
    this.activeShipId = "xr07";

    this._time = 0;
    this._dmgFlash = 0;
    this._recSeconds = 0;

    this._initDom();
    this._initCanvas();
  }

  _initDom() {
    // Container principal do Cockpit HUD
    this.root = document.createElement("div");
    this.root.className = "cockpit-root";
    this.root.style.display = "none";

    // 1) Overlays de Cockpit de 3 Janelas (XR-07 e Ônibus Espacial)
    this.canopyCanopy = document.createElement("div");
    this.canopyCanopy.className = "cockpit-canopy-frame";
    this.canopyCanopy.innerHTML = `
      <div class="canopy-pillar pillar-left"></div>
      <div class="canopy-pillar pillar-right"></div>
      <div class="canopy-header"></div>
      <div class="canopy-dash">
        <div class="dash-panel panel-l">
          <div class="dash-lbl">PROPULSÃO</div>
          <div class="dash-bar"><div class="dash-bar-fill dash-thrust"></div></div>
          <div class="dash-val dash-speed-val">0.0 km/s</div>
        </div>
        <div class="dash-center">
          <div class="dash-crosshair"></div>
          <div class="dash-horizon">
            <div class="horizon-line"></div>
          </div>
        </div>
        <div class="dash-panel panel-r">
          <div class="dash-lbl">INTEGRIDADE</div>
          <div class="dash-bar"><div class="dash-bar-fill dash-hull-fill"></div></div>
          <div class="dash-val dash-hull-val">100%</div>
        </div>
      </div>
      <div class="glass-pane pane-left"><span class="pane-tag">L-WIN</span></div>
      <div class="glass-pane pane-center"><span class="pane-tag">FWD-CANOPY</span></div>
      <div class="glass-pane pane-right"><span class="pane-tag">R-WIN</span></div>
      <div class="glass-reflection"></div>
    `;

    // 2) Overlay de Câmera de Ação Espacial [● REC] (Caça SW-X)
    this.actionCam = document.createElement("div");
    this.actionCam.className = "action-cam-frame";
    this.actionCam.innerHTML = `
      <div class="rec-badge">
        <span class="rec-dot"></span>
        <span class="rec-txt">REC</span>
        <span class="rec-timer">00:00:00</span>
      </div>
      <div class="cam-telemetry-tl">
        <div>CAM-EXT-DORSAL // 60FPS</div>
        <div>OPTICAL STABILIZER: ACTIVE</div>
      </div>
      <div class="cam-telemetry-tr">
        <div class="cam-status-guns">4-GUN ARRAY: ARMED</div>
        <div class="cam-status-spd">SPD: 0.00c</div>
      </div>
      <div class="cam-crosshair">
        <div class="cam-reticle-circle"></div>
        <div class="cam-reticle-brackets"></div>
        <div class="cam-lead-target"></div>
      </div>
      <div class="cam-cannon-markers">
        <div class="cannon-mark mark-tl"><span class="gun-lbl">G1 [TOP-L]</span></div>
        <div class="cannon-mark mark-tr"><span class="gun-lbl">G2 [TOP-R]</span></div>
        <div class="cannon-mark mark-bl"><span class="gun-lbl">G3 [BTM-L]</span></div>
        <div class="cannon-mark mark-br"><span class="gun-lbl">G4 [BTM-R]</span></div>
      </div>
      <div class="cam-scanlines"></div>
      <div class="cam-vignette"></div>
    `;

    // 3) Efeito de Dano / Impacto Frontal
    this.damageOverlay = document.createElement("div");
    this.damageOverlay.className = "cockpit-damage-overlay";

    this.root.appendChild(this.canopyCanopy);
    this.root.appendChild(this.actionCam);
    this.root.appendChild(this.damageOverlay);
    this.container.appendChild(this.root);

    this._dashThrust = this.root.querySelector(".dash-thrust");
    this._dashSpeed = this.root.querySelector(".dash-speed-val");
    this._dashHullFill = this.root.querySelector(".dash-hull-fill");
    this._dashHullVal = this.root.querySelector(".dash-hull-val");
    this._recTimer = this.root.querySelector(".rec-timer");
    this._camSpd = this.root.querySelector(".cam-status-spd");
  }

  _initCanvas() {
    // Canvas para efeitos de dobra espacial (Supercruise) e aceleração
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cockpit-fx-canvas";
    this.root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas());

    // Pool de raios de dobra espacial relativística
    this.warpRays = [];
    for (let i = 0; i < 90; i++) {
      this.warpRays.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.05 + Math.random() * 0.95,
        speed: 1.5 + Math.random() * 2.5,
        length: 0.1 + Math.random() * 0.35,
        width: 1.2 + Math.random() * 2.2,
        alpha: 0.4 + Math.random() * 0.6,
      });
    }

    // Partículas de poeira cósmica rápida na aceleração normal
    this.dustParticles = [];
    for (let i = 0; i < 45; i++) {
      this.dustParticles.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: Math.random(),
        speed: 0.8 + Math.random() * 1.6,
      });
    }
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setActive(on, shipId = "xr07") {
    this.active = on;
    this.activeShipId = shipId;
    this.root.style.display = on ? "" : "none";
    this._updateModeDisplay();
  }

  setShipId(shipId) {
    this.activeShipId = shipId;
    if (this.active) this._updateModeDisplay();
  }

  _updateModeDisplay() {
    const isFighter = this.activeShipId === "naveSW";
    if (isFighter) {
      this.canopyCanopy.style.display = "none";
      this.actionCam.style.display = "";
      this.root.classList.add("mode-action-cam");
      this.root.classList.remove("mode-canopy");
    } else {
      this.canopyCanopy.style.display = "";
      this.actionCam.style.display = "none";
      this.root.classList.add("mode-canopy");
      this.root.classList.remove("mode-action-cam");

      const isShuttle = this.activeShipId === "shuttle";
      this.canopyCanopy.classList.toggle("shuttle-style", isShuttle);
      this.canopyCanopy.classList.toggle("xr07-style", !isShuttle);
    }
  }

  playShootSfx(shipId = this.activeShipId) {
    if (shipId === "naveSW") {
      playFighterCannonShot();
    } else if (shipId === "shuttle") {
      playShuttleShot();
    } else {
      playBaseTechShot();
    }
  }

  triggerDamageHit() {
    this._dmgFlash = 1.0;
    playArmorImpact();
  }

  update(dt, { speed = 0, maxSpeed = 3.3, supercruising = false, boosting = false, playerHp = 16, playerMaxHp = 16 } = {}) {
    if (!this.active) return;
    this._time += dt;

    // Atualiza timecode da câmera de ação
    this._recSeconds += dt;
    const hrs = String(Math.floor(this._recSeconds / 3600)).padStart(2, "0");
    const mins = String(Math.floor((this._recSeconds % 3600) / 60)).padStart(2, "0");
    const secs = String(Math.floor(this._recSeconds % 60)).padStart(2, "0");
    if (this._recTimer) this._recTimer.textContent = `${hrs}:${mins}:${secs}`;

    // Velocidade e telemetria nos painéis
    const spdPct = Math.min(speed / maxSpeed, 1);
    const spdKms = (speed * 1000).toFixed(1);
    if (this._dashSpeed) this._dashSpeed.textContent = `${spdKms} km/s`;
    if (this._dashThrust) this._dashThrust.style.width = `${Math.round(spdPct * 100)}%`;
    if (this._camSpd) this._camSpd.textContent = `SPD: ${(speed / 10).toFixed(2)}c`;

    // Vida da nave
    const hpFrac = Math.max(0, Math.min(playerHp / playerMaxHp, 1));
    if (this._dashHullFill) this._dashHullFill.style.width = `${Math.round(hpFrac * 100)}%`;
    if (this._dashHullVal) this._dashHullVal.textContent = `${Math.round(hpFrac * 100)}%`;

    // Flash de dano frontal
    if (this._dmgFlash > 0) {
      this._dmgFlash = Math.max(0, this._dmgFlash - dt * 2.5);
      this.damageOverlay.style.opacity = this._dmgFlash * 0.85;
      this.damageOverlay.style.boxShadow = `inset 0 0 ${Math.round(this._dmgFlash * 90)}px rgba(255, 30, 30, 0.9)`;
    } else {
      this.damageOverlay.style.opacity = "0";
    }

    // Desenha os efeitos no Canvas (Supercruise espichando o espaço + poeira rápida)
    this._renderCanvasFx(dt, speed, maxSpeed, supercruising, boosting);
  }

  _renderCanvasFx(dt, speed, maxSpeed, supercruising, boosting) {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);

    // 1) EFEITO SUPERCRUISE: ESPICHA O ESPAÇO DOBRANDO PARA FORA (Warp Tunnel)
    if (supercruising) {
      this.ctx.save();

      // Halo e brilho de compressão relativística no horizonte
      const grad = this.ctx.createRadialGradient(cx, cy, 10, cx, cy, maxR * 0.85);
      grad.addColorStop(0, "rgba(220, 240, 255, 0.15)");
      grad.addColorStop(0.3, "rgba(80, 160, 255, 0.08)");
      grad.addColorStop(0.7, "rgba(40, 90, 220, 0.04)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);

      // Linhas e raios espichados que viajam do centro pra borda em alta velocidade
      for (const ray of this.warpRays) {
        ray.dist += ray.speed * dt * 1.8;
        if (ray.dist > 1.0) {
          ray.dist = 0.02 + Math.random() * 0.08;
          ray.angle = Math.random() * Math.PI * 2;
        }

        const r1 = ray.dist * maxR;
        const r2 = Math.min((ray.dist + ray.length * ray.dist) * maxR, maxR);
        const x1 = cx + Math.cos(ray.angle) * r1;
        const y1 = cy + Math.sin(ray.angle) * r1;
        const x2 = cx + Math.cos(ray.angle) * r2;
        const y2 = cy + Math.sin(ray.angle) * r2;

        const rayGrad = this.ctx.createLinearGradient(x1, y1, x2, y2);
        rayGrad.addColorStop(0, `rgba(180, 225, 255, 0)`);
        rayGrad.addColorStop(0.4, `rgba(140, 210, 255, ${ray.alpha * 0.8})`);
        rayGrad.addColorStop(1, `rgba(255, 255, 255, ${ray.alpha})`);

        this.ctx.strokeStyle = rayGrad;
        this.ctx.lineWidth = ray.width * (0.5 + ray.dist * 1.5);
        this.ctx.lineCap = "round";
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
    // 2) EFEITO DE ACELERAÇÃO NORMAL: RISCOS DE POEIRA PASSANDO RÁPIDO
    else if (speed > 0.8 || boosting) {
      this.ctx.save();
      const mult = (boosting ? 2.5 : 1.2) * (speed / maxSpeed);

      for (const p of this.dustParticles) {
        p.z -= p.speed * dt * mult * 0.8;
        if (p.z <= 0.02) {
          p.z = 1.0;
          p.x = (Math.random() - 0.5) * 2;
          p.y = (Math.random() - 0.5) * 2;
        }

        const screenX = cx + (p.x / p.z) * (w * 0.45);
        const screenY = cy + (p.y / p.z) * (h * 0.45);

        // Cauda do risco apontando pro centro
        const tailLen = (1 - p.z) * (boosting ? 45 : 22);
        const toCx = cx - screenX;
        const toCy = cy - screenY;
        const d = Math.hypot(toCx, toCy) || 1;
        const nx = toCx / d;
        const ny = toCy / d;

        const alpha = Math.min((1 - p.z) * 1.4, 0.85);
        this.ctx.strokeStyle = `rgba(190, 225, 255, ${alpha})`;
        this.ctx.lineWidth = Math.max(1, (1 - p.z) * 2.2);
        this.ctx.beginPath();
        this.ctx.moveTo(screenX, screenY);
        this.ctx.lineTo(screenX + nx * tailLen, screenY + ny * tailLen);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }
}
