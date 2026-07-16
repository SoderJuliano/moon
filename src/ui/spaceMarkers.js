// Sistema de marcadores espaciais (lógica pura, SEM DOM).
//
// Mantém uma lista de "alvos" navegáveis e, a cada frame, projeta cada um para
// coordenadas de tela, decidindo se está visível ou fora do quadro e quão
// relevante é. A HUD (NavigationHud) consome esse resultado e desenha.
//
// Um ALVO é qualquer objeto com a forma:
//   { id, name, color, kind, getWorldPosition(vec3) }
// Hoje os alvos são corpos celestes, mas a mesma interface serve para estações,
// naves, waypoints, objetivos de missão e marcadores personalizados no futuro.

import * as THREE from "three";
import { t, getLang } from "../core/i18n.js";

const KM_PER_UNIT = 6371; // 1 unidade = 1 raio terrestre (modo real)
const C_KM_S = 299792.458;

// distância legível: km quando perto, minutos/horas-luz quando longe
export function formatDistance(units) {
  const km = units * KM_PER_UNIT;
  const lang = getLang();
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  if (km < 1e6) return `${Math.round(km).toLocaleString(locale)} km`;
  const lightMin = km / (C_KM_S * 60);
  if (lightMin < 60) return t("space.lightMin", { n: lightMin.toFixed(1) });
  return t("space.lightHours", { n: (lightMin / 60).toFixed(1) });
}

// peso de relevância por tipo de alvo (waypoint/objetivo vence corpos naturais;
// Sol e planetas são bons landmarks mesmo distantes; luas/anões valem menos)
const KIND_PRIORITY = {
  waypoint: 5, objective: 5, station: 4, ship: 4,
  star: 4, sun: 4, planet: 3, dwarf: 2, moon: 1, custom: 3,
};

export class SpaceMarkerSystem {
  constructor() {
    this.targets = [];
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._inv = new THREE.Quaternion();
  }

  setTargets(list) {
    this.targets = list.slice();
  }
  add(target) {
    this.targets.push(target);
  }
  remove(id) {
    this.targets = this.targets.filter((t) => t.id !== id);
  }

  // Projeta todos os alvos e devolve { onScreen[], offScreen[] } já podados ao
  // mais relevante (evita poluir a tela). Não toca no DOM.
  //   onScreen:  { target, dist, nx, ny }            — nx,ny em NDC [-1..1]
  //   offScreen: { target, dist, ex, ey, score }     — ex,ey direção na borda
  compute(camera, viewerPos, { maxOnScreen = 12, maxOffScreen = 6 } = {}) {
    // garante matrizes da câmera coerentes mesmo sendo chamado antes do render
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this._inv.copy(camera.quaternion).invert();

    const onScreen = [];
    const offScreen = [];

    for (const t of this.targets) {
      t.getWorldPosition(this._v);
      const dist = viewerPos.distanceTo(this._v);

      // espaço da câmera: z<0 = à frente (three olha por -Z)
      this._p.copy(this._v).sub(camera.position).applyQuaternion(this._inv);
      const inFront = this._p.z < 0;

      // NDC via projeção
      this._p.copy(this._v).project(camera);
      let nx = this._p.x;
      let ny = this._p.y;
      const visible = inFront && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
      const prio = KIND_PRIORITY[t.kind] ?? 3;

      if (visible) {
        onScreen.push({ target: t, dist, nx, ny });
      } else {
        // fora do quadro: se está atrás, espelha p/ a seta apontar certo, e
        // normaliza ao quadrado unitário (direção da borda)
        if (!inFront) {
          nx = -nx;
          ny = -ny;
        }
        const m = Math.max(Math.abs(nx), Math.abs(ny)) || 1;
        // relevância: prioridade do tipo domina; mais perto desempata
        const score = prio * 10 - Math.log10(Math.max(dist, 1));
        offScreen.push({ target: t, dist, ex: nx / m, ey: ny / m, score });
      }
    }

    // on-screen: prioriza os mais próximos; off-screen: os mais relevantes
    onScreen.sort((a, b) => a.dist - b.dist);
    offScreen.sort((a, b) => b.score - a.score);

    return {
      onScreen: onScreen.slice(0, maxOnScreen),
      offScreen: offScreen.slice(0, maxOffScreen),
    };
  }
}
