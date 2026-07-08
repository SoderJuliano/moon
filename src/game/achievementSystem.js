// AchievementSystem — a ÚNICA ponte entre eventos e progressão.
//
// Só assina o event bus; nunca é consultado por sistemas de jogo. Emitir:
//   emit("body:visited", { id: "mars" })   → descoberta body:mars
//   emit("poi:found",    { id: "wreck" })  → descoberta poi:wreck
//   emit("milestone",    { id: "first-shot" }) → marco mark:first-shot
//   emit("stat", { key: "collisions", add: 1 }) → contador em save.statistics
//
// No PRIMEIRO desbloqueio de um item do catálogo: grava data/hora real no
// save, toca o jingle de descoberta (o mesmo da nave abandonada), mostra a
// popup e AUTO-SALVA. Repetições são ignoradas — os emissores podem emitir à
// vontade, sem guardar estado.

import { on } from "./events.js";
import { buildCatalog } from "./discoveryRegistry.js";
import { playDiscovery } from "../ui/sfx.js";

// conquistas-SURPRESA por estatística: ao cruzar o limiar, desbloqueia sozinho
// (sem missão, sem aviso prévio) — adicionar limiar novo é uma linha aqui
const STAT_UNLOCKS = {
  asteroidsDestroyed: [{ at: 50, id: "mark:asteroid-hunter" }],
};

export class AchievementSystem {
  constructor({ save, popup }) {
    this.save = save; // SaveManager
    this.popup = popup; // DiscoveryPopup
    this.catalog = new Map(buildCatalog().map((i) => [i.id, i]));

    on("body:visited", ({ id }) => this._unlock(`body:${id}`));
    on("poi:found", ({ id }) => this._unlock(`poi:${id}`));
    on("milestone", ({ id }) => this._unlock(`mark:${id}`));
    on("stat", ({ key, add = 1 }) => this._stat(key, add));
  }

  isUnlocked(id) {
    return !!this.save.data?.discoveries?.[id];
  }

  _stat(key, add) {
    const s = this.save.data?.statistics;
    if (!s) return;
    s[key] = (s[key] || 0) + add;
    // contadores mudam o tempo todo (disparos etc.) — quem persiste é o
    // auto-save periódico/de eventos, não cada incremento
    const rules = STAT_UNLOCKS[key];
    if (rules) for (const r of rules) if (s[key] >= r.at) this._unlock(r.id);
  }

  _unlock(id) {
    const item = this.catalog.get(id);
    if (!item) return; // evento sem card no catálogo: ignora em silêncio
    const d = this.save.data;
    if (!d || d.discoveries[id]) return; // já descoberto
    const at = new Date().toISOString(); // data/hora REAL do computador
    d.discoveries[id] = { at };
    playDiscovery();
    this.popup.show(item, at);
    this.save.saveNow(); // descoberta é evento importante → auto-save
  }
}
