// HANGAR — catálogo de naves do jogador + onde cada equipamento está instalado.
//
// O save ganha `save.hangar = { unlocked, active, install }`:
//   • unlocked: ids de nave que o jogador possui (a XR-07 vem de fábrica);
//   • active:   a nave que ele está pilotando;
//   • install:  itemId -> shipId (cada item existe UMA vez — mover, nunca duplicar).
//
// O resto do jogo continua lendo as flags legadas (inventory.scanner.equipped,
// inventory.shield.equipped, ship.weapons.plasmaCannon): syncLoadout() espelha
// o hangar nelas — um item só "funciona" se está instalado na nave ATIVA.
// A posse do canhão vive em ship.weapons.plasmaCannonOwned (a flag antiga
// plasmaCannon vira "instalado na nave ativa"; saves velhos migram sozinhos).

import { buildCatalog } from "./discoveryRegistry.js";

export const SHIP_CATALOG = [
  // yaw/pitch/roll: correção do nariz e alinhamento do modelo (nossa convenção de voo é -Z);
  // a nave base XR-07 tem nariz em +Z — gira 180° com yaw Math.PI;
  // o ônibus espacial vem "em pé" (nariz em +Y) — deita com pitch -90°;
  // o caça estelar SW-X já possui o nariz no eixo frontal -Z nativo — yaw 0, pitch 0, roll 0
  { id: "xr07", modelPath: "models/Spaceship.glb", yaw: Math.PI, pitch: 0, roll: 0 },
  { id: "shuttle", modelPath: "models/onibusEspacialTerra.glb", yaw: 0, pitch: -Math.PI / 2, roll: 0 },
  { id: "naveSW", modelPath: "models/naveSW.glb", yaw: 0, pitch: 0, roll: 0 },
];

// itens que podem ser movidos de uma nave pra outra (o raio trator é
// equipamento de série: toda nave tem o seu)
export const MOVABLE_ITEMS = ["scanner", "plasmaCannon", "shieldGen"];

export function shipDef(id) {
  return SHIP_CATALOG.find((s) => s.id === id) || null;
}

export function activeShipDef(save) {
  return shipDef(ensureHangar(save).active) || SHIP_CATALOG[0];
}

// Progresso de conquistas para cálculo de desbloqueio do Hangar (80%)
export function getAchievementsProgress(save) {
  const catalog = buildCatalog();
  const total = catalog.length;
  if (total === 0) return { unlocked: 0, total: 0, required: 0, ratio: 0, percentage: 0 };
  const discoveries = save?.discoveries || save?.data?.discoveries || {};
  let unlocked = 0;
  for (const item of catalog) {
    if (discoveries[item.id]) unlocked++;
  }
  const ratio = unlocked / total;
  const percentage = Math.round(ratio * 100);
  const required = Math.ceil(total * 0.8);
  return { unlocked, total, required, ratio, percentage };
}

// Progresso de inimigos abatidos em combate para desbloqueio da naveSW (20 inimigos)
export function getCombatKillsProgress(save) {
  const stats = save?.statistics || save?.data?.statistics || {};
  const kills = stats.enemyShipsDestroyed || 0;
  const required = 20;
  const ratio = Math.min(kills / required, 1);
  const percentage = Math.round(ratio * 100);
  return { kills, required, ratio, percentage, unlocked: kills >= required };
}

export function isShipUnlocked(save, shipId) {
  if (!save) return shipId === "xr07";
  const h = ensureHangar(save);
  if (h.unlocked.includes(shipId)) return true;
  if (shipId === "shuttle") {
    const prog = getAchievementsProgress(save);
    return prog.ratio >= 0.8;
  }
  if (shipId === "naveSW") {
    const prog = getCombatKillsProgress(save);
    return prog.unlocked;
  }
  return false;
}

// garante a estrutura no save (migração leve de saves antigos): tudo que já
// estava equipado passa a constar como instalado na nave ativa.
export function ensureHangar(save) {
  if (!save.hangar) save.hangar = { unlocked: ["xr07"], active: "xr07", install: {} };
  const h = save.hangar;
  if (!Array.isArray(h.unlocked) || !h.unlocked.length) h.unlocked = ["xr07"];

  // Desbloqueia o Ônibus Espacial se tiver 80% das conquistas
  const prog = getAchievementsProgress(save);
  if (prog.ratio >= 0.8 && !h.unlocked.includes("shuttle")) {
    h.unlocked.push("shuttle");
  }

  // Desbloqueia a naveSW se tiver 20 abates de inimigos em combate
  const combatProg = getCombatKillsProgress(save);
  if (combatProg.unlocked && !h.unlocked.includes("naveSW")) {
    h.unlocked.push("naveSW");
  }

  if (!h.active || !h.unlocked.includes(h.active)) h.active = h.unlocked[0];
  h.install = h.install || {};

  // Se a naveSW for a ativa, ela já vem com canhão equipado de fábrica
  if (h.active === "naveSW") {
    if (!save.ship) save.ship = { weapons: {} };
    if (!save.ship.weapons) save.ship.weapons = {};
    save.ship.weapons.plasmaCannonOwned = true;
    save.ship.weapons.plasmaCannon = true;
  }

  if (save.ship?.weapons?.plasmaCannon && !save.ship.weapons.plasmaCannonOwned) {
    save.ship.weapons.plasmaCannonOwned = true;
  }
  // Garante que todo item possuído tenha alocação (padrão: nave ativa)
  for (const it of MOVABLE_ITEMS) {
    if (ownsItem(save, it) && !h.install[it]) {
      h.install[it] = h.active;
    }
  }
  return h;
}

export function ownsItem(save, id) {
  if (id === "scanner") return !!save.inventory?.scanner?.owned;
  if (id === "shieldGen") return !!save.inventory?.shield?.owned;
  if (id === "plasmaCannon")
    return !!(save.ship?.weapons?.plasmaCannonOwned || save.ship?.weapons?.plasmaCannon);
  if (id === "tractor") return true;
  return false;
}

// em qual nave o item está instalado (null = ainda não instalado em nenhuma)
export function itemShip(save, id) {
  const h = ensureHangar(save);
  if (id === "tractor") return h.active; // de série em toda nave
  return h.install[id] || null;
}

export function moveItem(save, id, shipId) {
  const h = ensureHangar(save);
  if (!MOVABLE_ITEMS.includes(id) || !ownsItem(save, id)) return;
  h.install[id] = shipId;
  syncLoadout(save);
}

export function setActiveShip(save, shipId, { moveEquipment = true } = {}) {
  const h = ensureHangar(save);
  if (!isShipUnlocked(save, shipId)) return;
  if (!h.unlocked.includes(shipId)) h.unlocked.push(shipId);
  h.active = shipId;
  if (moveEquipment) {
    for (const it of MOVABLE_ITEMS) {
      if (ownsItem(save, it)) {
        h.install[it] = shipId;
      }
    }
  }
  syncLoadout(save);
}

export function grantShip(save, shipId) {
  const h = ensureHangar(save);
  if (!h.unlocked.includes(shipId)) h.unlocked.push(shipId);
}

// espelha o hangar nas flags legadas que os sistemas de jogo consultam
export function syncLoadout(save) {
  const h = ensureHangar(save);
  const on = (id) => ownsItem(save, id) && h.install[id] === h.active;
  if (save.inventory?.scanner) save.inventory.scanner.equipped = on("scanner");
  if (save.inventory?.shield) save.inventory.shield.equipped = on("shieldGen");
  if (save.ship?.weapons) save.ship.weapons.plasmaCannon = on("plasmaCannon");
}
