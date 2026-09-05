import { t } from "./ShipLocalization.js";
import { ownsItem, itemShip } from "../../game/hangar.js";

// atributos base por nave (sabor/ficção — o voo real é o mesmo motor)
const BASE = {
  xr07: {
    hull: "1200 / 1200 HP", speed: "3.3 c-units/s", accel: "3.2 c-units/s²",
    rotSpeed: "1.6 rad/s", cargo: "80 Tons", energy: "120 MW", heat: "40°C", mass: "48.2 Tons",
  },
  shuttle: {
    hull: "1800 / 1800 HP", speed: "3.3 c-units/s", accel: "2.9 c-units/s²",
    rotSpeed: "1.3 rad/s", cargo: "220 Tons", energy: "140 MW", heat: "55°C", mass: "112.6 Tons",
  },
  naveSW: {
    hull: "1500 / 1500 HP", speed: "3.5 c-units/s", accel: "3.6 c-units/s²",
    rotSpeed: "2.0 rad/s", cargo: "100 Tons", energy: "180 MW", heat: "35°C", mass: "36.4 Tons",
  },
};

export class ShipStats {
  constructor(container) {
    this.container = container;
  }

  render(save, shipId = "xr07") {
    const here = (id) => ownsItem(save, id) && itemShip(save, id) === shipId;
    const hasPlasma = here("plasmaCannon");
    const hasShield = here("shieldGen");
    const hasScanner = here("scanner");
    const base = BASE[shipId] || BASE.xr07;

    // Calculate stats dynamically based on save state (e.g. upgrades/equipment)
    const statsList = [
      { key: "hull", value: base.hull },
      { key: "shield", value: hasShield ? "600 / 600 SP" : "0 / 0 SP (" + t("notEquipped") + ")" },
      { key: "speed", value: base.speed },
      { key: "accel", value: base.accel },
      { key: "rotSpeed", value: base.rotSpeed },
      { key: "scanRange", value: hasScanner ? "35 c-units" : "18 c-units" },
      { key: "cargo", value: base.cargo },
      { key: "weapons", value: hasPlasma ? "1 / 2 Slots" : "0 / 2 Slots" },
      { key: "energy", value: base.energy },
      { key: "heat", value: base.heat },
      { key: "mass", value: base.mass },
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
