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

export const SHIP_CATALOG = [
  // yaw/pitch: correção do nariz do modelo (nossa convenção de voo é -Z);
  // o ônibus espacial vem "em pé" (nariz em +Y) — deita com pitch -90°
  { id: "xr07", modelPath: "models/Spaceship.glb", yaw: Math.PI, pitch: 0 },
  { id: "shuttle", modelPath: "models/onibusEspacialTerra.glb", yaw: 0, pitch: -Math.PI / 2 },
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

// garante a estrutura no save (migração leve de saves antigos): tudo que já
// estava equipado passa a constar como instalado na nave ativa.
export function ensureHangar(save) {
  if (!save.hangar) save.hangar = { unlocked: ["xr07"], active: "xr07", install: {} };
  const h = save.hangar;
  if (!Array.isArray(h.unlocked) || !h.unlocked.length) h.unlocked = ["xr07"];
  if (!h.active || !h.unlocked.includes(h.active)) h.active = h.unlocked[0];
  h.install = h.install || {};
  if (save.ship?.weapons?.plasmaCannon && !save.ship.weapons.plasmaCannonOwned) {
    save.ship.weapons.plasmaCannonOwned = true;
  }
  if (save.inventory?.scanner?.equipped && !h.install.scanner) h.install.scanner = h.active;
  if (save.inventory?.shield?.equipped && !h.install.shieldGen) h.install.shieldGen = h.active;
  if (save.ship?.weapons?.plasmaCannon && !h.install.plasmaCannon) h.install.plasmaCannon = h.active;
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

export function setActiveShip(save, shipId, { moveEquipment = false } = {}) {
  const h = ensureHangar(save);
  if (!h.unlocked.includes(shipId)) return;
  h.active = shipId;
  if (moveEquipment) {
    for (const it of MOVABLE_ITEMS) if (ownsItem(save, it) && h.install[it]) h.install[it] = shipId;
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
