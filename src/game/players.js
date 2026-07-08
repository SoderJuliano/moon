// Registro de JOGADORES conhecidos NESTE navegador (cache local).
//
// Cada jogador tem um nome (o identificador — sem senha, ainda em dev) que
// mapeia pra um save local próprio (moon.save::<nome>) e pro id da notificação
// na nuvem (abra-api). A lista permite o "Continuar → escolher qual jogador".
//
// Legado: a versão anterior guardava UM save SEM NOME em moon.save.v1. Ele é
// batizado (migrado pra um nome) na primeira vez que o jogador clica Continuar.

const PLAYERS_KEY = "moon.players.v1";
const LEGACY_SAVE_KEY = "moon.save.v1";

export function normalizeName(name) {
  return String(name || "").trim();
}
function keyName(name) {
  return normalizeName(name).toLowerCase();
}
export function saveKeyFor(name) {
  return "moon.save::" + keyName(name);
}

function readList() {
  try {
    return JSON.parse(localStorage.getItem(PLAYERS_KEY)) || [];
  } catch {
    return [];
  }
}
function writeList(list) {
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(list));
  } catch {
    /* storage cheio/bloqueado: segue sem registrar */
  }
}

export function listPlayers() {
  return readList();
}
export function hasPlayer(name) {
  const k = keyName(name);
  return readList().some((p) => keyName(p.name) === k);
}
export function getPlayer(name) {
  const k = keyName(name);
  return readList().find((p) => keyName(p.name) === k) || null;
}
export function addPlayer(name) {
  const list = readList();
  const k = keyName(name);
  if (!list.some((p) => keyName(p.name) === k)) {
    list.push({ name: normalizeName(name), cloudId: null });
    writeList(list);
  }
}
export function setCloudId(name, id) {
  const list = readList();
  const k = keyName(name);
  const p = list.find((x) => keyName(x.name) === k);
  if (p) {
    p.cloudId = id;
    writeList(list);
  }
}

// há QUALQUER save nesta máquina? (nomeado ou o legado sem nome)
export function hasAnySave() {
  return legacySaveExists() || readList().length > 0;
}

// --- Legado: o save único e SEM NOME da versão anterior -----------------------
export function legacySaveExists() {
  try {
    return !!localStorage.getItem(LEGACY_SAVE_KEY);
  } catch {
    return false;
  }
}
// batiza o save legado: move pra moon.save::<nome> e registra o jogador
export function migrateLegacyTo(name) {
  try {
    const text = localStorage.getItem(LEGACY_SAVE_KEY);
    if (text) localStorage.setItem(saveKeyFor(name), text);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch {
    /* ignora */
  }
  addPlayer(name);
}
