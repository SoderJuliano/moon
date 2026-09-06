import { getLocale, t } from "./ShipLocalization.js";
import { ShipRenderer } from "./ShipRenderer.js";
import { ShipEquipmentSlots } from "./ShipEquipmentSlots.js";
import { ShipStats } from "./ShipStats.js";
import { SHIP_CATALOG, shipDef, ensureHangar, setActiveShip, isShipUnlocked, getAchievementsProgress, getCombatKillsProgress, moveItem, ownsItem, itemShip, MOVABLE_ITEMS } from "../../game/hangar.js";

export class ShipMenu {
  // hooks (opcionais, ligados pelo gameMode):
  //   onLoadoutChanged()          — equipamento mudou de nave (recarregar canhão etc.)
  //   onActiveShipChanged(def)    — o jogador trocou de nave (trocar o modelo em voo)
  constructor(save, saveManager, hooks = {}) {
    this.save = save;
    this.saveManager = saveManager;
    this.hooks = hooks;
    this.isOpen = false;
    this.renderer = null;
    this.slots = null;
    this.stats = null;
    this.selectedEquipmentId = null;
    this.viewShipId = "xr07"; // nave em exibição (não necessariamente a ativa)

    // Create the overlay container
    this.overlay = document.createElement("div");
    this.overlay.className = "ship-menu-overlay";
    this.overlay.style.display = "none";
    document.body.appendChild(this.overlay);

    this._buildLayout();
    this._bindEvents();
  }

  _buildLayout() {
    this.overlay.innerHTML = `
      <div class="ship-menu-container">
        <!-- Header -->
        <div class="ship-menu-header">
          <div class="header-left">
            <span class="system-tag">SYSTEM // HANGAR_BAY</span>
            <h2>${t("menuTitle")}</h2>
          </div>
          <button class="close-btn" title="Fechar (Esc)">✕</button>
        </div>

        <div class="ship-menu-main">
          <!-- Left Panel: Stats and Controls -->
          <div class="panel-left">
            <div class="panel-section-title">${t("sectionStats")}</div>
            <div class="stats-container"></div>
          </div>

          <!-- Center Panel: 3D Ship Renderer -->
          <div class="panel-center">
            <div class="ship-title-container">
              <span class="ship-model-label"></span>
              <h1 class="ship-display-name"></h1>
              <p class="ship-story"></p>
            </div>
            <div class="ship-canvas-container"></div>
            <div class="ship-render-hint">
              <span>🖱️ Drag to Rotate</span>
              <span>🔍 Scroll to Zoom</span>
            </div>
            <div class="ship-activate-row"></div>
            <div class="panel-section-title ships-title">${t("sectionShips")}</div>
            <div class="ship-carousel"></div>
          </div>

          <!-- Right Panel: Equipment Slots & Details -->
          <div class="panel-right">
            <div class="panel-section-title">${t("sectionSlots")}</div>
            <div class="slots-container"></div>

            <div class="detail-panel">
              <div class="detail-placeholder">${t("selectPrompt")}</div>
              <div class="detail-content" style="display: none;">
                <div class="detail-header">
                  <h3 class="detail-name"></h3>
                  <span class="detail-status-badge"></span>
                </div>
                <div class="detail-image-container">
                  <img class="detail-image" src="" alt="Equipment">
                </div>
                <p class="detail-desc"></p>
                <p class="detail-lore"></p>

                <!-- English fallback legend for non-Portuguese players -->
                <div class="detail-en-legend" style="display: none;">
                  <div class="legend-title">${t("enTranslationLegend")}</div>
                  <div class="legend-content"></div>
                </div>

                <div class="detail-stats"></div>
                <div class="detail-actions"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const canvasContainer = this.overlay.querySelector(".ship-canvas-container");
    this.shipRenderer = new ShipRenderer(canvasContainer);

    const slotsContainer = this.overlay.querySelector(".slots-container");
    this.slots = new ShipEquipmentSlots(slotsContainer, (id, state) => this.selectEquipment(id, state));

    const statsContainer = this.overlay.querySelector(".stats-container");
    this.stats = new ShipStats(statsContainer);
  }

  _bindEvents() {
    this.overlay.querySelector(".close-btn").onclick = () => this.close();
  }

  // ---- naves (carrossel + ativação) -----------------------------------------

  _renderShips() {
    const hangar = ensureHangar(this.save);
    const prog = getAchievementsProgress(this.save);
    const bar = this.overlay.querySelector(".ship-carousel");
    let html = "";
    for (const def of SHIP_CATALOG) {
      const isUnlocked = isShipUnlocked(this.save, def.id);
      const info = t(def.id, "ships");
      const active = hangar.active === def.id;
      const viewing = this.viewShipId === def.id;

      let badgeHtml = "";
      if (active) {
        badgeHtml = `<span class="ship-car-badge active">${t("activeShip")}</span>`;
      } else if (!isUnlocked) {
        if (def.id === "naveSW") {
          const combatProg = getCombatKillsProgress(this.save);
          badgeHtml = `<span class="ship-car-badge locked">🔒 ${combatProg.kills} / 20</span>`;
        } else {
          badgeHtml = `<span class="ship-car-badge locked">🔒 ${prog.percentage}% / 80%</span>`;
        }
      }

      html += `
        <div class="ship-car-card ${viewing ? "selected" : ""} ${active ? "active" : ""} ${!isUnlocked ? "locked" : ""}" data-id="${def.id}">
          <span class="ship-car-name">${!isUnlocked ? "🔒 " : ""}${info.name}</span>
          <span class="ship-car-reg">${info.registry}</span>
          ${badgeHtml}
        </div>`;
    }
    bar.innerHTML = html;
    for (const card of bar.querySelectorAll(".ship-car-card")) {
      card.onclick = () => this._viewShip(card.dataset.id);
    }
    this._renderActivateRow();
  }

  _renderActivateRow() {
    const hangar = ensureHangar(this.save);
    const row = this.overlay.querySelector(".ship-activate-row");
    const isUnlocked = isShipUnlocked(this.save, this.viewShipId);

    if (this.viewShipId === hangar.active) {
      row.innerHTML = `<span class="ship-active-tag">✓ ${t("activeShipInFlight")}</span>`;
      return;
    }

    if (!isUnlocked) {
      if (this.viewShipId === "naveSW") {
        const combatProg = getCombatKillsProgress(this.save);
        row.innerHTML = `
          <div class="ship-locked-banner">
            <span class="lock-text">${t("lockedNoticeKills", { kills: combatProg.kills, required: combatProg.required })}</span>
          </div>`;
      } else {
        const prog = getAchievementsProgress(this.save);
        row.innerHTML = `
          <div class="ship-locked-banner">
            <span class="lock-text">${t("lockedNotice", { count: prog.unlocked, reqCount: prog.required, pct: prog.percentage, req: 80 })}</span>
          </div>`;
      }
      return;
    }

    row.innerHTML = `<button class="activate-ship-btn">🚀 ${t("activateShip")}</button>`;
    row.querySelector(".activate-ship-btn").onclick = () => this._activate(this.viewShipId);
  }

  _activate(shipId) {
    // Ao ativar, transfere automaticamente todos os equipamentos possuídos
    this._doActivate(shipId, true);
  }

  _doActivate(shipId, moveEquipment = true) {
    setActiveShip(this.save, shipId, { moveEquipment });
    this.saveManager?.saveNow?.();
    this.hooks.onLoadoutChanged?.();
    this.hooks.onActiveShipChanged?.(shipDef(shipId));
    this._viewShip(shipId);
  }

  _viewShip(shipId) {
    this.viewShipId = shipId;
    const def = shipDef(shipId);
    const info = t(shipId, "ships");
    this.overlay.querySelector(".ship-model-label").textContent = info.registry;
    this.overlay.querySelector(".ship-display-name").textContent = info.name;
    this.overlay.querySelector(".ship-story").textContent = info.story || "";
    this.shipRenderer.setModel(def.modelPath, def.yaw, def.pitch, def.roll || 0);
    this.stats.render(this.save, shipId);
    this.slots.render(this.save, shipId);
    this._renderShips();

    // Auto-select first slot da nave em exibição
    const firstSlot = this.slots.getSlots(this.save, shipId)[0];
    if (firstSlot) {
      this.slots.selectedId = firstSlot.id;
      this.slots.render(this.save, shipId);
      this.selectEquipment(firstSlot.id, firstSlot.state);
    }
  }

  // ---- equipamento -----------------------------------------------------------

  selectEquipment(id, state = "here") {
    this.selectedEquipmentId = id;
    const locale = getLocale();

    const detailContent = this.overlay.querySelector(".detail-content");
    const detailPlaceholder = this.overlay.querySelector(".detail-placeholder");

    if (state === "empty") {
      detailPlaceholder.textContent = t("emptySlotPrompt");
      detailPlaceholder.style.display = "flex";
      detailContent.style.display = "none";
      return;
    }

    const equipInfo = t(id, "equip");
    const nameEl = this.overlay.querySelector(".detail-name");
    const statusEl = this.overlay.querySelector(".detail-status-badge");
    const imgEl = this.overlay.querySelector(".detail-image");
    const descEl = this.overlay.querySelector(".detail-desc");
    const loreEl = this.overlay.querySelector(".detail-lore");
    const statsEl = this.overlay.querySelector(".detail-stats");
    const legendEl = this.overlay.querySelector(".detail-en-legend");
    const actionsEl = this.overlay.querySelector(".detail-actions");

    detailPlaceholder.style.display = "none";
    detailContent.style.display = "flex";

    nameEl.textContent = equipInfo.name;
    const away = state === "elsewhere";
    statusEl.textContent = away ? t("onOtherShip") : t("equipped");
    statusEl.className = `detail-status-badge ${away ? "away" : "equipped"}`;

    // Image mapping
    let imgPath = "itens/canhao_plasma_nave_pequena.png"; // fallback
    if (id === "plasmaCannon") imgPath = "itens/canhao_plasma_nave_pequena.png";
    else if (id === "shieldGen") imgPath = "itens/escudo_inpacto.png";
    else if (id === "scanner") imgPath = "itens/scannerDeObjetosEspaciais.png";
    else if (id === "tractor") imgPath = "itens/tractor_beam.png";
    else imgPath = "itens/generic_item.png";

    imgEl.src = imgPath;
    descEl.textContent = equipInfo.desc;
    loreEl.textContent = equipInfo.lore;

    // Render Stats
    let statsHtml = "";
    if (equipInfo.stats) {
      for (const [key, val] of Object.entries(equipInfo.stats)) {
        statsHtml += `<div class="detail-stat-row"><span class="stat-lbl">${key.toUpperCase()}</span><span class="stat-val">${val}</span></div>`;
      }
    }
    statsEl.innerHTML = statsHtml;

    // item em outra nave: dá pra trazer pra cá (mover, nunca duplicar)
    if (away) {
      actionsEl.innerHTML = `<button class="activate-ship-btn move-here">${t("moveHere")}</button>`;
      actionsEl.querySelector(".move-here").onclick = () => {
        moveItem(this.save, id, this.viewShipId);
        this.saveManager?.saveNow?.();
        this.hooks.onLoadoutChanged?.();
        this.stats.render(this.save, this.viewShipId);
        this.slots.render(this.save, this.viewShipId);
        this.selectEquipment(id, "here");
      };
    } else {
      actionsEl.innerHTML = "";
    }

    // English legend handling
    if (locale !== "pt") {
      const enEquip = t(id, "equip"); // Already localized as it checks getLocale()
      legendEl.style.display = "block";
      legendEl.querySelector(".legend-content").innerHTML = `
        <strong>${enEquip.name}</strong><br>
        ${enEquip.desc}<br>
        <span style="font-style: italic; font-size: 11px; opacity: 0.8;">${enEquip.lore}</span>
      `;
    } else {
      legendEl.style.display = "none";
    }
  }

  open() {
    this.isOpen = true;
    this.overlay.style.display = "flex";
    const hangar = ensureHangar(this.save);
    this.viewShipId = hangar.active;
    this.shipRenderer.init(shipDef(this.viewShipId));
    this._viewShip(this.viewShipId);

    // Set pause state in game logic if needed
    if (window.setGamePaused) {
      window.setGamePaused(true);
    }
  }

  close() {
    this.isOpen = false;
    this.overlay.style.display = "none";
    this.shipRenderer.destroy();

    if (window.setGamePaused) {
      window.setGamePaused(false);
    }
  }
}
