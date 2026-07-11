// ESCUDO DO JOGADOR — "Shield Gen SG-01 (danificado)", o troféu da batalha
// contra os Gêmeos. Recuperado dos destroços: FUNCIONA, mas aguenta só
// 2 tiros — e recarrega bem mais devagar que os 3.2s da ficha (está torrado).
//
// Fluxo de recompensa igual aos itens anteriores: painel com a MINIATURA
// recortada da imagem (a bolha azul do painel "ATIVO"); clicar abre a FICHA
// INTEIRA (escudo_inpacto.png) com o botão de instalar; instalar toca o
// jingle de descoberta (som de interface).
//
// Em combate: bolt inimigo → tryAbsorb() consome 1 carga, a bolha azul acende
// ao redor da NOSSA nave (invisível até o impacto, como diz a ficha) e o tiro
// não machuca. Sem cargas, o dano passa. Recarrega 1 carga a cada 45s.

import * as THREE from "three";
import { playDiscovery } from "../ui/sfx.js";
import { playShieldHit } from "../combat/battleSfx.js";

const MAX_CHARGES = 2; // danificado: aguenta 2 tiros
const RECHARGE_S = 45; // por carga (a ficha promete 3.2s… quando novo)
const BUBBLE_R = 0.1; // envolve a nave (0.06u)
const IMG_W = 1536; // escudo_inpacto.png é 1536×1024
const CROP = { x: 968, y: 676, size: 292 }; // recorte da bolha "ATIVO (IMPACTO)"

export class PlayerShield {
  constructor(scene, save, getShip) {
    this.save = save;
    this.getShip = getShip;
    if (!save.inventory.shield) save.inventory.shield = { owned: false, equipped: false, charges: MAX_CHARGES };
    this._recharge = 0;

    // a bolha (invisível até absorver um impacto)
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(BUBBLE_R, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x4a8cff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.bubble.visible = false;
    scene.add(this.bubble);
    this._glow = 0;

    // HUD: pips de carga (aparece só quando faz sentido — combate/absorção)
    this.hud = document.createElement("div");
    this.hud.className = "shield-pips";
    this.hud.style.display = "none";
    document.body.appendChild(this.hud);
    this._hudT = 0;

    // painel de recompensa + ficha inteira
    this.reward = document.createElement("div");
    this.reward.className = "scan-reward";
    this.reward.style.display = "none";
    document.body.appendChild(this.reward);

    this.sheet = document.createElement("div");
    this.sheet.className = "shield-sheet";
    this.sheet.style.display = "none";
    document.body.appendChild(this.sheet);
  }

  get owned() {
    return !!this.save.inventory.shield?.owned;
  }
  get equipped() {
    return !!this.save.inventory.shield?.equipped;
  }
  get charges() {
    return this.save.inventory.shield?.charges ?? 0;
  }

  // recompensa da vitória: miniatura (bolha azul) → ficha inteira → instalar
  grant() {
    const inv = this.save.inventory.shield;
    inv.owned = true;
    inv.charges = MAX_CHARGES;
    const view = 120;
    const k = view / CROP.size;
    this.reward.innerHTML = `
      <div class="scan-reward-box">
        <small>RECOMPENSA DE BATALHA</small>
        <b>Shield Gen SG-01 (danificado)</b>
        <button class="scan-thumb" title="Ver o item"
          style="width:${view}px;height:${view}px;background-image:url(itens/escudo_inpacto.png);
          background-size:${Math.round(IMG_W * k)}px auto;
          background-position:-${Math.round(CROP.x * k)}px -${Math.round(CROP.y * k)}px"></button>
        <p>Recuperado dos destroços dos Gêmeos. Clique no item para examinar.</p>
      </div>`;
    this.reward.style.display = "";
    this.reward.querySelector(".scan-thumb").onclick = (e) => {
      e.currentTarget.blur();
      this.reward.style.display = "none";
      this._openSheet();
    };
  }

  _openSheet() {
    this.sheet.innerHTML = `
      <div class="shield-sheet-box">
        <img src="itens/escudo_inpacto.png" alt="Escudo Invisível — Shield Gen SG-01" />
        <p>Gerador de campo defletor arrancado do casco de um dos Gêmeos. A célula
        está rachada: absorve <b>2 impactos</b> e leva um bom tempo pra recarregar —
        mas entre nada e isso, você fica com isso.</p>
        <button class="modal-btn yes" data-act="install">Instalar na nave</button>
      </div>`;
    this.sheet.style.display = "";
    this.sheet.querySelector('[data-act="install"]').onclick = (e) => {
      e.currentTarget.blur();
      this.save.inventory.shield.equipped = true;
      this.sheet.style.display = "none";
      playDiscovery(); // instalação = conquista de tecnologia (som de interface)
      this._hudT = 5; // mostra os pips um instante pra apresentar o recurso
    };
  }

  // bolt inimigo chegando: true = absorvido (a bolha acende, 1 carga a menos)
  tryAbsorb() {
    const inv = this.save.inventory.shield;
    if (!inv?.equipped || inv.charges <= 0) return false;
    inv.charges -= 1;
    this._glow = 1;
    this._recharge = 0; // levar tiro reinicia o ciclo de recarga
    this._hudT = 4;
    playShieldHit();
    return true;
  }

  update(dt, { inCombat = false } = {}) {
    const inv = this.save.inventory.shield;
    // recarga lenta (danificado)
    if (inv?.equipped && inv.charges < MAX_CHARGES) {
      this._recharge += dt;
      if (this._recharge >= RECHARGE_S) {
        this._recharge = 0;
        inv.charges += 1;
        this._hudT = 3;
      }
    }
    // a bolha segue a nave e apaga sozinha depois do impacto
    if (this._glow > 0) {
      this._glow = Math.max(0, this._glow - dt * 1.6);
      const ship = this.getShip();
      this.bubble.position.copy(ship.position);
      this.bubble.material.opacity = this._glow * 0.4;
      this.bubble.visible = this._glow > 0.01;
    }
    // HUD dos pips: em combate (equipado) ou logo após absorver/recarregar
    if (this._hudT > 0) this._hudT -= dt;
    const show = inv?.equipped && (inCombat || this._hudT > 0);
    this.hud.style.display = show ? "" : "none";
    if (show) {
      this.hud.innerHTML =
        "ESCUDO " +
        Array.from({ length: MAX_CHARGES }, (_, i) => `<i class="${i < inv.charges ? "on" : ""}"></i>`).join("");
    }
  }
}
