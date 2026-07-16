// Leitura de gamepad via Gamepad API padrão do navegador (sem lib externa).
//
// Funciona em Chrome/Firefox/Edge, Android (Chrome/WebView) e futuramente
// Electron/Steam Deck — a API é a mesma. navigator.getGamepads() devolve
// SNAPSHOTS: é preciso re-ler a cada frame (o InputManager chama update()).
//
// Botões digitais → eventos de teclado sintéticos com detecção de borda
// (keydown na pressão, keyup na soltura — exatamente o contrato do teclado
// físico que ShipFlight/canhão/pausa já esperam; ver InputMappings.js).
// Analógicos → expostos como eixos contínuos com deadzone radial.

import { BUTTON_MAP, AXES, TRIGGER_THRESHOLD } from "./InputMappings.js";
import { getSetting } from "./InputSettings.js";

function syntheticKey(type, code) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

// Deadzone radial re-escalada: fora da zona morta o valor volta a crescer de 0
// (sem "degrau" no início do curso do analógico).
function applyDeadzone(x, y, dz) {
  const mag = Math.hypot(x, y);
  if (mag < dz) return [0, 0];
  const scale = Math.min(1, (mag - dz) / (1 - dz)) / mag;
  return [x * scale, y * scale];
}

export class GamepadInput {
  constructor({ onActivity, onConnect, onDisconnect, ui }) {
    this._onActivity = onActivity;
    this._onConnect = onConnect;
    this._onDisconnect = onDisconnect;
    this._ui = ui || null; // MenuNavigator: quando um menu está aberto, consome os botões
    this._uiWas = false;
    this._prevButtons = {}; // gamepad.index → bool[] do frame anterior
    this.connected = false;
    this.deviceName = "";
    // eixos já tratados, lidos pelo InputManager
    this.pitch = 0;
    this.yaw = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.actionsHeld = new Set(); // ações digitais seguradas neste frame

    this._connect = (e) => {
      console.log("[GamepadInput] Gamepad connected event received:", e.gamepad.id, "index:", e.gamepad.index);
      this.connected = true;
      this.deviceName = e.gamepad.id;
      this._onConnect?.(e.gamepad.id);
    };
    this._disconnect = (e) => {
      console.log("[GamepadInput] Gamepad disconnected event received:", e.gamepad.id);
      this._releaseAll(e.gamepad.index);
      const still = navigator.getGamepads?.() || [];
      this.connected = [...still].some((g) => g && g.index !== e.gamepad.index);
      this._onDisconnect?.(e.gamepad.id);
    };
    window.addEventListener("gamepadconnected", this._connect);
    window.addEventListener("gamepaddisconnected", this._disconnect);

    // Scan for already connected and authorized gamepads at startup
    try {
      const initialPads = navigator.getGamepads?.() || [];
      console.log("[GamepadInput] Startup scan found", initialPads.length, "gamepad slots");
      for (let i = 0; i < initialPads.length; i++) {
        const pad = initialPads[i];
        if (pad) {
          console.log(`[GamepadInput] Slot ${pad.index}: ${pad.id} (connected: ${pad.connected})`);
        }
        if (pad && pad.connected) {
          console.log("[GamepadInput] Activating already connected gamepad:", pad.id);
          this.connected = true;
          this.deviceName = pad.id;
          // Trigger the connection callback to notify the InputManager and show the toast
          setTimeout(() => this._onConnect?.(pad.id), 150);
          break;
        }
      }
    } catch (e) {
      console.warn("[GamepadInput] Gamepad initial scan failed:", e);
    }
  }

  // Chamado a cada frame pelo InputManager.
  update() {
    const pads = navigator.getGamepads?.();
    if (!pads) return;

    this.pitch = 0;
    this.yaw = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.actionsHeld.clear();
    let activity = false;

    // Menu aberto: navegador consome os botões, voo fica mudo. Ao ENTRAR no
    // modo menu, solta as teclas sintéticas presas MANTENDO o estado de borda
    // (keep) — senão o próprio Start que abriu a pausa viraria uma borda
    // "nova" no frame seguinte e fecharia a pausa na hora.
    const uiActive = !!this._ui?.active();
    if (uiActive && !this._uiWas) this._releaseAll(null, { keep: true });
    this._uiWas = uiActive;
    const nav = uiActive
      ? { up: false, down: false, left: false, right: false, confirm: false, cancel: false }
      : null;

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      this.connected = true;

      // --- Botões digitais (com borda → teclas sintéticas) ------------------
      const prev = this._prevButtons[pad.index] || [];
      const now = [];
      for (const map of BUTTON_MAP) {
        const btn = pad.buttons[map.index];
        if (!btn) continue;
        const held = btn.pressed || btn.value > TRIGGER_THRESHOLD;
        now[map.index] = held;
        if (held) {
          this.actionsHeld.add(map.action);
          activity = true;
        }
        if (nav) continue; // menu aberto: sem teclas sintéticas de voo
        if (!map.codes) continue; // ação futura, sem alvo ainda
        if (held && !prev[map.index]) for (const c of map.codes) syntheticKey("keydown", c);
        else if (!held && prev[map.index]) for (const c of map.codes) syntheticKey("keyup", c);
      }
      this._prevButtons[pad.index] = now;

      if (nav) {
        // D-pad/analógico esquerdo = direções (segurados; o navegador repete),
        // A(0) = confirmar, B(1)/Start(9) = cancelar (bordas)
        const rawX = pad.axes[AXES.leftX] || 0;
        const rawY = pad.axes[AXES.leftY] || 0;
        nav.up = nav.up || now[12] || rawY < -0.5;
        nav.down = nav.down || now[13] || rawY > 0.5;
        nav.left = nav.left || now[14] || rawX < -0.5;
        nav.right = nav.right || now[15] || rawX > 0.5;
        nav.confirm = nav.confirm || (now[0] && !prev[0]);
        nav.cancel = nav.cancel || (now[1] && !prev[1]) || (now[9] && !prev[9]);
        if (Math.abs(rawX) > 0.5 || Math.abs(rawY) > 0.5) activity = true;
        continue; // eixos de voo ficam em 0 com menu aberto
      }

      // --- Analógicos --------------------------------------------------------
      const dz = getSetting("deadzone");
      const sens = getSetting("sensitivity");
      const [lx, ly] = applyDeadzone(pad.axes[AXES.leftX] || 0, pad.axes[AXES.leftY] || 0, dz);
      const [rx, ry] = applyDeadzone(pad.axes[AXES.rightX] || 0, pad.axes[AXES.rightY] || 0, dz);
      const invY = getSetting("invertY") ? -1 : 1;
      // convenção da ShipFlight: pitch +1 = nariz sobe; yaw +1 = guina à esquerda
      this.yaw += -lx * sens;
      this.pitch += -ly * sens * invY;
      this.lookX += rx;
      this.lookY += ry;
      if (lx || ly || rx || ry) activity = true;
    }

    this.pitch = Math.max(-1, Math.min(1, this.pitch));
    this.yaw = Math.max(-1, Math.min(1, this.yaw));
    if (nav) this._ui.frame(nav);
    if (activity) this._onActivity?.("gamepad");
  }

  // Vibração (fundação — o jogo ainda não chama; ver roadmap "Force Feedback").
  // Ex.: rumble({ duration: 200, strongMagnitude: 1, weakMagnitude: 0.5 })
  rumble(opts = {}) {
    if (!getSetting("vibration")) return;
    const pads = navigator.getGamepads?.() || [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      pad?.vibrationActuator
        ?.playEffect?.("dual-rumble", {
          duration: opts.duration ?? 150,
          strongMagnitude: opts.strongMagnitude ?? 0.6,
          weakMagnitude: opts.weakMagnitude ?? 0.3,
        })
        .catch(() => {});
    }
  }

  // Solta toda tecla sintética presa (desconexão/pausa do polling): sem isso a
  // nave continuaria acelerando com um "KeyW fantasma" no Set da ShipFlight.
  // keep: solta as teclas mas PRESERVA o estado de borda (usado ao entrar num
  // menu — botão ainda segurado não pode virar uma pressão "nova" depois).
  _releaseAll(padIndex, { keep = false } = {}) {
    const indices = padIndex != null ? [padIndex] : Object.keys(this._prevButtons);
    for (const idx of indices) {
      const prev = this._prevButtons[idx] || [];
      for (const map of BUTTON_MAP) {
        if (prev[map.index] && map.codes) for (const c of map.codes) syntheticKey("keyup", c);
      }
      if (!keep) delete this._prevButtons[idx];
    }
  }

  dispose() {
    this._releaseAll();
    window.removeEventListener("gamepadconnected", this._connect);
    window.removeEventListener("gamepaddisconnected", this._disconnect);
  }
}
