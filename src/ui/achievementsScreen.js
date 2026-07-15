// Tela de CONQUISTAS — lista simples, agrupada por categoria.
//
// Cada item descoberto mostra miniatura (bolinha do planeta ou emoji), nome,
// categoria e data/hora reais da descoberta. Não descoberto = silhueta escura,
// "??????" e "Não descoberto". Abre pelo menu de pausa do Game Mode.

import { CATEGORIES } from "../game/discoveryRegistry.js";
import { t, getLang } from "../core/i18n.js";

function ballStyle(color) {
  return `background: radial-gradient(circle at 35% 30%, #fff6, ${color} 45%, #000a 130%)`;
}

export class AchievementsScreen {
  // save = SaveManager; catalog = Map(id -> item) do AchievementSystem
  constructor({ save, catalog }) {
    this.save = save;
    this.catalog = catalog;
    this.el = document.createElement("div");
    this.el.className = "ach-overlay";
    this.el.style.display = "none";
    document.body.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el || e.target.dataset?.act === "close") this.close();
    });
  }

  open() {
    this.el.innerHTML = this._render();
    this.el.style.display = "";
  }

  close() {
    this.el.style.display = "none";
  }

  get isOpen() {
    return this.el.style.display !== "none";
  }

  _render() {
    const discoveries = this.save.data?.discoveries || {};
    const order = [CATEGORIES.PLANETS, CATEGORIES.POI, CATEGORIES.MARKS];
    const groups = new Map(order.map((c) => [c, []]));
    for (const item of this.catalog.values()) {
      (groups.get(item.category) || groups.get(CATEGORIES.MARKS)).push(item);
    }

    let unlockedCount = 0;
    const sections = order
      .map((cat) => {
        const rows = groups
          .get(cat)
          .map((item) => {
            const got = discoveries[item.id];
            if (got) unlockedCount += 1;
            const thumb = got
              ? item.color
                ? `<span class="ach-ball" style="${ballStyle(item.color)}"></span>`
                : `<span class="ach-icon">${item.icon || "✦"}</span>`
              : `<span class="ach-ball ach-locked-ball"></span>`;
            const when = got ? new Date(got.at) : null;
            const lang = getLang();
            const locale = lang === "pt" ? "pt-BR" : "en-US";
            const meta = got
              ? `${when.toLocaleDateString(locale)} · ${when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
              : t("ach.notDiscovered");
            return `
              <div class="ach-item ${got ? "" : "ach-locked"}">
                ${thumb}
                <div class="ach-text">
                  <div class="ach-name">${got ? (t("discovery.name." + item.id) || item.name) : "??????"}</div>
                  <div class="ach-meta">${t("cat." + cat)} · ${meta}</div>
                </div>
              </div>`;
          })
          .join("");
        return `<div class="ach-cat">${t("cat." + cat)}</div><div class="ach-grid">${rows}</div>`;
      })
      .join("");

    return `
      <div class="ach-box">
        <div class="ach-head">
          <h3>${t("ach.title")}</h3>
          <span class="ach-count">${unlockedCount}/${this.catalog.size}</span>
          <button class="modal-btn ach-close" data-act="close">${t("ach.close")}</button>
        </div>
        <div class="ach-body">${sections}</div>
      </div>`;
  }
}
