// HUD discreta no canto: toggle Fantasia/Real, botão de visão panorâmica,
// controle de velocidade do tempo e a data simulada.

import { t, getLang } from "../core/i18n.js";

export function createHud({ onModeChange, onPanoramic, onSpeedChange, initialMode = "fantasy" }) {
  const root = document.createElement("div");
  root.className = "hud";

  // --- Toggle Fantasia / Real -------------------------------------------
  const toggle = document.createElement("button");
  toggle.className = "hud-toggle";
  let mode = initialMode;
  const renderToggle = () => {
    toggle.dataset.mode = mode;
    toggle.innerHTML =
      mode === "fantasy"
        ? `<span class="dot"></span> ${t("hud.scale")}: <b>${t("hud.approximate")}</b>`
        : `<span class="dot real"></span> ${t("hud.scale")}: <b>${t("hud.real")}</b>`;
  };
  toggle.addEventListener("click", () => {
    mode = mode === "fantasy" ? "real" : "fantasy";
    renderToggle();
    onModeChange(mode);
  });
  renderToggle();

  // --- Botão panorâmico --------------------------------------------------
  const pano = document.createElement("button");
  pano.className = "hud-btn";
  pano.innerHTML = t("hud.panoramic");
  let panoActive = false;
  pano.addEventListener("click", () => {
    panoActive = !panoActive;
    pano.classList.toggle("active", panoActive);
    onPanoramic(panoActive);
  });

  // --- Velocidade do tempo (passos discretos: 4h ... 8 dias por segundo) --
  const SPEED_STEPS = [
    { d: 1 / 24, h: 1 },
    { d: 2 / 24, h: 2 },
    { d: 4 / 24, h: 4 },
    { d: 8 / 24, h: 8 },
    { d: 12 / 24, h: 12 },
    { d: 16 / 24, h: 16 },
    { d: 1, h: 24 },
    { d: 2, ds: 2 },
    { d: 3, ds: 3 },
    { d: 4, ds: 4 },
    { d: 5, ds: 5 },
    { d: 6, ds: 6 },
    { d: 7, ds: 7 },
    { d: 8, ds: 8 },
  ];
  const speedWrap = document.createElement("div");
  speedWrap.className = "hud-speed";
  const speedLabel = document.createElement("span");
  speedLabel.textContent = t("hud.speed");
  const speed = document.createElement("input");
  speed.type = "range";
  speed.min = "0";
  speed.max = String(SPEED_STEPS.length - 1);
  speed.step = "1";
  speed.value = "2"; // padrão pedido: 4 h/s
  const speedVal = document.createElement("span");
  speedVal.className = "hud-speed-val";
  const updateSpeed = () => {
    const step = SPEED_STEPS[Number(speed.value)];
    speedVal.textContent = step.h ? t("hud.hoursPerSec", { n: step.h }) : t("hud.daysPerSec", { n: step.ds });
    onSpeedChange(step.d);
  };
  speed.addEventListener("input", updateSpeed);
  speedWrap.append(speedLabel, speed, speedVal);

  // --- Data simulada -----------------------------------------------------
  const date = document.createElement("div");
  date.className = "hud-date";

  root.append(toggle, pano, speedWrap, date);
  document.body.appendChild(root);

  // dica de navegação por teclado (mostrada no modo real)
  const navHint = document.createElement("div");
  navHint.className = "nav-hint";
  navHint.innerHTML = t("hud.navHint");
  navHint.style.display = "none";
  document.body.appendChild(navHint);

  updateSpeed();

  return {
    setDate(d) {
      const locale = getLang() === "pt" ? "pt-BR" : "en-US";
      date.textContent = d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
    },
    // mantém o botão panorâmico em sincronia se desligado por outra ação
    setPanoramic(active) {
      panoActive = active;
      pano.classList.toggle("active", active);
    },
    // a visão panorâmica só faz sentido no modo Fantasia (no real tudo são
    // pontos a milhões de unidades) — some o botão quando não disponível
    setPanoramicAvailable(available) {
      pano.style.display = available ? "" : "none";
      if (!available) {
        panoActive = false;
        pano.classList.remove("active");
      }
    },
    setNavHint(visible) {
      navHint.style.display = visible ? "" : "none";
    },
    // esconde toda a HUD (modo/velocidade/data) enquanto a nave está pilotando
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
    },
  };
}
