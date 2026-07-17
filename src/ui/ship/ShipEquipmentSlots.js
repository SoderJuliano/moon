import { t } from "./ShipLocalization.js";
import { ownsItem, itemShip } from "../../game/hangar.js";

export class ShipEquipmentSlots {
  // onSelectSlot(id, state) — state: "here" (instalado nesta nave),
  // "elsewhere" (o item existe, mas está em outra nave) ou "empty"
  constructor(container, onSelectSlot) {
    this.container = container;
    this.onSelectSlot = onSelectSlot;
    this.selectedId = null;
  }

  // slots da NAVE VISUALIZADA no hangar — cada item existe uma vez só;
  // o que está em outra nave aparece esmaecido (dá pra mover, não duplicar)
  getSlots(save, shipId) {
    const state = (id) => {
      if (!ownsItem(save, id)) return "empty";
      return itemShip(save, id) === shipId ? "here" : "elsewhere";
    };
    return [
      { id: "scanner", img: "itens/scannerDeObjetosEspaciais.png", state: state("scanner") },
      { id: "plasmaCannon", img: "itens/canhao_plasma_nave_pequena.png", state: state("plasmaCannon") },
      { id: "shieldGen", img: "itens/escudo_inpacto.png", state: state("shieldGen") },
      { id: "tractor", img: "itens/tractor_beam.png", state: "here" }, // de série em toda nave
    ];
  }

  render(save, shipId) {
    const slots = this.getSlots(save, shipId);
    let html = `<div class="ship-slots-grid matrix-4">`;
    for (const slot of slots) {
      const selectedClass = this.selectedId === slot.id ? "selected" : "";

      if (slot.state === "empty") {
        html += `
          <div class="ship-slot-card empty ${selectedClass}" data-id="${slot.id}">
            <div class="slot-thumb-container empty">
              <div class="empty-icon">🔲</div>
            </div>
            <div class="slot-info">
              <span class="slot-name">${t("emptySlot")}</span>
              <span class="slot-status empty">${t("emptyStatus")}</span>
            </div>
          </div>
        `;
        continue;
      }

      const equipInfo = t(slot.id, "equip");
      const away = slot.state === "elsewhere";
      html += `
        <div class="ship-slot-card equipped ${away ? "away" : ""} ${selectedClass}" data-id="${slot.id}">
          <div class="slot-thumb-container">
            <img class="slot-thumb" src="${slot.img}" alt="${equipInfo.name}">
          </div>
          <div class="slot-info">
            <span class="slot-name">${equipInfo.name}</span>
            <span class="slot-status ${away ? "away" : "equipped"}">${away ? t("onOtherShip") : t("equipped")}</span>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    this.container.innerHTML = html;

    const cards = this.container.querySelectorAll(".ship-slot-card");
    cards.forEach(card => {
      card.onclick = () => {
        const id = card.dataset.id;
        const slot = slots.find(s => s.id === id);
        this.selectedId = id;
        this.render(save, shipId); // rerender to update selection highlight
        this.onSelectSlot(id, slot.state);
      };
    });
  }
}
