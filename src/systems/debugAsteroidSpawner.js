// DEBUG SPAWN MODE (temporário) — facilita encontrar asteroides durante os testes.
//
// ISOLADO do AsteroidSystem: não altera sua lógica. Apenas cria AsteroidFields
// ABSOLUTOS perto da nave (via a API pública addField/removeField) para exercitar
// carregamento de modelos, streaming, pooling, colisão, escala, iluminação e
// desempenho. Para DESATIVAR: basta não instanciar este módulo no main.js (ou
// passar { enabled:false }) — nada mais no projeto depende dele.
//
// Eventos:
//  • ao SAIR do supercruise (desacelerar p/ voo normal): grupo de 1–3 à frente;
//  • no voo normal, a cada 20–40 s: grupo de 1–3 ao lado (fora da trajetória);
//  • tecla G: força um grupo à frente AGORA (sob demanda).
//
// Regras de segurança: nunca durante o supercruise; nunca dentro/perto da
// superfície de um planeta; nunca colidindo com a nave; distância mínima segura.

import * as THREE from "three";
import { AsteroidField } from "./asteroidField.js";

const MIN_SHIP_DIST = 12; // distância mínima do centro do grupo até a nave
const SURFACE_BUFFER = 8; // folga mínima até a superfície de qualquer corpo
const MAX_FIELDS = 12; // teto de campos de debug vivos (recicla os mais antigos)
const MODELS = ["rocksField", "rocksSmall", "rockSingle", "rockHi"]; // clusters 1º (mais "campo")

export class DebugAsteroidSpawner {
  constructor(system, { getBodies = null, enabled = true } = {}) {
    this.system = system;
    this.getBodies = getBodies;
    this.enabled = enabled;

    this._n = 0;
    this._fields = [];
    this._wasSupercruising = false;
    this._timer = 0;
    this._nextInterval = this._rand(20, 40);
    this._last = null; // último estado (p/ a tecla G)

    this._c = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._bp = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this._badge = document.createElement("div");
    Object.assign(this._badge.style, {
      position: "fixed", left: "12px", bottom: "12px", zIndex: "21",
      padding: "3px 9px", borderRadius: "6px", font: "11px system-ui, sans-serif",
      background: "rgba(40,10,10,0.55)", color: "#ffb4a8", letterSpacing: "0.3px",
      border: "1px solid rgba(255,120,100,0.3)", pointerEvents: "none",
      backdropFilter: "blur(4px)", display: "none",
    });
    this._badge.textContent = "🛰 DEBUG ASTEROIDS · G = spawn";
    document.body.appendChild(this._badge);

    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyG") return;
      if (e.target && e.target.tagName === "INPUT") return;
      this._forceSpawn();
    });
  }

  // ctx: { active, supercruising, position, forward, speed }
  update(dt, ctx) {
    this._last = ctx;
    const visible = this.enabled && ctx.active && !ctx.supercruising;
    this._badge.style.display = visible ? "" : "none";
    if (!this.enabled) return;

    // borda: acabou de sair do supercruise → grupo à frente
    if (this._wasSupercruising && !ctx.supercruising && ctx.active) {
      this._spawnAhead(ctx, this._randInt(1, 3));
    }
    this._wasSupercruising = ctx.supercruising;

    if (!ctx.active || ctx.supercruising) {
      this._timer = 0;
      return;
    }

    this._timer += dt;
    if (this._timer >= this._nextInterval) {
      this._timer = 0;
      this._nextInterval = this._rand(20, 40);
      this._spawnNear(ctx, this._randInt(1, 3)); // grupo lateral, fora da rota
    }
  }

  _forceSpawn() {
    const ctx = this._last;
    if (!this.enabled || !ctx || !ctx.active || ctx.supercruising) return;
    this._spawnAhead(ctx, this._randInt(2, 3));
  }

  // grupo À FRENTE: a alguns segundos no rumo atual (dentro do streamRadius p/
  // aparecer logo); leve jitter lateral p/ não vir exatamente no eixo.
  _spawnAhead(ctx, count) {
    const ahead = THREE.MathUtils.clamp((ctx.speed || 0) * 4 + 14, 16, 32);
    this._sideOf(ctx.forward, this._side);
    this._c
      .copy(ctx.position)
      .addScaledVector(ctx.forward, ahead)
      .addScaledVector(this._side, (Math.random() * 2 - 1) * 3);
    if (!this._tryCreate(this._c, ctx.position, count)) {
      // fallback: um pouco mais longe, ainda à frente
      this._c.copy(ctx.position).addScaledVector(ctx.forward, ahead + 8);
      this._tryCreate(this._c, ctx.position, count);
    }
  }

  // grupo AO LADO: fora da trajetória imediata (componente lateral domina).
  _spawnNear(ctx, count) {
    this._sideOf(ctx.forward, this._side);
    const sign = Math.random() < 0.5 ? 1 : -1;
    const lat = 14 + Math.random() * 8;
    this._c
      .copy(ctx.position)
      .addScaledVector(ctx.forward, 4 + Math.random() * 6)
      .addScaledVector(this._side, sign * lat)
      .addScaledVector(this._up, (Math.random() * 2 - 1) * 6);
    this._tryCreate(this._c, ctx.position, count);
  }

  // valida segurança e cria o campo (absoluto). Retorna true se criou.
  _tryCreate(center, shipPos, count) {
    if (!this._isSafe(center, shipPos)) return false;

    const field = new AsteroidField({
      id: `debug:${this._n++}`,
      kind: "cluster",
      center: [center.x, center.y, center.z],
      count,
      models: MODELS,
      scaleRange: [0.06, 0.45],
      spinRange: [0.05, 0.5],
      drift: 0.003,
      spread: 3,
      seed: (Math.random() * 1e9) | 0,
    });
    this.system.addField(field);
    this._fields.push(field);
    if (this._fields.length > MAX_FIELDS) this.system.removeField(this._fields.shift().id);

    console.log(`[debug-asteroids] spawn x${count} @ ${center.toArray().map((n) => n.toFixed(0)).join(",")}`);
    return true;
  }

  // longe o bastante da nave e fora da superfície de qualquer corpo
  _isSafe(center, shipPos) {
    if (center.distanceTo(shipPos) < MIN_SHIP_DIST) return false;
    if (this.getBodies) {
      for (const b of this.getBodies()) {
        if (b.mesh && !b.mesh.visible) continue;
        b.worldPosition(this._bp);
        if (center.distanceTo(this._bp) - b.radius < SURFACE_BUFFER) return false;
      }
    }
    return true;
  }

  // vetor lateral (perpendicular ao forward, no plano horizontal do mundo)
  _sideOf(forward, out) {
    out.crossVectors(forward, this._up);
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0); // forward ~ vertical: usa X
    return out.normalize();
  }

  _rand(a, b) {
    return a + Math.random() * (b - a);
  }
  _randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }
}
