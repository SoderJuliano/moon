// InputManager — a ÚNICA interface pública de entrada do jogo.
//
// Filosofia: o resto do jogo nunca sabe se o jogador usa teclado, mouse,
// touch ou gamepad. Sistemas consultam Input.getPitch()/isFirePressed()/etc.
// e este módulo resolve o dispositivo. Nada fora de src/input/ deve ler
// navigator.getGamepads() ou eventos de dispositivo diretamente.
//
// Plataformas: Gamepad API padrão → funciona hoje em desktop (Chrome/Firefox/
// Edge) e Android (Chrome/WebView via Capacitor); o mesmo código roda em
// Electron/Steam/Steam Deck no futuro sem mudança (ver roadmap.md,
// "Future Platform Support"). Zero API específica de plataforma aqui.
//
// O polling roda num requestAnimationFrame PRÓPRIO, independente do loop do
// jogo: com a física pausada o Start precisa continuar funcionando pra
// despausar. Singleton: import { input } e chame input.start() uma vez
// (hoje só o Game Mode liga; o modo exploração está congelado).

import { t } from "../core/i18n.js";
import { GamepadInput } from "./GamepadInput.js";
import { KeyboardInput } from "./KeyboardInput.js";
import { TouchInput } from "./TouchInput.js";
import { getSetting, setSetting, getAllSettings } from "./InputSettings.js";
import { MenuNavigator } from "./MenuNavigator.js";

class InputManager {
  constructor() {
    this.started = false;
    this.activeDevice = "keyboard"; // "keyboard" | "touch" | "gamepad"
    this._gamepad = null;
    this._keyboard = null;
    this._touch = null;
    this._raf = 0;
    this._toast = null;
    this._toastTimer = 0;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const onActivity = (device) => this._setDevice(device);
    this._keyboard = new KeyboardInput(onActivity);
    this._touch = new TouchInput(onActivity);
    const menuNavigator = new MenuNavigator();
    this._gamepad = new GamepadInput({
      onActivity,
      onConnect: (id) => this._notify(t("input.gamepadConnected"), id),
      onDisconnect: (id) => this._notify(t("input.gamepadDisconnected"), id),
      ui: menuNavigator,
    });
    const loop = () => {
      this._gamepad.update();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    cancelAnimationFrame(this._raf);
    this._gamepad?.dispose();
    this._keyboard?.dispose();
    this._touch?.dispose();
    this._gamepad = this._keyboard = this._touch = null;
  }

  // --- Eixos de voo (analógico esquerdo; 0 quando não há gamepad) -----------
  getPitch() {
    return this._gamepad?.pitch ?? 0;
  }
  getYaw() {
    return this._gamepad?.yaw ?? 0;
  }
  getRoll() {
    return 0; // sem eixo de rolagem no mapeamento padrão (Q/E no teclado)
  }
  getThrottle() {
    return this.isAccelerating() ? 1 : 0;
  }

  // --- Câmera livre (analógico direito; preparado, ainda sem consumidor) ----
  lookX() {
    return this._gamepad?.lookX ?? 0;
  }
  lookY() {
    return this._gamepad?.lookY ?? 0;
  }

  // --- Estados digitais (teclado OU gamepad, indistintos pra quem consulta) --
  isAccelerating() {
    return this._key("KeyW") || this._act("interact") || this._act("boost");
  }
  isBoostPressed() {
    return this._key("ShiftLeft") || this._key("ShiftRight") || this._act("boost");
  }
  isBraking() {
    return this._key("ControlLeft") || this._key("ControlRight") || this._act("brake");
  }
  isFirePressed() {
    return this._key("Space") || this._act("fire") || this._act("cannon");
  }
  isScannerPressed() {
    return this._key("KeyG") || this._act("scanner");
  }
  isPausePressed() {
    return this._key("Escape") || this._act("pause") || this._act("cancel");
  }

  // --- Vibração (fundação; roadmap "Force Feedback") -------------------------
  rumble(opts) {
    this._gamepad?.rumble(opts);
  }

  // --- Configurações (fundação da futura tela de opções) ---------------------
  getSetting(key) {
    return getSetting(key);
  }
  setSetting(key, value) {
    setSetting(key, value);
  }
  getAllSettings() {
    return getAllSettings();
  }

  get hasGamepad() {
    return !!this._gamepad?.connected;
  }

  _key(code) {
    return !!this._keyboard?.has(code);
  }
  _act(action) {
    return !!this._gamepad?.actionsHeld.has(action);
  }

  // Troca automática de dispositivo: marca no <body> (CSS pode alternar dicas
  // de teclado × ícones de controle × HUD touch) e emite evento pra UI reagir.
  _setDevice(device) {
    if (device === this.activeDevice) return;
    this.activeDevice = device;
    document.body.dataset.inputDevice = device;
    window.dispatchEvent(new CustomEvent("moon:inputdevice", { detail: { device } }));
  }

  // Aviso discreto de conexão (canto da tela, some sozinho — sem popup).
  _notify(title, deviceId) {
    if (!this._toast) {
      this._toast = document.createElement("div");
      this._toast.className = "gamepad-toast";
      document.body.appendChild(this._toast);
    }
    // "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e...)" → só o nome
    const name = String(deviceId || "").replace(/\s*\(.*$/, "");
    this._toast.innerHTML = `<span class="gamepad-toast-icon">🎮</span><div><strong>${title}</strong><small>${name}</small></div>`;
    this._toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this._toast?.classList.remove("show"), 3500);
  }
}

export const input = new InputManager();
