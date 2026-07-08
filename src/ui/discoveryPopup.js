// Popup de DESCOBERTA — o card elegante que sobe quando algo novo é achado.
//
// Fila: descobertas simultâneas (ex.: Terra + rede de satélites no spawn)
// aparecem uma após a outra, nunca sobrepostas. Some sozinha (~4.5s).
//
// Miniatura de planeta: a MESMA bolinha em gradiente CSS do menu de
// miniaturas (menuColor) — nada de imagem baixada, custo zero. Itens sem cor
// (POIs/marcos) usam o emoji do catálogo.

const SHOW_SECS = 4.5;

function ballStyle(color) {
  return `background: radial-gradient(circle at 35% 30%, #fff6, ${color} 45%, #000a 130%)`;
}

export class DiscoveryPopup {
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "disc-pop";
    document.body.appendChild(this.el);
    this._queue = [];
    this._busy = false;
  }

  // item = { name, category, subtitle, color?|icon? }; atIso = data/hora real
  show(item, atIso) {
    this._queue.push({ item, atIso });
    if (!this._busy) this._next();
  }

  _next() {
    const entry = this._queue.shift();
    if (!entry) {
      this._busy = false;
      return;
    }
    this._busy = true;
    const { item, atIso } = entry;
    const when = new Date(atIso);
    const date = when.toLocaleDateString("pt-BR");
    const time = when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const thumb = item.color
      ? `<span class="disc-ball" style="${ballStyle(item.color)}"></span>`
      : `<span class="disc-icon">${item.icon || "✦"}</span>`;

    this.el.innerHTML = `
      ${thumb}
      <small>DESCOBERTA</small>
      <div class="disc-name">${item.name}</div>
      <div class="disc-sub">${item.subtitle || ""}</div>
      <div class="disc-date">${date} · ${time}</div>`;
    this.el.classList.add("on");

    setTimeout(() => {
      this.el.classList.remove("on");
      setTimeout(() => this._next(), 450); // espera o fade-out antes da próxima
    }, SHOW_SECS * 1000);
  }
}
