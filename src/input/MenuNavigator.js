// MenuNavigator — navegação de menus com gamepad (D-pad/analógico + A/B/Start).
//
// Recebe frames do GamepadInput SOMENTE quando algum menu está aberto
// (active()). Enquanto isso, o GamepadInput suspende as teclas sintéticas de
// voo — apertar A num menu clica o item focado, não acelera a nave.
//
// A navegação é ESPACIAL sobre o DOM real: cada contexto declara o container e
// o que é focável dentro dele; o item focado ganha a classe .gp-focus e o A
// dispara .click(). Os menus não mudam nada — os handlers de clique que já
// existem continuam sendo a única lógica. Pra uma UI nova entrar na navegação,
// basta acrescentar um contexto em CONTEXTS (ordem = prioridade: o primeiro
// contexto visível vence, então overlays que abrem por cima vêm antes).
//
// O anel de foco só aparece depois do primeiro toque no gamepad dentro do
// menu — quem usa mouse/teclado nunca vê nada.

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

// botões "voltar/cancelar" das telas do menu principal (uma view visível por vez)
const MM_BACK =
  '[data-game="back"], [data-name="cancel"], [data-password="cancel"], [data-players="back"], [data-profile="back"]';

const CONTEXTS = [
  {
    // conquistas (abre por cima da pausa)
    root: ".ach-overlay",
    items: (root) => [...root.querySelectorAll("button")],
    cancel: (root) => root.querySelector('[data-act="close"]'),
  },
  {
    // hangar / painel da nave
    root: ".ship-menu-overlay",
    items: (root) => [...root.querySelectorAll(".ship-slot-card, button")],
    cancel: (root) => root.querySelector(".close-btn"),
  },
  {
    // pausa do game e overlay Esc da exploração (mesma classe)
    root: ".modal-overlay",
    items: (root) => [...root.querySelectorAll(".modal-btn, .setting-row, input[type='checkbox'], button")],
    cancel: (root) => root.querySelector('[data-act="resume"]') || root.querySelector(".modal-btn"),
  },
  {
    // menu principal (galáxia): painel fechado = só o marcador do Sistema Solar
    root: ".mm-root",
    items: (root) => {
      const panel = root.querySelector(".mm-panel.open");
      if (panel) return [...panel.querySelectorAll(".mm-option, .mm-save-btn")];
      const marker = root.querySelector(".mm-marker");
      return marker ? [marker] : [];
    },
    cancel: (root) => root.querySelector(MM_BACK),
  },
];

const REPEAT_DELAY = 340; // ms segurando a direção até começar a repetir
const REPEAT_EVERY = 150; // ms entre repetições

export class MenuNavigator {
  constructor() {
    this.focusEl = null;
    this._root = null; // container do contexto atual (troca reseta o foco)
    this._dir = null;
    this._nextMove = 0;
  }

  active() {
    return !!this._findContext();
  }

  // Chamado por frame pelo GamepadInput enquanto um menu está aberto.
  // f: { up, down, left, right (segurados), confirm, cancel (bordas) }
  frame(f) {
    const ctx = this._findContext();
    if (!ctx) {
      this._clearFocus();
      this._root = null;
      return;
    }
    if (ctx.root !== this._root) {
      this._root = ctx.root;
      this._clearFocus();
    }
    const items = ctx.desc.items(ctx.root).filter(isVisible);
    if (!items.length) {
      this._clearFocus();
      return;
    }

    const dirHeld = f.up ? "up" : f.down ? "down" : f.left ? "left" : f.right ? "right" : null;
    const move = this._repeatGate(dirHeld);

    // itens re-renderizados (ex.: cards do hangar) invalidam o foco antigo
    if (this.focusEl && !items.includes(this.focusEl)) this._clearFocus();

    if (!this.focusEl) {
      // 1º toque só posiciona o anel — não clica nem anda às cegas
      if (move || f.confirm) this._setFocus(items[0]);
      if (f.cancel) this._cancel(ctx);
      return;
    }

    if (move) this._move(items, move);
    if (f.confirm) this.focusEl.click();
    if (f.cancel) this._cancel(ctx);
  }

  _findContext() {
    for (const desc of CONTEXTS) {
      const root = document.querySelector(desc.root);
      if (root && isVisible(root)) return { desc, root };
    }
    return null;
  }

  // segurar a direção repete o movimento (delay inicial + cadência), como console
  _repeatGate(dir) {
    if (!dir) {
      this._dir = null;
      return null;
    }
    const now = performance.now();
    if (dir !== this._dir) {
      this._dir = dir;
      this._nextMove = now + REPEAT_DELAY;
      return dir;
    }
    if (now >= this._nextMove) {
      this._nextMove = now + REPEAT_EVERY;
      return dir;
    }
    return null;
  }

  // navegação espacial: melhor candidato na direção pedida (distância no eixo
  // principal + penalidade forte pro desvio lateral)
  _move(items, dir) {
    const r = this.focusEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === this.focusEl) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      let main, cross;
      if (dir === "up") (main = -dy), (cross = Math.abs(dx));
      else if (dir === "down") (main = dy), (cross = Math.abs(dx));
      else if (dir === "left") (main = -dx), (cross = Math.abs(dy));
      else (main = dx), (cross = Math.abs(dy));
      if (main <= 4) continue; // só quem está de fato naquela direção
      const score = main + cross * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this._setFocus(best);
  }

  _cancel(ctx) {
    const btn = ctx.desc.cancel?.(ctx.root);
    if (btn && isVisible(btn)) btn.click();
  }

  _setFocus(el) {
    if (this.focusEl === el) return;
    this.focusEl?.classList.remove("gp-focus");
    this.focusEl = el;
    if (el) {
      el.classList.add("gp-focus");
      el.scrollIntoView?.({ block: "nearest" });
    }
  }

  _clearFocus() {
    if (!this.focusEl) return;
    this.focusEl.classList.remove("gp-focus");
    this.focusEl = null;
  }
}
