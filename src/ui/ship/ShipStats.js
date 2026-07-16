import { t } from "./ShipLocalization.js";

export class ShipStats {
  constructor(container) {
    this.container = container;
  }

  render(save) {
    const hasPlasma = !!save.ship?.weapons?.plasmaCannon;
    const hasShield = !!save.inventory?.shield?.equipped;
    const hasScanner = !!save.inventory?.scanner?.equipped;
    
    // Calculate stats dynamically based on save state (e.g. upgrades/equipment)
    const statsList = [
      { key: "hull", value: "1200 / 1200 HP" },
      { key: "shield", value: hasShield ? "600 / 600 SP" : "0 / 0 SP (" + t("notEquipped") + ")" },
      { key: "speed", value: "3.3 c-units/s" },
      { key: "accel", value: "3.2 c-units/s²" },
      { key: "rotSpeed", value: "1.6 rad/s" },
      { key: "scanRange", value: hasScanner ? "35 c-units" : "18 c-units" },
      { key: "cargo", value: "80 Tons" },
      { key: "weapons", value: hasPlasma ? "1 / 2 Slots" : "0 / 2 Slots" },
      { key: "energy", value: "120 MW" },
      { key: "heat", value: "40°C" },
      { key: "mass", value: "48.2 Tons" },
    ];

    let html = `<div class="ship-stats-list">`;
    for (const stat of statsList) {
      html += `
        <div class="ship-stat-row">
          <span class="stat-name">${t(stat.key, "stats")}</span>
          <span class="stat-value">${stat.value}</span>
        </div>
      `;
    }
    html += `</div>`;
    this.container.innerHTML = html;
  }
}
