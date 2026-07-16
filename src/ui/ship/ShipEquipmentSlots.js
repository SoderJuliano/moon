import { t } from "./ShipLocalization.js";

export class ShipEquipmentSlots {
  constructor(container, onSelectSlot) {
    this.container = container;
    this.onSelectSlot = onSelectSlot;
    this.selectedId = null;
  }

  getSlots(save) {
    return [
      { id: "scanner", img: "itens/scannerDeObjetosEspaciais.png", equipped: !!save.inventory?.scanner?.equipped },
      { id: "plasmaCannon", img: "itens/canhao_plasma_nave_pequena.png", equipped: !!save.ship?.weapons?.plasmaCannon },
      { id: "shieldGen", img: "itens/escudo_inpacto.png", equipped: !!save.inventory?.shield?.equipped },
      { id: "tractor", img: "itens/tractor_beam.png", equipped: true }, // Standard / always equipped
    ];
  }

  render(save) {
    const slots = this.getSlots(save);
    let html = `<div class="ship-slots-grid matrix-4">`;
    for (const slot of slots) {
      const selectedClass = this.selectedId === slot.id ? "selected" : "";
      
      if (slot.equipped) {
        const equipInfo = t(slot.id, "equip");
        html += `
          <div class="ship-slot-card equipped ${selectedClass}" data-id="${slot.id}">
            <div class="slot-thumb-container">
              <img class="slot-thumb" src="${slot.img}" alt="${equipInfo.name}">
            </div>
            <div class="slot-info">
              <span class="slot-name">${equipInfo.name}</span>
              <span class="slot-status equipped">${t("equipped")}</span>
            </div>
          </div>
        `;
      } else {
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
      }
    }
    html += `</div>`;
    this.container.innerHTML = html;

    const cards = this.container.querySelectorAll(".ship-slot-card");
    cards.forEach(card => {
      card.onclick = () => {
        const id = card.dataset.id;
        const slot = slots.find(s => s.id === id);
        this.selectedId = id;
        this.render(save); // rerender to update selection highlight
        this.onSelectSlot(id, slot.equipped);
      };
    });
  }
}
