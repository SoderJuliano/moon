// Rastreador de atividade de TECLADO/MOUSE para o InputManager.
//
// Importante: ele NÃO substitui os listeners de teclado do jogo (ShipFlight,
// canhão etc. continuam escutando keydown/keyup direto — comportamento
// congelado). O papel dele é duplo:
//   1) avisar o InputManager que o último dispositivo usado foi o teclado
//      (pra troca automática de dicas na UI);
//   2) manter um Set de códigos pressionados pra API pública do InputManager
//      (Input.isAccelerating() etc.) responder também pelo teclado.
//
// Eventos SINTÉTICOS (isTrusted === false) vêm do touch e do gamepad — não
// contam como atividade de teclado, senão a detecção de dispositivo quebra.

export class KeyboardInput {
  constructor(onActivity) {
    this.pressed = new Set();
    this._onActivity = onActivity;
    this._down = (e) => {
      this.pressed.add(e.code);
      if (e.isTrusted) this._onActivity("keyboard");
    };
    this._up = (e) => this.pressed.delete(e.code);
    this._mouse = (e) => {
      if (e.isTrusted) this._onActivity("keyboard");
    };
    this._blur = () => this.pressed.clear();
    window.addEventListener("keydown", this._down);
    window.addEventListener("keyup", this._up);
    window.addEventListener("mousedown", this._mouse);
    window.addEventListener("blur", this._blur);
  }

  has(code) {
    return this.pressed.has(code);
  }

  dispose() {
    window.removeEventListener("keydown", this._down);
    window.removeEventListener("keyup", this._up);
    window.removeEventListener("mousedown", this._mouse);
    window.removeEventListener("blur", this._blur);
  }
}
