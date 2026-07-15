// SCANNER DE OBJETOS ESPACIAIS — item equipável (recompensa do "Reboque
// espacial"). É uma ferramenta CENTRAL de exploração: ligado com G (ou botão do
// meio do mouse), ele
//   1. PULSA — clarão na tela + ping de sonar (funciona de qualquer lugar);
//   2. abre um GPS com os CINTURÕES de asteroides mais próximos (setas/distância);
//   3. GRUDA rótulos de composição em cima das rochas ao redor — visíveis de
//      longe e o tempo todo enquanto ligado.
//
// A composição é DETERMINÍSTICA pelo id (ver materials.js): o mesmo asteroide
// sempre lê o mesmo material, e a COR da pedra combina com o que o scanner diz.

import * as THREE from "three";
import { composition, describe, MATERIAL_INFO } from "./materials.js";
import { playScanPulse } from "../ui/sfx.js";
import { t } from "../core/i18n.js";

// re-exportado p/ as missões que casam o material pedido (rockDelivery.js)
export { composition, MATERIALS } from "./materials.js";

const IMG_W = 1536; // scannerDeObjetosEspaciais.png é 1536×1024
const CROP = { x: 852, y: 338, size: 224 }; // recorte da vista FRONTAL (lente azul)

const LABEL_RANGE = 320; // u — até onde as rochas ganham rótulo
const MAX_TAGS = 10; // rótulos simultâneos (as N pedras mais próximas)
const RESCAN_MS = 400; // reavalia as pedras vizinhas a cada ~0.4s (o resto segue por frame)
const EDGE = 26; // px — margem do GPS na borda da tela

export class ScannerSystem {
  // save.inventory.scanner = { owned, equipped }; getAsteroids() → AsteroidSystem;
  // getRegions() → [{ name, descriptor:{menuColor}, worldPosition(out) }]
  constructor(save, getAsteroids, getShip, camera, getRegions = () => []) {
    this.save = save;
    this.getAsteroids = getAsteroids;
    this.getShip = getShip;
    this.camera = camera;
    this.getRegions = getRegions;
    if (!save.inventory.scanner) save.inventory.scanner = { owned: false, equipped: false };
    this.active = false; // ligado no momento (transitório, não persiste)

    this._tmp = new THREE.Vector3();
    this._lastScan = 0;
    this._trackedIds = [];

    // clarão de pulso (tela toda) — animado via WAAPI, retrigável a cada G
    this.flash = document.createElement("div");
    this.flash.className = "scan-flash";
    document.body.appendChild(this.flash);

    // GPS dos cinturões (marcadores nas bordas) e rótulos das rochas ficam em
    // camadas próprias, criados sob demanda
    this.gps = document.createElement("div");
    this.gps.className = "scan-gps";
    this.gps.style.display = "none";
    document.body.appendChild(this.gps);
    this._gpsItems = new Map(); // regionId -> element

    this._tags = []; // pool de rótulos { el }
    this._tagWorld = new THREE.Vector3();

    // painel de recompensa (miniatura recortada → clica pra equipar)
    this.reward = document.createElement("div");
    this.reward.className = "scan-reward";
    this.reward.style.display = "none";
    document.body.appendChild(this.reward);
  }

  get owned() {
    return !!this.save.inventory.scanner?.owned;
  }
  get equipped() {
    return !!this.save.inventory.scanner?.equipped;
  }

  toggle() {
    if (!this.equipped) return;
    this.active = !this.active;
    this.pulse(); // clarão + som SEMPRE que aperta G (liga OU desliga)
    if (this.active) {
      this.gps.style.display = "";
      this._lastScan = 0; // força reavaliar as pedras já no próximo frame
    } else {
      this._hideAll();
    }
  }

  // PULSO: clarão na tela + ping de sonar. Funciona esteja perto de rocha ou não.
  pulse() {
    playScanPulse();
    this.flash.animate(
      [
        { opacity: 0, transform: "scale(1)" },
        { opacity: 0.55, transform: "scale(1)", offset: 0.12 },
        { opacity: 0, transform: "scale(1.06)" },
      ],
      { duration: 620, easing: "ease-out" }
    );
  }

  _hideAll() {
    this.gps.style.display = "none";
    for (const el of this._gpsItems.values()) el.style.display = "none";
    for (const t of this._tags) t.el.style.display = "none";
    this._trackedIds.length = 0;
  }

  // recompensa: mostra o painel; clicar equipa o scanner na nave
  grant() {
    this.save.inventory.scanner.owned = true;
    const view = 120;
    const k = view / CROP.size;
    this.reward.innerHTML = `
      <div class="scan-reward-box">
        <small>${t("scanner.reward")}</small>
        <b>${t("scanner.name")}</b>
        <button class="scan-thumb" title="${t("scanner.equipTitle")}"
          style="width:${view}px;height:${view}px;background-image:url(itens/scannerDeObjetosEspaciais.png);
          background-size:${Math.round(IMG_W * k)}px auto;
          background-position:-${Math.round(CROP.x * k)}px -${Math.round(CROP.y * k)}px"></button>
        <p>${t("scanner.rewardDesc")}</p>
      </div>`;
    this.reward.style.display = "";
    this.reward.querySelector(".scan-thumb").onclick = (e) => {
      e.currentTarget.blur();
      this.save.inventory.scanner.equipped = true;
      this.reward.style.display = "none";
    };
  }

  update() {
    if (!this.active || !this.equipped) {
      if (this._trackedIds.length || this.gps.style.display !== "none") this._hideAll();
      return;
    }
    const ship = this.getShip();
    if (!ship) return;

    // reavalia as pedras vizinhas de tempos em tempos (varrer os cinturões é
    // caro); entre reavaliações, só reposiciona os rótulos já fixados.
    const now = performance.now();
    if (now - this._lastScan > RESCAN_MS) {
      this._lastScan = now;
      const near = this.getAsteroids()?.rocksNear(ship.position, LABEL_RANGE, MAX_TAGS) || [];
      this._trackedIds = near.map((n) => n.id);
    }

    this._updateTags();
    this._updateGps(ship);
  }

  // projeta um ponto de mundo → { sx, sy, onScreen } (sx/sy em px de tela).
  // Trata o caso "atrás da câmera" invertendo o NDC.
  _project(world) {
    this._tmp.copy(world).project(this.camera);
    const behind = this._tmp.z > 1;
    let nx = this._tmp.x;
    let ny = this._tmp.y;
    if (behind) { nx = -nx; ny = -ny; }
    const onScreen = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    return { nx, ny, onScreen };
  }

  _updateTags() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ast = this.getAsteroids();
    for (let i = 0; i < MAX_TAGS; i++) {
      const id = this._trackedIds[i];
      let tag = this._tags[i];
      if (!id) { if (tag) tag.el.style.display = "none"; continue; }
      const world = ast?.rockWorld(id, this._tagWorld);
      if (!world) { if (tag) tag.el.style.display = "none"; continue; }
      const p = this._project(world);
      if (!p.onScreen) { if (tag) tag.el.style.display = "none"; continue; }
      if (!tag) tag = this._tags[i] = this._makeTag();

      const d = describe(id);
      const info = MATERIAL_INFO[d.material];
      tag.el.style.borderColor = this._hex(info.color, 0.7);
      tag.el.style.setProperty("--mat", this._hex(info.color, 1));
      const matTrans = t("material." + d.material) || d.material;
      const secTrans = t("material." + d.secondary) || d.secondary;
      tag.el.innerHTML =
        `<span class="scan-tag-mat"><i class="scan-tag-swatch"></i>${matTrans}</span>` +
        `<span class="scan-tag-sub">${d.concentration}% · ${t("scanner.traces")} ${secTrans}</span>`;
      tag.el.style.left = `${(p.nx * 0.5 + 0.5) * W}px`;
      tag.el.style.top = `${(-p.ny * 0.5 + 0.5) * H}px`;
      tag.el.style.display = "";
    }
  }

  _makeTag() {
    const el = document.createElement("div");
    el.className = "scan-tag";
    document.body.appendChild(el);
    return { el };
  }

  _updateGps(ship) {
    const regions = this.getRegions() || [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const seen = new Set();
    for (const r of regions) {
      seen.add(r.id);
      const center = r.worldPosition(new THREE.Vector3());
      const dist = ship.position.distanceTo(center);
      const p = this._project(center);

      let el = this._gpsItems.get(r.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "scan-gps-item";
        el.innerHTML = `<span class="scan-gps-arrow">▲</span>` +
          `<span class="scan-gps-name"></span><span class="scan-gps-dist"></span>`;
        this.gps.appendChild(el);
        this._gpsItems.set(r.id, el);
      }
      const color = r.descriptor?.menuColor || "#9fd0ff";
      el.style.color = color;
      el.querySelector(".scan-gps-name").textContent = r.name;
      el.querySelector(".scan-gps-dist").textContent = this._fmtDist(dist);

      // posição de tela: se on-screen usa a projeção; senão gruda na borda na
      // direção do alvo (marcador vira seta apontando pra fora).
      let sx = (p.nx * 0.5 + 0.5) * W;
      let sy = (-p.ny * 0.5 + 0.5) * H;
      const arrow = el.querySelector(".scan-gps-arrow");
      if (p.onScreen) {
        arrow.style.display = "none";
      } else {
        const dx = sx - W / 2;
        const dy = sy - H / 2;
        const ang = Math.atan2(dy, dx);
        sx = W / 2 + Math.cos(ang) * (W / 2 - EDGE);
        sy = H / 2 + Math.sin(ang) * (H / 2 - EDGE);
        arrow.style.display = "";
        arrow.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
      }
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.display = "";
    }
    for (const [id, el] of this._gpsItems) if (!seen.has(id)) el.style.display = "none";
  }

  _fmtDist(u) {
    return u >= 1000 ? `${(u / 1000).toFixed(1)}k u` : `${Math.round(u)} u`;
  }

  _hex(n, a = 1) {
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }
}
