// WreckMission — a PRIMEIRA missão do Game Mode: "investigue o sinal de
// socorro perto de Júpiter".
//
// Fluxo (tudo em cima do Shipwreck que já existe atrás de Júpiter):
//  1. BRIEFING ao entrar no jogo: banner grande some sozinho e vira um chip de
//     objetivo no canto (o texto muda quando o "Sinal desconhecido" entra no GPS).
//  2. Bem perto do casco, um botão "Investigar" flutua PROJETADO sobre o
//     destroço. Clicou → a nave PARA (o gameMode segura a física) e uma
//     historinha curta avança por cliques.
//  3. No fim, aparece a MINIATURA da tecnologia — um recorte (via CSS) da vista
//     frontal da ficha canhao_plasma_nave_pequena.png. Clicar recupera: mostra
//     a FICHA INTEIRA (a imagem já gerada, com as explicações).
//  4. Fechar a ficha → jingle de descoberta (sfx) + toast "armas online" +
//     onUnlock() (o gameMode liga o PlasmaCannon). Missão concluída.
//
// Estado só da sessão (recarregou = missão de novo), igual aos asteroides.

import * as THREE from "three";
import { playDiscovery } from "../ui/sfx.js";
const cannonImgUrl = "itens/canhao_plasma_nave_pequena.png";

const INVESTIGATE_DIST = 30; // "bem próximo": ~2.5× o comprimento do casco (12u)
const BANNER_SECS = 9; // banner do briefing vira chip depois disso

const STORY = [
  "Cruzador colonial de longo alcance… o casco está partido e frio. Nenhum sinal de vida a bordo.",
  "O pedido de socorro vem de um transmissor automático — deve estar repetindo em loop há décadas.",
  "Hmm. A nave parece mesmo abandonada. Vale investigar mais de perto.",
  "Achei algo interessante: uma bateria de armas quase intacta na seção de proa.",
  "Talvez dê para aproveitar alguma coisa dela…",
];

// recorte da MINIATURA na ficha (1536×1024): quadrado sobre a "vista frontal"
// (a boca do canhão brilhando) — só esse pedacinho aparece como item clicável.
const IMG_W = 1536;
const CROP = { x: 848, y: 368, size: 220 };

export class WreckMission {
  constructor({ wreck, camera, onUnlock } = {}) {
    this.wreck = wreck;
    this.camera = camera;
    this.onUnlock = onUnlock;

    // brief → travel → story (nave parada) → loot → image → done
    this.state = "brief";
    this.storyIdx = 0;
    this._bannerT = 0;
    this._chipFade = 0;
    this._v = new THREE.Vector3();

    // banner do briefing (grande, some sozinho)
    this.banner = document.createElement("div");
    this.banner.className = "mission-banner";
    this.banner.innerHTML =
      "<small>NOVA MISSÃO</small>Investigue o sinal de socorro perto de Júpiter";
    document.body.appendChild(this.banner);

    // chip persistente do objetivo
    this.chip = document.createElement("div");
    this.chip.className = "mission-chip";
    this.chip.style.display = "none";
    this.chip.textContent = "◈ Missão: investigar o sinal de socorro perto de Júpiter";
    document.body.appendChild(this.chip);

    // botão "Investigar" projetado sobre o destroço
    this.investBtn = document.createElement("button");
    this.investBtn.className = "invest-btn";
    this.investBtn.textContent = "⌕ Investigar destroço";
    this.investBtn.style.display = "none";
    this.investBtn.addEventListener("click", (e) => {
      e.currentTarget.blur(); // Espaço (canhão) não pode "re-clicar" botões depois
      this._startStory();
    });
    document.body.appendChild(this.investBtn);

    // painel da história (embaixo, estilo diálogo)
    this.story = document.createElement("div");
    this.story.className = "story-panel";
    this.story.style.display = "none";
    this.story.innerHTML = `
      <p class="story-text"></p>
      <div class="story-actions"></div>`;
    document.body.appendChild(this.story);
    this._storyText = this.story.querySelector(".story-text");
    this._storyActions = this.story.querySelector(".story-actions");

    // overlay da ficha completa da tecnologia
    this.techOverlay = document.createElement("div");
    this.techOverlay.className = "tech-overlay";
    this.techOverlay.style.display = "none";
    this.techOverlay.innerHTML = `
      <div class="tech-box">
        <img class="tech-img" src="${cannonImgUrl}" alt="Canhão de Plasma Pequeno" />
        <p class="tech-caption">Tecnologia recuperada e integrada aos suportes sob as asas.
        Os capacitores ainda seguram carga — depois de décadas.</p>
        <button class="modal-btn yes tech-close">Instalar na nave</button>
      </div>`;
    document.body.appendChild(this.techOverlay);
    this.techOverlay.querySelector(".tech-close").addEventListener("click", (e) => {
      e.currentTarget.blur();
      this._finish();
    });
  }

  // o gameMode segura a nave (física parada) enquanto a história roda
  get holdShip() {
    return this.state === "story" || this.state === "loot" || this.state === "image";
  }

  // CONTINUAR de um save com a missão já concluída: pula direto pro estado
  // final sem banner, chip nem história (nada de refazer a missão)
  skipToDone() {
    this.state = "done";
    this._bannerT = -1;
    this._chipFade = 0;
    this.banner.remove();
    this.chip.remove();
  }

  _startStory() {
    this.state = "story";
    this.storyIdx = 0;
    this.investBtn.style.display = "none";
    this._showLine();
  }

  _showLine() {
    this.story.style.display = "";
    this._storyText.textContent = STORY[this.storyIdx];
    this._storyActions.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "story-btn";
    btn.textContent = this.storyIdx < STORY.length - 1 ? "Continuar ▸" : "Ver o que achei";
    btn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.storyIdx += 1;
      if (this.storyIdx < STORY.length) this._showLine();
      else this._showLoot();
    });
    this._storyActions.appendChild(btn);
  }

  // miniatura da tecnologia: recorte CSS da vista frontal da ficha
  _showLoot() {
    this.state = "loot";
    this._storyText.textContent =
      "TECNOLOGIA ENCONTRADA — Canhão de Plasma (pequeno). Clique no item para recuperar.";
    this._storyActions.innerHTML = "";
    const thumb = document.createElement("button");
    thumb.className = "tech-thumb";
    const view = 96; // px na tela
    const k = view / CROP.size;
    thumb.style.backgroundImage = `url(${cannonImgUrl})`;
    thumb.style.backgroundSize = `${Math.round(IMG_W * k)}px auto`;
    thumb.style.backgroundPosition = `-${Math.round(CROP.x * k)}px -${Math.round(CROP.y * k)}px`;
    thumb.title = "Canhão de Plasma — clique para recuperar";
    thumb.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.state = "image";
      this.story.style.display = "none";
      this.techOverlay.style.display = "";
    });
    this._storyActions.appendChild(thumb);
  }

  _finish() {
    this.state = "done";
    this.techOverlay.style.display = "none";
    playDiscovery(); // o "sonzinho maneiro" de nova descoberta

    this.chip.textContent = "✓ Missão concluída — canhão de plasma instalado";
    this.chip.classList.add("done");
    this._chipFade = 7; // some sozinho depois

    const toast = document.createElement("div");
    toast.className = "weapon-toast";
    toast.innerHTML = "⚡ ARMAS ONLINE<br /><small>segure <b>ESPAÇO</b> para disparar</small>";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6500);

    if (this.onUnlock) this.onUnlock();
  }

  // flying = nave em voo normal (fora de explosão); shipPos = posição da nave
  update(dt, { shipPos, flying = true } = {}) {
    // briefing: banner grande → chip
    if (this._bannerT >= 0) {
      this._bannerT += dt;
      if (this._bannerT > BANNER_SECS) {
        this.banner.remove();
        this._bannerT = -1;
        if (this.state !== "done") this.chip.style.display = "";
      }
    }
    if (this.state === "brief") this.state = "travel";

    // o chip acompanha a descoberta do sinal no GPS
    if (this.state === "travel" && this.wreck.revealed && !this._chipSignal) {
      this._chipSignal = true;
      this.chip.textContent = "◈ Missão: siga o “Sinal desconhecido” no GPS e investigue";
    }
    if (this._chipFade > 0) {
      this._chipFade -= dt;
      if (this._chipFade <= 0) this.chip.remove();
    }

    // botão Investigar: só perto do casco carregado, projetado sobre ele
    if (this.state === "travel") {
      const w = this.wreck;
      let show = false;
      if (flying && shipPos && w.loaded && w.group.visible) {
        const d = shipPos.distanceTo(w.group.position);
        if (d < INVESTIGATE_DIST) {
          this._v.copy(w.group.position).project(this.camera);
          if (this._v.z < 1 && Math.abs(this._v.x) < 0.95 && Math.abs(this._v.y) < 0.9) {
            const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
            this.investBtn.style.left = `${x}px`;
            this.investBtn.style.top = `${y}px`;
            show = true;
          }
        }
      }
      this.investBtn.style.display = show ? "" : "none";
    }
  }
}
