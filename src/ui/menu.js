// Menu de miniaturas em duas linhas: corpos principais (Sol + planetas) em cima
// e planetas anões (menores) embaixo. Clicar voa a câmera até o corpo; ao focar
// um planeta com luas (Terra), as luas aparecem como sub-miniaturas.

import { MENU_ORDER, MOONS } from "../bodies/index.js";
import { t } from "../core/i18n.js";

export function createMenu({ onSelect }) {
  const root = document.createElement("div");
  root.className = "menu";

  // linha 1: principais (Sol + planetas)
  const mainStrip = document.createElement("div");
  mainStrip.className = "menu-strip";
  root.appendChild(mainStrip);

  // linha 2: planetas anões (miniaturas menores)
  const dwarfStrip = document.createElement("div");
  dwarfStrip.className = "menu-strip menu-dwarfs";
  root.appendChild(dwarfStrip);

  // sub-faixa de luas (aparece só quando o planeta focado tem luas)
  const moonStrip = document.createElement("div");
  moonStrip.className = "menu-moons";
  root.appendChild(moonStrip);

  function makeThumb(desc, variant = "") {
    const btn = document.createElement("button");
    btn.className = "thumb" + (variant ? " thumb-" + variant : "");
    btn.title = t("body." + desc.id) || desc.name;
    btn.dataset.id = desc.id;
    const ball = document.createElement("span");
    ball.className = "thumb-ball";
    // gradiente CSS reproduz a cor do corpo — miniatura leve, sem imagem
    ball.style.background = `radial-gradient(circle at 35% 30%, #fff6, ${desc.menuColor} 45%, #000a 130%)`;
    const label = document.createElement("span");
    label.className = "thumb-label";
    label.textContent = t("body." + desc.id) || desc.name;
    btn.append(ball, label);
    btn.addEventListener("click", () => select(desc.id));
    return btn;
  }

  // distribui por tipo: anões na linha de baixo, o resto na de cima
  const dwarfTip = document.createElement("span");
  dwarfTip.className = "menu-moons-tip";
  dwarfTip.textContent = t("menu.dwarfLabel");
  dwarfStrip.appendChild(dwarfTip);
  for (const desc of MENU_ORDER) {
    if (desc.type === "dwarf") dwarfStrip.appendChild(makeThumb(desc, "dwarf"));
    else mainStrip.appendChild(makeThumb(desc));
  }

  function highlight(id) {
    for (const b of root.querySelectorAll(".thumb")) b.classList.toggle("active", b.dataset.id === id);
  }

  function showMoons(planetId) {
    moonStrip.innerHTML = "";
    const moons = MOONS[planetId];
    if (!moons || !moons.length) {
      moonStrip.classList.remove("visible");
      return;
    }
    const tip = document.createElement("span");
    tip.className = "menu-moons-tip";
    tip.textContent = t("menu.moonLabel");
    moonStrip.appendChild(tip);
    for (const m of moons) moonStrip.appendChild(makeThumb(m, "moon"));
    moonStrip.classList.add("visible");
  }

  function select(id) {
    highlight(id);
    showMoons(id);
    onSelect(id);
  }

  document.body.appendChild(root);

  return {
    select,
    highlight,
    // esconde o menu quando a nave está pilotando (só a nave na cena)
    setVisible(v) {
      root.style.display = v ? "" : "none";
    },
  };
}
