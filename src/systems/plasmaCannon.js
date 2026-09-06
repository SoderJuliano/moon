// PlasmaCannon — o canhão de plasma pequeno recuperado do cruzador destruído.
//
// Dois FEIXES de plasma azul (estilo caças de Star Wars) saem de baixo das asas
// ao segurar ESPAÇO — rajadas rápidas, como diz a ficha da tecnologia. Cada
// bolt viaja reto no espaço-mundo e testa colisão contra os asteroides ATIVOS
// reutilizando asteroids.hitTest(ponto) — nenhum sistema paralelo de física.
// Outros sistemas destrutíveis (ex.: satélites da Terra) plugam a MESMA
// interface hitTest/destroy via addTargetSystem; o hit pode trazer maxHp
// próprio (satélites caem com 2 tiros, independente do tamanho).
//
//  • DANO: asteroides ganham HP por tamanho na primeira vez que são atingidos —
//    pequenos (tamanho da nave) caem com 1 tiro, médios 2, grandes 3. Uma barra
//    de vida FININHA aparece projetada sobre a pedra atingida por alguns
//    segundos. Destruído não volta (o descritor some / instância vai a zero) —
//    só recarregando o jogo.
//  • IMPACTO: fumacinha (sprites cinza, blending normal) no ponto do hit;
//    destruição = nuvem maior + flash. Contra planetas nada acontece: o bolt
//    simplesmente se apaga ao entrar no raio do corpo.
//  • Começa DESABILITADO — a missão do sinal de socorro desbloqueia via
//    setEnabled(true) (a tecnologia precisa ser recuperada primeiro).

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";
import { emit } from "../game/events.js";

const SHIP_SIZE = 0.06; // mesmo valor da ShipFlight (offsets das asas em escala local)
const BOLT_SPEED = 25; // u/s somado à velocidade de avanço da nave
const BOLT_TTL = 2; // s de vida (alcance ~50u)
const BOLT_LEN = 0.09; // ~1,5× a nave — proporção dos feixes de Star Wars
const FIRE_EVERY = 0.32; // cadência da rajada (segurando Espaço) — 2x mais lenta (era 0.16)
const SUBSTEP = 0.12; // passo do teste de colisão ao longo do trajeto (u)
const HPBAR_TTL = 3; // s que a barra de vida fica visível após um hit

// bocas do canhão por tipo de nave, em coords locais da nave
export const SHIP_MUZZLES = {
  xr07: [
    new THREE.Vector3(-0.5, -0.08, 0.1).multiplyScalar(SHIP_SIZE),
    new THREE.Vector3(0.5, -0.08, 0.1).multiplyScalar(SHIP_SIZE),
  ],
  shuttle: [
    // 1 tiro central direto e concentrado (dano equivalente a 2 tiros)
    new THREE.Vector3(0, -0.02, -0.55).multiplyScalar(SHIP_SIZE),
  ],
  naveSW: [
    // 4 tiros simultâneos: 1 de cada asa nas 4 pontas simétricas do caça nivelado
    new THREE.Vector3(-0.50, 0.22, -0.26).multiplyScalar(SHIP_SIZE), // Asa Superior Esquerda
    new THREE.Vector3(0.50, 0.22, -0.26).multiplyScalar(SHIP_SIZE),  // Asa Superior Direita
    new THREE.Vector3(-0.50, -0.22, -0.26).multiplyScalar(SHIP_SIZE), // Asa Inferior Esquerda
    new THREE.Vector3(0.50, -0.22, -0.26).multiplyScalar(SHIP_SIZE),  // Asa Inferior Direita
  ],
};

const MUZZLES = SHIP_MUZZLES.xr07;

// HP por tamanho (r = raio de colisão): nave ~0.06u → pedras "do tamanho da
// nave" têm r pequeno e caem com 1; grandes aguentam 3.
function maxHpFor(r) {
  if (r < 0.3) return 1;
  if (r < 1.3) return 2;
  return 3;
}

export class PlasmaCannon {
  constructor(scene, ship, asteroids, camera, { getBodies = null } = {}) {
    this.scene = scene;
    this.ship = ship; // ShipFlight (posição/quaternion/velocidade da nave)
    this.asteroids = asteroids;
    this.camera = camera;
    this.getBodies = getBodies;
    this.enabled = false;

    this._fireHeld = false;
    this._cd = 0;
    this._hp = new Map(); // id do alvo -> hp restante (asteroides e sistemas extras)
    this.extraTargets = []; // sistemas plugados via addTargetSystem
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();

    // pool de bolts: capsulinha aditiva alongada no eixo Z (nariz da nave)
    const boltGeo = new THREE.CylinderGeometry(0.005, 0.005, BOLT_LEN, 6);
    boltGeo.rotateX(Math.PI / 2); // eixo do cilindro Y → Z (direção do voo)
    const boltMat = new THREE.MeshBasicMaterial({
      color: 0x7fd4ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.bolts = [];
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, vel: new THREE.Vector3(), ttl: 0, fresh: false });
    }

    // pool de fumacinhas de impacto (blending NORMAL: fumaça, não brilho)
    this.puffs = [];
    const smokeTex = radialGlowTexture("#9a9a9a");
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTex, color: 0x8b8b8b, transparent: true, opacity: 0, depthWrite: false,
        })
      );
      s.visible = false;
      scene.add(s);
      this.puffs.push({ sprite: s, life: 0, ttl: 1, grow: 1 });
    }
    // flash aditivo da destruição
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture("#bfe8ff"), color: 0x9fd8ff, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.flash.visible = false;
    this._flashLife = 0;
    scene.add(this.flash);

    // explosões de destruição: detritos de rocha voando (Points, como a
    // explosão da nave) — pool de 4 (mais de 4 pedras estourando ao mesmo
    // tempo é raro; se faltar, a mais antiga é reciclada)
    this.booms = [];
    for (let i = 0; i < 4; i++) {
      const N = 60;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const mat = new THREE.PointsMaterial({
        color: 0xb0a494, size: 0.05, transparent: true, opacity: 0, depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pts.frustumCulled = false;
      scene.add(pts);
      this.booms.push({
        pts, mat,
        vels: Array.from({ length: N }, () => new THREE.Vector3()),
        life: 0, ttl: 1.4,
      });
    }

    // barra de vida fininha sobre o último asteroide atingido
    this.hpBar = document.createElement("div");
    this.hpBar.className = "ast-hp";
    this.hpBar.innerHTML = '<div class="ast-hp-fill"></div>';
    this.hpBar.style.display = "none";
    document.body.appendChild(this.hpBar);
    this._hpFill = this.hpBar.querySelector(".ast-hp-fill");
    this._hpTarget = null; // { center, hp, maxHp, timer }

    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space" || (e.target && e.target.tagName === "INPUT")) return;
      if (this.enabled) e.preventDefault(); // sem scroll/clique fantasma na página
      this._fireHeld = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this._fireHeld = false;
    });
    window.addEventListener("blur", () => (this._fireHeld = false));
  }

  setEnabled(on) {
    this.enabled = on;
  }

  // pluga um sistema de alvos com a mesma interface dos asteroides:
  // hitTest(pos) -> { id, center, r, maxHp? } | null, e destroy(id)
  addTargetSystem(sys) {
    this.extraTargets.push(sys);
  }

  _fire() {
    // progressão: marco de primeiro disparo + contador (o bus deduplica/ignora)
    emit("milestone", { id: "first-shot" });
    emit("stat", { key: "shotsFired" });
    // som de canhão: em 1ª pessoa ou quando um encontro autoriza (batalha épica)
    if (this.ship?.cockpitView && this.ship?.isFirstPerson) {
      this.ship.cockpitView.playShootSfx(this.ship.activeShipId);
    } else if (this.sfxShot) {
      this.sfxShot();
    }
    const ship = this.ship.ship;
    this._tmp.set(0, 0, -1).applyQuaternion(ship.quaternion); // forward
    // bolt herda o avanço da nave (senão parece que anda pra trás no boost)
    const shipAdvance = Math.max(this.ship.velocity.dot(this._tmp), 0);
    const muzzles = this.ship.getMuzzles ? this.ship.getMuzzles() : (SHIP_MUZZLES[this.ship.activeShipId] || MUZZLES);
    const isShuttle = this.ship.activeShipId === "shuttle";
    const boltDmg = isShuttle ? 2 : 1;
    for (const muzzle of muzzles) {
      const b = this.bolts.find((x) => x.ttl <= 0);
      if (!b) continue;
      // a CAUDA do feixe nasce na boca (o cilindro é centrado: desloca meia
      // extensão pra frente) — o tiro visivelmente SAI de baixo da asa / ponta da asa
      b.mesh.position
        .copy(muzzle)
        .applyQuaternion(ship.quaternion)
        .add(ship.position)
        .addScaledVector(this._tmp, BOLT_LEN / 2);
      b.mesh.quaternion.copy(ship.quaternion);
      b.vel.copy(this._tmp).multiplyScalar(BOLT_SPEED + shipAdvance);
      b.ttl = BOLT_TTL;
      b.dmg = boltDmg;
      b.mesh.scale.set(isShuttle ? 1.5 : 1.0, 1.0, isShuttle ? 1.3 : 1.0);
      b.fresh = true; // não avança no frame do disparo (renderiza 1º colado na asa)
      b.mesh.visible = true;
    }
  }

  // fumaça genérica: count sprites espalhados em ±spread, nascendo com "scale"
  // e crescendo "grow" u/s durante ttl segundos
  _spawnPuff(pos, { count = 1, scale = 0.08, grow = 0.35, ttl = 0.8, spread = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.puffs.find((x) => x.life <= 0);
      if (!p) break;
      p.sprite.position.set(
        pos.x + (Math.random() - 0.5) * spread * 2,
        pos.y + (Math.random() - 0.5) * spread * 2,
        pos.z + (Math.random() - 0.5) * spread * 2
      );
      p.ttl = ttl * (0.75 + Math.random() * 0.5);
      p.life = p.ttl;
      p.grow = grow;
      p.sprite.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
      p.sprite.visible = true;
    }
  }

  // a pedra EXPLODE antes de sumir: flash + detritos voando + nuvem de fumaça
  // que cresce e fica pairando onde o asteroide estava — tudo escalado ao raio r
  _explode(center, r) {
    // flash proporcional (numa pedra de 3u o clarão antigo de 0.5u nem aparecia)
    this.flash.position.copy(center);
    this.flash.scale.setScalar(Math.max(r * 2.2, 0.4));
    this._flashLife = 1;
    this.flash.visible = true;

    // detritos: estilhaços saindo do miolo em todas as direções
    const boom =
      this.booms.find((x) => x.life <= 0) ||
      this.booms.reduce((a, b) => (a.life < b.life ? a : b)); // recicla a mais antiga
    const posAttr = boom.pts.geometry.attributes.position;
    for (let i = 0; i < boom.vels.length; i++) {
      const dir = boom.vels[i]
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      posAttr.setXYZ(
        i,
        center.x + dir.x * r * 0.4 * Math.random(),
        center.y + dir.y * r * 0.4 * Math.random(),
        center.z + dir.z * r * 0.4 * Math.random()
      );
      dir.multiplyScalar(r * (0.8 + Math.random() * 1.7)); // vira velocidade
    }
    posAttr.needsUpdate = true;
    boom.mat.size = 0.03 + r * 0.045;
    boom.mat.opacity = 1;
    boom.life = boom.ttl;
    boom.pts.visible = true;

    // nuvem de fumaça no lugar da pedra (persiste e se dissipa devagar)
    this._spawnPuff(center, {
      count: 5,
      scale: Math.max(r * 0.9, 0.15),
      grow: Math.max(r * 0.7, 0.3),
      ttl: 2,
      spread: r * 0.45,
    });
  }

  // o bolt entrou no raio de algum corpo (planeta/Sol)? some sem efeito nenhum
  _insideBody(pos) {
    if (!this.getBodies) return false;
    for (const body of this.getBodies()) {
      body.worldPosition(this._tmp2);
      if (this._tmp2.distanceTo(pos) < body.radius) return true;
    }
    return false;
  }

  _hitTarget(sys, hit, at, dmg = 1) {
    let hp = this._hp.get(hit.id);
    const maxHp = hit.maxHp ?? maxHpFor(hit.r); // alvo pode ditar o próprio HP
    if (hp == null) hp = maxHp;

    // Alvo temporariamente imune (ex: fase de sobrecarga/last stand do boss)
    if (hit.immune || (sys.isImmune && sys.isImmune(hit.id))) {
      if (sys.onDamaged) sys.onDamaged(hit.id, hp, maxHp, at);
      return;
    }

    // 1 vez antes de morrer: ativa imunidade temporária do boss
    if (hp <= dmg && sys.tryTriggerInvulnerability && sys.tryTriggerInvulnerability(hit.id)) {
      this._hp.set(hit.id, 1);
      if (sys.onDamaged) sys.onDamaged(hit.id, 1, maxHp, at);
      return;
    }

    hp -= dmg;
    // alvos com barra/efeitos próprios (nave alien, bosses) acompanham o HP que
    // vive aqui — recebem também ONDE o tiro pegou (ondulação do escudo)
    if (sys.onDamaged) sys.onDamaged(hit.id, Math.max(hp, 0), maxHp, at);
    // sem som: no vácuo o impacto é só visual (fumaça/flash/detritos)
    if (hp <= 0) {
      this._hp.delete(hit.id);
      if (sys.destroyAsteroid) sys.destroyAsteroid(hit.id);
      else sys.destroy(hit.id);
      emit("stat", { key: sys === this.asteroids ? "asteroidsDestroyed" : "satellitesDestroyed" });
      this._explode(hit.center, hit.r); // estoura em detritos + fumaça no lugar
      if (this._hpTarget && this._hpTarget.id === hit.id) this._hpTarget = null;
    } else {
      this._hp.set(hit.id, hp);
      if (!hit.noPuff) this._spawnPuff(at); // escudo faz o próprio efeito (noPuff)
      // bosses têm barras longas próprias (noBar) — a fininha é só dos pequenos
      if (!hit.noBar) this._hpTarget = { id: hit.id, center: hit.center, hp, maxHp, timer: HPBAR_TTL };
    }
  }

  update(dt, { canFire = false } = {}) {
    this._cd -= dt;
    const shipEmp = this.ship?.empTimer > 0;
    if (this.enabled && canFire && !shipEmp && this._fireHeld && this._cd <= 0) {
      this._cd = FIRE_EVERY;
      this._fire();
    }

    // bolts: avança em substeps testando colisão (rocha pequena não é atravessada)
    for (const b of this.bolts) {
      if (b.ttl <= 0) continue;
      if (b.fresh) {
        b.fresh = false; // primeiro frame parado na boca do canhão
        continue;
      }
      b.ttl -= dt;
      if (b.ttl <= 0 || this._insideBody(b.mesh.position)) {
        b.ttl = 0;
        b.mesh.visible = false;
        continue;
      }
      const step = this._tmp.copy(b.vel).multiplyScalar(dt);
      const dist = step.length();
      const n = Math.min(Math.ceil(dist / SUBSTEP), 24);
      step.multiplyScalar(1 / n);
      for (let i = 0; i < n; i++) {
        b.mesh.position.add(step);
        let sys = this.asteroids;
        let hit = this.asteroids.hitTest(b.mesh.position);
        if (!hit) {
          for (const s of this.extraTargets) {
            hit = s.hitTest(b.mesh.position);
            if (hit) {
              sys = s;
              break;
            }
          }
        }
        if (hit) {
          this._hitTarget(sys, hit, b.mesh.position, b.dmg || 1);
          b.ttl = 0;
          b.mesh.visible = false;
          break;
        }
      }
    }

    // fumaça: cresce e esmaece (deriva parada — destroço no vácuo)
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const t = 1 - p.life / p.ttl;
      p.sprite.material.opacity = (1 - t) * 0.55;
      p.sprite.scale.addScalar(p.grow * dt);
    }
    if (this._flashLife > 0) {
      this._flashLife -= dt * 4;
      this.flash.material.opacity = Math.max(this._flashLife, 0);
      this.flash.scale.addScalar(dt * 2.5);
      if (this._flashLife <= 0) this.flash.visible = false;
    }

    // detritos das explosões: voam pra fora e esmaecem
    for (const boom of this.booms) {
      if (boom.life <= 0) continue;
      boom.life -= dt;
      if (boom.life <= 0) {
        boom.pts.visible = false;
        continue;
      }
      const posAttr = boom.pts.geometry.attributes.position;
      for (let i = 0; i < boom.vels.length; i++) {
        const v = boom.vels[i];
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + v.x * dt,
          posAttr.getY(i) + v.y * dt,
          posAttr.getZ(i) + v.z * dt
        );
      }
      posAttr.needsUpdate = true;
      boom.mat.opacity = boom.life / boom.ttl;
    }

    this._updateHpBar(dt);
  }

  // projeta a barra de vida na tela, um pouco acima do asteroide atingido
  _updateHpBar(dt) {
    const t = this._hpTarget;
    if (!t) {
      this.hpBar.style.display = "none";
      return;
    }
    t.timer -= dt;
    if (t.timer <= 0) {
      this._hpTarget = null;
      this.hpBar.style.display = "none";
      return;
    }
    this._tmp.copy(t.center).project(this.camera);
    const behind = this._tmp.z > 1;
    if (behind || Math.abs(this._tmp.x) > 1.1 || Math.abs(this._tmp.y) > 1.1) {
      this.hpBar.style.display = "none";
      return;
    }
    const x = (this._tmp.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._tmp.y * 0.5 + 0.5) * window.innerHeight - 18;
    this.hpBar.style.display = "";
    this.hpBar.style.left = `${x}px`;
    this.hpBar.style.top = `${y}px`;
    this._hpFill.style.width = `${(t.hp / t.maxHp) * 100}%`;
  }
}
