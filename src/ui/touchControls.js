// Controles touch do MODO JOGO (celular/tablet deitado).
//
// Só existe em aparelho de toque: a detecção exige ponteiro "coarse" + suporte
// a touch, então em janela de desktop (720p/1080p/maior) nada é criado — e o
// CSS ainda esconde a UI sob (pointer: fine) por garantia dupla.
//
// Estratégia de integração: os botões e o arrasto disparam EVENTOS DE TECLADO
// SINTÉTICOS (KeyW, Space, setas, Escape) na window — a ShipFlight, o canhão e
// o menu de pausa já escutam esses códigos, então nenhum sistema existente
// muda. Teclado e mouse continuam funcionando normalmente em paralelo.
//
//   arrasto no canvas  → setas (guinada/arfagem, com zona morta)
//   ▲ acelerar         → segura KeyW (também engaja a nave, como no teclado)
//   » turbo            → segura ShiftLeft + KeyW (supercruise)
//   ◎ atirar           → segura Space
//   ❚❚ pausa           → Escape

import { t } from "../core/i18n.js";

const DEADZONE = 22; // px de arrasto antes de começar a virar

function key(type, code) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

export function createTouchControls() {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!coarse || !touch) return null; // desktop: não cria nada

  const root = document.createElement("div");
  root.className = "touch-ui";
  root.innerHTML = `
    <button class="touch-btn touch-pause" data-keys="Escape" aria-label="${t("touch.pause")}">❚❚</button>
    <div class="touch-cluster">
      <button class="touch-btn touch-boost" data-keys="ShiftLeft KeyW" aria-label="${t("touch.boost")}">»</button>
      <button class="touch-btn touch-accel" data-keys="KeyW" aria-label="${t("touch.accel")}">▲</button>
      <button class="touch-btn touch-fire" data-keys="Space" aria-label="${t("touch.fire")}">◎</button>
    </div>
    <div class="touch-rotate-hint">${t("touch.rotateHint")} 📱↻</div>
  `;
  document.body.appendChild(root);

  // --- Botões: segurar = tecla pressionada; soltar/cancelar = solta ----------
  for (const btn of root.querySelectorAll(".touch-btn")) {
    const codes = btn.dataset.keys.split(" ");
    const press = (e) => {
      e.preventDefault();
      btn.classList.add("held");
      for (const c of codes) key("keydown", c);
    };
    const release = () => {
      btn.classList.remove("held");
      for (const c of codes) key("keyup", c);
    };
    btn.addEventListener("touchstart", press, { passive: false });
    btn.addEventListener("touchend", release);
    btn.addEventListener("touchcancel", release);
  }
  // Pausa é um toque, não um "segurar": solta o Escape logo após (o handler do
  // jogo age no keydown; manter o code preso no Set de teclas não faz sentido)
  const pauseBtn = root.querySelector(".touch-pause");
  pauseBtn.addEventListener("touchstart", () => setTimeout(() => key("keyup", "Escape"), 50));

  // --- Arrasto no canvas = virar a nave (setas com zona morta) ---------------
  // Escutamos só o canvas: botões de missão/HUD ficam por cima no DOM e não
  // são afetados; toques neles nunca chegam aqui.
  const canvas = document.querySelector("canvas");
  const held = new Set(); // setas atualmente "pressionadas" pelo arrasto
  let steerId = null; // identifier do dedo que está guiando
  let ox = 0, oy = 0;

  const setHeld = (want) => {
    for (const c of held) if (!want.has(c)) { key("keyup", c); held.delete(c); }
    for (const c of want) if (!held.has(c)) { key("keydown", c); held.add(c); }
  };
  const releaseAll = () => setHeld(new Set());

  if (canvas) {
    canvas.style.touchAction = "none"; // sem scroll/zoom do navegador na cena
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (steerId !== null) return;
        const t = e.changedTouches[0];
        steerId = t.identifier;
        ox = t.clientX;
        oy = t.clientY;
      },
      { passive: true }
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== steerId) continue;
          e.preventDefault();
          const dx = t.clientX - ox;
          const dy = t.clientY - oy;
          const want = new Set();
          if (dx > DEADZONE) want.add("ArrowRight"); // arrasta p/ direita = guina à direita
          else if (dx < -DEADZONE) want.add("ArrowLeft");
          if (dy < -DEADZONE) want.add("ArrowUp"); // arrasta p/ cima = nariz sobe
          else if (dy > DEADZONE) want.add("ArrowDown");
          setHeld(want);
        }
      },
      { passive: false }
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== steerId) continue;
        steerId = null;
        releaseAll();
      }
    };
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);
  }
  window.addEventListener("blur", releaseAll);

  return {
    dispose() {
      releaseAll();
      root.remove();
    },
  };
}
