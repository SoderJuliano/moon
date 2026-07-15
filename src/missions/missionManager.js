import { playChime } from "../ui/sfx.js";
import { t } from "../core/i18n.js";
// ENGINE DE MISSÕES — biblioteca apartada pra história/secundárias (src/missions).
//
// Cada missão é um objeto/instância com ciclo de vida (onAvailable, onStart,
// update, onComplete) e um estado de FASE próprio. O manager orquestra:
//   • guarda status+fase de cada missão em save.missions (persistente);
//   • mostra a UI — banner "missão disponível" (Aceitar/Agora não) e DOIS chips
//     de objetivo: um PRIMÁRIO (destaque) e um SECUNDÁRIO (discreto, menor/cinza);
//   • roda update(dt) em TODAS as missões ativas (uma primária + secundárias);
//   • ao concluir, soma prestígio e some o chip.
//
// mission.kind = "primary" | "secondary" (default primary) decide o chip e a
// ênfase. O chip secundário some se save.settings.showSecondaryHud for false.
// Adicionar missão nova = registrar um descritor; persistência/UI/retomada e
// prestígio vêm de graça.

export const MISSION = {
  LOCKED: "locked",
  AVAILABLE: "available",
  ACTIVE: "active",
  COMPLETED: "completed",
};

const PRESTIGE_PER_MISSION = 8; // cada missão concluída rende prestígio

export class MissionManager {
  // ctx: tudo que as missões precisam (scene, camera, ship, cannon, markers,
  // bodyById, combat, station, asteroids, scanner, save, saveManager, emit…).
  constructor(ctx) {
    this.ctx = ctx;
    ctx.mgr = this;
    this.save = ctx.save;
    if (!this.save.missions) this.save.missions = {};
    if (!this.save.settings) this.save.settings = { showSecondaryHud: true };
    this.missions = new Map();
    this._activePrimary = null;
    this._activeSecondary = null;

    this.banner = document.createElement("div");
    this.banner.className = "mission-avail";
    this.banner.style.display = "none";
    document.body.appendChild(this.banner);

    // chip PRIMÁRIO (destaque) e SECUNDÁRIO (discreto)
    this.chipPrimary = document.createElement("div");
    this.chipPrimary.className = "mission-chip";
    this.chipPrimary.style.display = "none";
    document.body.appendChild(this.chipPrimary);

    this.chipSecondary = document.createElement("div");
    this.chipSecondary.className = "mission-chip mission-chip-sec";
    this.chipSecondary.style.display = "none";
    document.body.appendChild(this.chipSecondary);

    // toast de NPC da estação (canto, discreto, some sozinho) — reaproveitável
    this.toast = document.createElement("div");
    this.toast.className = "station-toast";
    this.toast.style.display = "none";
    document.body.appendChild(this.toast);
    this._toastT = 0;
  }

  register(mission) {
    mission.mgr = this;
    if (!mission.kind) mission.kind = "primary";
    this.missions.set(mission.id, mission);
    const st = this.save.missions[mission.id];
    if (!st) return;
    if (st.status === MISSION.ACTIVE) this._activate(mission, true);
    else if (st.status === MISSION.AVAILABLE) this._showAvailable(mission);
  }

  status(id) {
    return this.save.missions[id]?.status || MISSION.LOCKED;
  }
  phase(id) {
    return this.save.missions[id]?.phase || null;
  }
  setPhase(id, phase) {
    const st = this.save.missions[id] || (this.save.missions[id] = { status: MISSION.ACTIVE });
    st.phase = phase;
    this._persist();
    this.missions.get(id)?.onPhase?.(phase, this.ctx);
    this._updateChips();
  }

  makeAvailable(id) {
    if (this.status(id) !== MISSION.LOCKED) return;
    this.save.missions[id] = { status: MISSION.AVAILABLE };
    this._persist();
    const m = this.missions.get(id);
    if (m) {
      m.onAvailable?.(this.ctx);
      this._showAvailable(m);
    }
  }

  start(id) {
    const m = this.missions.get(id);
    if (!m) return;
    this.save.missions[id] = { status: MISSION.ACTIVE, phase: m.firstPhase || null };
    this._persist();
    this.banner.style.display = "none";
    this._activate(m, false);
  }

  complete(id) {
    const m = this.missions.get(id);
    if (!m) return;
    this.save.missions[id] = { status: MISSION.COMPLETED };
    // cada missão concluída aumenta o prestígio com o planeta natal
    this.save.prestige = Math.min(100, (this.save.prestige || 0) + PRESTIGE_PER_MISSION);
    this._persist();
    m.active = false;
    if (this._activePrimary === m) this._activePrimary = null;
    if (this._activeSecondary === m) this._activeSecondary = null;
    m.onComplete?.(this.ctx);
    this._updateChips();
  }

  // NPC da estação "fala" no canto (agradecimentos, atualizações). Discreto.
  // Chime de HUD acompanha (feedback de interface — não é som de mundo).
  stationSay(text, secs = 5) {
    this.toast.textContent = `📡 ${t("mission.station")}: ${text}`;
    this.toast.style.display = "";
    this._toastT = secs;
    playChime();
  }

  // lista pro painel de progresso da pausa: { id, title, kind, objective, status }
  progressList() {
    const out = [];
    for (const m of this.missions.values()) {
      const st = this.status(m.id);
      if (st === MISSION.ACTIVE || st === MISSION.AVAILABLE) {
        out.push({ id: m.id, title: m.title, kind: m.kind, objective: m.objective || "", status: st });
      }
    }
    return out;
  }

  _activate(m, restoring) {
    if (m.kind === "secondary") this._activeSecondary = m;
    else this._activePrimary = m;
    m.active = true;
    m.onStart?.(this.ctx, restoring);
    this._updateChips();
  }

  _showAvailable(m) {
    const tag = m.kind === "secondary" ? t("mission.availSec") : t("mission.availPri");
    const titles = {
      "space-rocks": t("mission.rocks.primaryTitle"),
      "sec-ferro": t("mission.rocks.secIronTitle"),
      "sec-gelo": t("mission.rocks.secIceTitle"),
      "strange-objects": t("mission.strange.title"),
      "neptune-incident": t("mission.neptune.title"),
      "twins": t("mission.twins.title"),
      "sec-destrocos": t("mission.debris.title"),
    };
    const title = titles[m.id] || m.title;
    this.banner.innerHTML = `<small>${tag}</small><b>${title}</b>
      <div class="mission-avail-row">
        <button class="modal-btn yes" data-act="accept">${t("mission.accept")}</button>
        <button class="modal-btn" data-act="later">${t("mission.later")}</button>
      </div>`;
    this.banner.style.display = "";
    this.banner.querySelector('[data-act="accept"]').onclick = (e) => {
      e.currentTarget.blur();
      this.start(m.id);
    };
    this.banner.querySelector('[data-act="later"]').onclick = (e) => {
      e.currentTarget.blur();
      this.banner.style.display = "none";
    };
  }

  _updateChips() {
    const pt = this._activePrimary?.objective || "";
    this.chipPrimary.textContent = pt ? "◈ " + pt : "";
    this.chipPrimary.style.display = pt ? "" : "none";

    const showSec = this.save.settings?.showSecondaryHud !== false;
    const st = this._activeSecondary?.objective || "";
    this.chipSecondary.textContent = st ? "› " + st : "";
    this.chipSecondary.style.display = st && showSec ? "" : "none";
  }

  // chamado quando a config muda (menu de pausa) pra refletir na hora
  refreshHud() {
    this._updateChips();
  }

  update(dt) {
    if (this._activePrimary?.update) this._activePrimary.update(dt, this.ctx);
    if (this._activeSecondary?.update) this._activeSecondary.update(dt, this.ctx);
    this._updateChips();
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.toast.style.display = "none";
    }
  }

  _persist() {
    this.ctx.saveManager?.saveNow?.();
  }
}
