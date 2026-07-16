import { getLocale, t } from "./ShipLocalization.js";
import { ShipRenderer } from "./ShipRenderer.js";
import { ShipEquipmentSlots } from "./ShipEquipmentSlots.js";
import { ShipStats } from "./ShipStats.js";

export class ShipMenu {
  constructor(save, saveManager) {
    this.save = save;
    this.saveManager = saveManager;
    this.isOpen = false;
    this.renderer = null;
    this.slots = null;
    this.stats = null;
    this.selectedEquipmentId = null;

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
              <span class="ship-model-label">REGISTRY // XR-07</span>
              <h1 class="ship-display-name">${t("shipName")}</h1>
            </div>
            <div class="ship-canvas-container"></div>
            <div class="ship-render-hint">
              <span>🖱️ Drag to Rotate</span>
              <span>🔍 Scroll to Zoom</span>
            </div>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const canvasContainer = this.overlay.querySelector(".ship-canvas-container");
    this.shipRenderer = new ShipRenderer(canvasContainer);

    const slotsContainer = this.overlay.querySelector(".slots-container");
    this.slots = new ShipEquipmentSlots(slotsContainer, (id, equipped) => this.selectEquipment(id, equipped));

    const statsContainer = this.overlay.querySelector(".stats-container");
    this.stats = new ShipStats(statsContainer);
  }

  _bindEvents() {
    this.overlay.querySelector(".close-btn").onclick = () => this.close();
  }

  selectEquipment(id, isEquipped = true) {
    this.selectedEquipmentId = id;
    const locale = getLocale();

    const detailContent = this.overlay.querySelector(".detail-content");
    const detailPlaceholder = this.overlay.querySelector(".detail-placeholder");

    if (!isEquipped) {
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

    detailPlaceholder.style.display = "none";
    detailContent.style.display = "flex";

    nameEl.textContent = equipInfo.name;
    statusEl.textContent = t("equipped");
    statusEl.className = `detail-status-badge equipped`;
    
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
    this.stats.render(this.save);
    this.slots.render(this.save);
    this.shipRenderer.init();
    
    // Auto-select first slot
    const firstSlot = this.slots.getSlots(this.save)[0];
    if (firstSlot) {
      this.slots.selectedId = firstSlot.id;
      this.slots.render(this.save);
      this.selectEquipment(firstSlot.id, firstSlot.equipped);
    }

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
