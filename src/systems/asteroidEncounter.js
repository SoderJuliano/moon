// AsteroidEncounter — encontros ocasionais durante exploração normal.
//
// Enquanto o jogador voa em velocidade normal (sem supercruise), a cada 8-15 s
// há chance de aparecerem 1-2 asteroides à frente. Eles entram no campo de visão
// naturalmente (aparecem na borda do streamRadius) e somem quando ficam pra trás.
//
// Regras de segurança: nunca dentro/perto da superfície de qualquer corpo;
// nunca em cima da nave; sempre a uma distância confortável à frente.
// Perto de uma REGIÃO fixa (cinturão, troianos, Kuiper...) os encontros pausam:
// lá o espaço já tem pedras, e o contraste vazio↔cinturão é parte da experiência.

import * as THREE from "three";
import { AsteroidField } from "./asteroidField.js";

const MIN_SHIP_DIST = 22;     // distância mínima entre o grupo e a nave
const SURFACE_BUFFER = 6;     // folga até a superfície de qualquer corpo
const MAX_FIELDS = 6;         // cap de campos vivos (recicla mais antigos)
const SPAWN_DIST_MIN = 40;    // à frente da nave — aparece na borda do stream (60)
const SPAWN_DIST_MAX = 55;
const INTERVAL_MIN = 8;
const INTERVAL_MAX = 15;
const REGION_MARGIN = 80;     // distância a uma região fixa que suspende encontros
const MODELS = ["rocksSmall", "rocksField", "rockSingle", "rockHi"];

export class AsteroidEncounter {
  constructor(system, { getBodies = null } = {}) {
    this.system = system;
    this.getBodies = getBodies;

    this._n = 0;
    this._fields = [];
    this._timer = 0;
    this._nextInterval = this._rand(INTERVAL_MIN, INTERVAL_MAX);

    this._tmp = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._bp = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // ctx: { active, position, forward, speed }
  // active = voo normal (não supercruise, não explodindo)
  update(dt, ctx) {
    if (!ctx.active) {
      this._timer = 0;
      return;
    }
    this._timer += dt;
    if (this._timer >= this._nextInterval) {
      this._timer = 0;
      this._nextInterval = this._rand(INTERVAL_MIN, INTERVAL_MAX);
      this._trySpawn(ctx);
    }
  }

  _trySpawn(ctx) {
    if (this._nearRegion(ctx.position)) return;
    const dist = this._rand(SPAWN_DIST_MIN, SPAWN_DIST_MAX);

    // vetor lateral perpendicular ao forward no plano horizontal
    this._side.crossVectors(ctx.forward, this._up);
    if (this._side.lengthSq() < 1e-6) this._side.set(1, 0, 0);
    this._side.normalize();

    this._tmp
      .copy(ctx.position)
      .addScaledVector(ctx.forward, dist)
      .addScaledVector(this._side, (Math.random() * 2 - 1) * 5)
      .addScaledVector(this._up, (Math.random() * 2 - 1) * 3);

    if (!this._isSafe(this._tmp, ctx.position)) return;

    const count = Math.random() < 0.35 ? 2 : 1;
    const field = new AsteroidField({
      id: `enc:${this._n++}`,
      kind: "cluster",
      center: [this._tmp.x, this._tmp.y, this._tmp.z],
      count,
      models: MODELS,
      scaleRange: [0.03, 0.28],
      spinRange: [0.04, 0.5],
      drift: 0.0015,
      spread: 3,
      seed: (Math.random() * 1e9) | 0,
    });
    this.system.addField(field);
    this._fields.push(field);
    if (this._fields.length > MAX_FIELDS) {
      this.system.removeField(this._fields.shift().id);
    }
  }

  // nave dentro/perto de um campo fixo ou cinturão (não-encontro)? Região já povoada.
  _nearRegion(shipPos) {
    for (const field of this.system.fields) {
      if (field.id.startsWith("enc:")) continue;
      const center = field.getCenter(this.system.getBody, this._tmp);
      if (shipPos.distanceTo(center) < field.boundingRadius + REGION_MARGIN) return true;
    }
    for (const belt of this.system.belts) {
      const center = belt.getCenter(this.system.getBody, this._tmp);
      if (shipPos.distanceTo(center) < belt.boundingRadius + REGION_MARGIN) return true;
    }
    return false;
  }

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

  _rand(a, b) {
    return a + Math.random() * (b - a);
  }
}
