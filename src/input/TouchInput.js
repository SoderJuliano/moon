// Rastreador de atividade de TOQUE para o InputManager.
//
// Os controles touch reais continuam em ui/touchControls.js (intocados) — este
// módulo só reporta "o jogador tocou na tela" pra troca automática de
// dispositivo. Com um controle Bluetooth pareado no Android, touch e gamepad
// convivem: quem mexeu por último dita as dicas da UI.

export class TouchInput {
  constructor(onActivity) {
    this._handler = () => onActivity("touch");
    window.addEventListener("touchstart", this._handler, { passive: true });
  }

  dispose() {
    window.removeEventListener("touchstart", this._handler);
  }
}
