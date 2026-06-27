// HUD discreta no canto: toggle Fantasia/Real, botão de visão panorâmica,
// controle de velocidade do tempo e a data simulada.

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
        ? '<span class="dot"></span> Escala: <b>Aproximada</b>'
        : '<span class="dot real"></span> Escala: <b>Real</b>';
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
  pano.innerHTML = "⤢ Visão panorâmica";
  let panoActive = false;
  pano.addEventListener("click", () => {
    panoActive = !panoActive;
    pano.classList.toggle("active", panoActive);
    onPanoramic(panoActive);
  });

  // --- Velocidade do tempo (passos discretos: 4h ... 8 dias por segundo) --
  const SPEED_STEPS = [
    { d: 1 / 24, label: "1 h/s" },
    { d: 2 / 24, label: "2 h/s" },
    { d: 4 / 24, label: "4 h/s" },
    { d: 8 / 24, label: "8 h/s" },
    { d: 12 / 24, label: "12 h/s" },
    { d: 16 / 24, label: "16 h/s" },
    { d: 1, label: "24 h/s" },
    { d: 2, label: "2 d/s" },
    { d: 3, label: "3 d/s" },
    { d: 4, label: "4 d/s" },
    { d: 5, label: "5 d/s" },
    { d: 6, label: "6 d/s" },
    { d: 7, label: "7 d/s" },
    { d: 8, label: "8 d/s" },
  ];
  const speedWrap = document.createElement("div");
  speedWrap.className = "hud-speed";
  const speedLabel = document.createElement("span");
  speedLabel.textContent = "Velocidade";
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
    speedVal.textContent = step.label;
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
  navHint.innerHTML =
    "<b>W</b> acelera &nbsp;·&nbsp; <b>S</b> ré &nbsp;·&nbsp; <b>A/D</b> vira &nbsp;·&nbsp; <b>Shift/Ctrl</b> (ou ↑↓) sobe/desce &nbsp;·&nbsp; <b>Esc</b> sai da nave";
  navHint.style.display = "none";
  document.body.appendChild(navHint);

  updateSpeed();

  return {
    setDate(d) {
      date.textContent = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
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
