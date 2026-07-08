// SCANNER DE OBJETOS ESPACIAIS — item equipável, recompensa do "Reboque
// espacial". Ligado (G ou botão do meio do mouse) e mirando um asteroide,
// mostra a COMPOSIÇÃO da rocha (material principal + pureza), tipando os
// objetos das nuvens de asteroides. Projetado pra crescer: no futuro lê
// planetas/estações também — por ora, só rochas.
//
// A composição é DETERMINÍSTICA pelo id do asteroide (o mesmo id sempre dá o
// mesmo material) — nada é sorteado a cada frame.

import * as THREE from "three";

// materiais possíveis (os da ficha do scanner + gelo e cobre pedidos)
export const MATERIALS = ["Gelo", "Ferro", "Cobre", "Níquel", "Silício", "Titânio", "Magnésio"];
const SCAN_RANGE = 12; // u — alcance do scanner
const IMG_W = 1536; // scannerDeObjetosEspaciais.png é 1536×1024
const CROP = { x: 852, y: 338, size: 224 }; // recorte da vista FRONTAL (lente azul)

function hashId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
// composição DETERMINÍSTICA de uma rocha pelo id (compartilhada com as missões
// de reboque tipadas) — o mesmo id sempre dá o mesmo material.
export function composition(id) {
  const h = hashId(id);
  return { material: MATERIALS[h % MATERIALS.length], purity: 60 + (h % 40) }; // 60–99%
}

export class ScannerSystem {
  // save.inventory.scanner = { owned, equipped }; getAsteroids() → AsteroidSystem
  constructor(save, getAsteroids, getShip, camera) {
    this.save = save;
    this.getAsteroids = getAsteroids;
    this.getShip = getShip;
    this.camera = camera;
    if (!save.inventory.scanner) save.inventory.scanner = { owned: false, equipped: false };
    this.active = false; // ligado no momento (transitório, não persiste)
    this._tmp = new THREE.Vector3();

    // rótulo projetado sobre a rocha em mira
    this.label = document.createElement("div");
    this.label.className = "scan-label";
    this.label.style.display = "none";
    document.body.appendChild(this.label);

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
    if (!this.active) this.label.style.display = "none";
  }

  // recompensa: mostra o painel; clicar equipa o scanner na nave
  grant() {
    this.save.inventory.scanner.owned = true;
    const view = 120;
    const k = view / CROP.size;
    this.reward.innerHTML = `
      <div class="scan-reward-box">
        <small>RECOMPENSA</small>
        <b>Scanner de Objetos Espaciais</b>
        <button class="scan-thumb" title="Equipar na nave"
          style="width:${view}px;height:${view}px;background-image:url(itens/scannerDeObjetosEspaciais.png);
          background-size:${Math.round(IMG_W * k)}px auto;
          background-position:-${Math.round(CROP.x * k)}px -${Math.round(CROP.y * k)}px"></button>
        <p>Clique no item para equipar. Ligue com <b>G</b> ou o <b>botão do meio</b> do mouse.</p>
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
      this.label.style.display = "none";
      return;
    }
    const ship = this.getShip();
    const near = this.getAsteroids()?.nearestActive(ship.position, SCAN_RANGE);
    if (!near) {
      this.label.style.display = "none";
      return;
    }
    this._tmp.copy(near.center).project(this.camera);
    if (this._tmp.z > 1 || Math.abs(this._tmp.x) > 1 || Math.abs(this._tmp.y) > 1) {
      this.label.style.display = "none";
      return;
    }
    const c = composition(near.id);
    this.label.innerHTML = `<span class="scan-mat">${c.material}</span><span class="scan-pur">Pureza ${c.purity}%</span>`;
    this.label.style.left = `${(this._tmp.x * 0.5 + 0.5) * window.innerWidth}px`;
    this.label.style.top = `${(-this._tmp.y * 0.5 + 0.5) * window.innerHeight}px`;
    this.label.style.display = "";
  }
}
