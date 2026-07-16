// SaveManager — TODA a persistência do jogo passa por aqui.
//
// Backend plugável: hoje LocalStorage; amanhã IndexedDB/arquivo/cloud é só
// implementar { read, write, clear } e passar no construtor — nenhum outro
// módulo sabe ONDE o save mora. Formato: JSON legível, sem criptografia.
//
// Auto-save, nunca botão:
//   • saveNow() é chamado pelos eventos importantes (descoberta, conquista,
//     upgrade…) — o AchievementSystem cuida disso;
//   • tick(dt) salva periodicamente (60s) durante o voo normal;
//   • beforeunload (registrado pelo gameMode) salva ao fechar a aba.
//
// Antes de escrever, onBeforeSave(data) é invocado — é onde o gameMode fotografa
// o estado vivo (posição/quaternion/velocidade da nave, simDays…) pra dentro do
// JSON. O SaveManager não conhece a nave; só oferece o gancho.

import { pushSave } from "./cloudSync.js";
import { getPlayer, setCloudId, saveKeyFor } from "./players.js";

const SCHEMA_VERSION = 1;
const AUTOSAVE_EVERY = 60; // s
const CLOUD_MIN_INTERVAL = 15000; // ms mínimos entre envios à nuvem (não spammar)

export class LocalStorageBackend {
  constructor(key = "moon.save.v1") {
    this.key = key;
  }
  read() {
    try {
      return localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }
  write(text) {
    try {
      localStorage.setItem(this.key, text);
      return true;
    } catch {
      return false; // storage cheio/bloqueado: jogo segue sem salvar
    }
  }
  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignora */
    }
  }
}

// Estrutura completa desde já — campos futuros (fuel, energia, inventário)
// nascem vazios pra novas mecânicas não exigirem migração de schema.
export function defaultSave() {
  const now = new Date().toISOString();
  return {
    meta: { version: SCHEMA_VERSION, createdAt: now, updatedAt: now },
    player: { name: null },
    ship: {
      position: null, // [x,y,z] — null = nunca voou (spawn padrão na Terra)
      quaternion: null, // [x,y,z,w]
      velocity: [0, 0, 0],
      speed: 0,
      referenceBodyId: "earth", // "planeta atual"
      weapons: { plasmaCannon: false },
      upgrades: [],
      fuel: null, // futuro
      energy: null, // futuro
    },
    world: { mode: "game", simDays: 0 },
    inventory: { items: [], scanner: { owned: false, equipped: false } },
    flags: {}, // marcos de história (ex.: alienDefeated) — cresce livre
    missions: {}, // id -> { status, phase } (gerido pelo MissionManager)
    prestige: 0, // "humor"/reputação com o planeta natal (0..100)
    discoveries: {}, // id -> { at: ISO } (catálogo em discoveryRegistry)
    achievements: {}, // reservado p/ meta-conquistas futuras
    statistics: {
      timePlayedS: 0,
      distanceKm: 0,
      supercruiseS: 0,
      collisions: 0,
      shotsFired: 0,
      asteroidsDestroyed: 0,
      satellitesDestroyed: 0,
      enemyShipsDestroyed: 0,
      strangeObjectsTowed: 0,
    },
  };
}

export class SaveManager {
  // playerName != null liga a sincronização com a nuvem (abra-api); sem nome
  // (ex.: menu consultando o legado) é 100% local.
  constructor(backend = new LocalStorageBackend(), { playerName = null } = {}) {
    this.backend = backend;
    this.playerName = playerName;
    this.data = null; // save vivo (em memória) da sessão atual
    this.onBeforeSave = null; // (data) => void — gameMode fotografa o estado
    this._timer = 0;
    this._cloudId = playerName ? getPlayer(playerName)?.cloudId || null : null;
    this._lastCloud = 0;
    // adia o envio à nuvem até o gameMode terminar de montar (nome do jogador +
    // snapshot da nave prontos) — senão o 1º push sobe um save vazio/sem nome
    this._cloudReady = true;
  }

  hasSave() {
    return !!this.backend.read();
  }

  // carrega o save persistido pra memória; null se não existe/corrompido
  load() {
    const text = this.backend.read();
    if (!text) return null;
    try {
      const obj = JSON.parse(text);
      // migração leve: garante os campos do schema atual sem perder os dados
      this.data = { ...defaultSave(), ...obj };
      this.data.ship = { ...defaultSave().ship, ...obj.ship };
      this.data.statistics = { ...defaultSave().statistics, ...obj.statistics };
      return this.data;
    } catch {
      return null;
    }
  }

  newGame() {
    this.data = defaultSave();
    this.saveNow();
    return this.data;
  }

  saveNow() {
    if (!this.data) return;
    if (this.onBeforeSave) this.onBeforeSave(this.data);
    this.data.meta.updatedAt = new Date().toISOString();
    this.backend.write(JSON.stringify(this.data, null, 2));
    this._timer = 0;
    this._cloudPush(false); // espelha na nuvem (throttled, fire-and-forget)
  }

  // auto-save periódico durante o voo (chamado no loop, fora da pausa)
  tick(dt) {
    this._timer += dt;
    if (this._timer >= AUTOSAVE_EVERY) this.saveNow();
  }

  // --- Nuvem (abra-api) -------------------------------------------------------

  // envia o save à nuvem; throttled p/ não spammar, force ignora o intervalo.
  // Local é a fonte da verdade da sessão; a nuvem é espelho — falha é silenciosa.
  async _cloudPush(force) {
    if (!this.playerName || !this.data || !this._cloudReady) return;
    const now = Date.now();
    if (!force && now - this._lastCloud < CLOUD_MIN_INTERVAL) return;
    // SERIALIZA: um envio já em curso vira "sujo" e reenvia ao terminar — evita
    // corrida em que dois POSTs sem id cacheado criam entradas duplicadas.
    if (this._pushing) {
      this._pendingPush = true;
      return;
    }
    this._pushing = true;
    this._lastCloud = now;
    try {
      do {
        this._pendingPush = false;
        if (this.onBeforeSave) this.onBeforeSave(this.data);
        const id = await pushSave(this.playerName, JSON.stringify(this.data), this._cloudId);
        if (id && id !== this._cloudId) {
          this._cloudId = id;
          setCloudId(this.playerName, id);
        }
      } while (this._pendingPush); // 2ª volta já tem id → PUT (sem duplicar)
    } finally {
      this._pushing = false;
    }
  }

  // "envia se tem local e a nuvem ainda não tem" — chamado ao entrar no jogo
  syncUp() {
    return this._cloudPush(true);
  }

  // envio de despedida no beforeunload: keepalive sobrevive ao fechar a aba
  // (não dá pra aguardar Promise nem re-GET o id ali — usa o id já conhecido)
  syncUpBeacon() {
    if (!this.playerName || !this.data) return;
    if (this.onBeforeSave) this.onBeforeSave(this.data);
    pushSave(this.playerName, JSON.stringify(this.data), this._cloudId, true);
  }

  // --- Exportar / Importar (JSON puro, legível) -------------------------------

  exportToFile() {
    const text = this.data
      ? (this.onBeforeSave?.(this.data), JSON.stringify(this.data, null, 2))
      : this.backend.read();
    if (!text) return false;
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `moon-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  // valida o mínimo e persiste; retorna true se o save foi aceito
  importFromText(text) {
    try {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object" || !obj.meta || !obj.ship) return false;
      this.backend.write(JSON.stringify(obj, null, 2));
      return true;
    } catch {
      return false;
    }
  }
}

// SaveManager de um jogador nomeado: backend local próprio + sync com a nuvem.
// Nasce com a nuvem GATED (o gameMode libera após montar nome+snapshot) — assim
// os saves iniciais de newGame()/load() não sobem um estado incompleto.
export function createPlayerSave(name) {
  const sm = new SaveManager(new LocalStorageBackend(saveKeyFor(name)), { playerName: name });
  sm._cloudReady = false;
  return sm;
}
