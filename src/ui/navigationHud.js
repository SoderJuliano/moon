// HUD de navegação espacial (só DOM/layout — a lógica vive no SpaceMarkerSystem).
//
// Desenha um marcador por alvo relevante:
//  • alvo VISÍVEL  → ponto + nome + distância sobre ele na tela;
//  • alvo FORA do quadro → marcador presO na borda, com seta apontando a direção.
// O alvo mais alinhado ao centro (pra onde você olha) ganha destaque "primary".
//
// Reaproveita os elementos (pool por id) e atualiza o texto de distância a ~5 Hz
// para não martelar o DOM. A posição é atualizada todo frame (barato).

import { formatDistance } from "./spaceMarkers.js";

const STYLE_ID = "nav-hud-style";
const CSS = `
.nav-hud { position: fixed; inset: 0; z-index: 20; pointer-events: none; }
.nav-marker {
  position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 5px;
  font: 11px system-ui, sans-serif; color: #cdd6e6; white-space: nowrap;
  opacity: 0.82; transition: opacity .25s ease; will-change: transform;
}
.nav-marker .dot {
  width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto;
  box-shadow: 0 0 6px currentColor;
}
.nav-marker .name { letter-spacing: .3px; text-shadow: 0 1px 2px rgba(0,0,0,.7); }
.nav-marker .dist { opacity: .55; font-size: 10px; text-shadow: 0 1px 2px rgba(0,0,0,.7); }
.nav-marker .arrow { color: currentColor; font-size: 12px; line-height: 1; display: none; }
.nav-marker.edge {
  gap: 4px; padding: 2px 8px; border-radius: 999px;
  background: rgba(10,16,28,0.42); border: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(5px); opacity: 0.7;
}
.nav-marker.edge .arrow { display: inline-block; }
.nav-marker.primary { opacity: 1; }
.nav-marker.primary .name { font-weight: 600; color: #eaf1ff; }
`;

export class NavigationHud {
  // viewer: objeto cujo .position mede a distância (default: a própria câmera).
  constructor(camera, markerSystem, { viewer = null, margin = 36 } = {}) {
    this.camera = camera;
    this.system = markerSystem;
    this.viewer = viewer || camera;
    this.margin = margin;
    this.visible = false;
    this._pool = new Map(); // id -> { el, dot, name, dist, arrow, shown }
    this._textTimer = 0;

    this._injectStyle();
    this.root = document.createElement("div");
    this.root.className = "nav-hud";
    this.root.style.display = "none";
    document.body.appendChild(this.root);
  }

  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  setVisible(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.root.style.display = on ? "" : "none";
    if (!on) {
      // some com todos ao esconder (próxima abertura recoloca o que for relevante)
      for (const rec of this._pool.values()) {
        rec.el.style.display = "none";
        rec.shown = false;
      }
    }
  }

  update(dt = 0) {
    if (!this.visible) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const { onScreen, offScreen } = this.system.compute(this.camera, this.viewer.position, {
      maxOnScreen: 12,
      maxOffScreen: 6,
    });

    this._textTimer -= dt;
    const refreshText = this._textTimer <= 0;
    if (refreshText) this._textTimer = 0.2;

    const seen = new Set();

    // alvo mais central = pra onde você olha (destaque)
    let primaryId = null;
    let bestC = Infinity;
    for (const m of onScreen) {
      const c = m.nx * m.nx + m.ny * m.ny;
      if (c < bestC) {
        bestC = c;
        primaryId = m.target.id;
      }
    }

    // visíveis: ponto sobre o corpo
    for (const m of onScreen) {
      const x = (m.nx * 0.5 + 0.5) * W;
      const y = (0.5 - m.ny * 0.5) * H;
      this._place(m.target, x, y, { edge: false, dist: m.dist, refreshText, primary: m.target.id === primaryId });
      seen.add(m.target.id);
    }

    // fora do quadro: preso na borda, seta apontando a direção
    const hx = W / 2 - this.margin;
    const hy = H / 2 - this.margin;
    for (const m of offScreen) {
      const x = W / 2 + m.ex * hx;
      const y = H / 2 - m.ey * hy;
      const deg = (Math.atan2(-m.ey, m.ex) * 180) / Math.PI; // ➤ aponta p/ +x por padrão
      this._place(m.target, x, y, { edge: true, deg, dist: m.dist, refreshText });
      seen.add(m.target.id);
    }

    // esconde quem não entrou nesta rodada
    for (const [id, rec] of this._pool) {
      if (!seen.has(id) && rec.shown) {
        rec.el.style.display = "none";
        rec.shown = false;
      }
    }
  }

  _place(target, x, y, { edge, deg = 0, dist, refreshText, primary = false }) {
    let rec = this._pool.get(target.id);
    if (!rec) rec = this._create(target);

    if (!rec.shown) {
      rec.el.style.display = "";
      rec.shown = true;
    }
    rec.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    if (refreshText) rec.dist.textContent = formatDistance(dist);

    rec.el.classList.toggle("edge", edge);
    rec.el.classList.toggle("primary", primary);
    if (edge) rec.arrow.style.transform = `rotate(${deg}deg)`;
  }

  _create(target) {
    const el = document.createElement("div");
    el.className = "nav-marker";
    el.style.color = target.color || "#cdd6e6";

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "➤";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = target.color || "#cdd6e6";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = target.name;

    const dist = document.createElement("span");
    dist.className = "dist";

    el.append(arrow, dot, name, dist);
    this.root.appendChild(el);

    const rec = { el, dot, name, dist, arrow, shown: true };
    this._pool.set(target.id, rec);
    return rec;
  }
}
