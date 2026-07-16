// Mapeamento padrão de gamepad → ações do jogo.
//
// Usa o layout "standard" da Gamepad API (https://w3c.github.io/gamepad/#remapping):
// o navegador já normaliza Xbox, DualShock/DualSense, Steam Deck, Pro Controller,
// 8BitDo etc. para os mesmos índices — por isso NÃO existe código por marca aqui.
// Controle exótico sem layout standard cai no mesmo mapa (melhor esforço).
//
// Estratégia de integração (a mesma do touch, ver touchControls.js): cada botão
// digital dispara EVENTOS DE TECLADO SINTÉTICOS na window. ShipFlight, canhão,
// scanner, hangar e pausa já escutam esses códigos — nenhum sistema muda.
// Os analógicos NÃO viram tecla: são expostos como eixos contínuos pelo
// InputManager (a ShipFlight consome pitch/yaw suaves de lá).
//
// `codes: null` = ação declarada mas ainda sem alvo no jogo (fica pronta pro
// futuro; quando a mecânica existir, é só preencher).

export const BUTTON_MAP = [
  // idx  ação            teclas sintéticas
  { index: 0, action: "interact", codes: ["KeyW"] }, // A — interagir/acelerar (engaja a nave, como o ▲ do touch)
  { index: 1, action: "cancel", codes: ["Escape"] }, // B — cancelar/fechar
  { index: 2, action: "scanner", codes: ["KeyG"] }, // X — scanner de rochas
  { index: 3, action: "shipMenu", codes: ["KeyC"] }, // Y — painel da nave (hangar)
  { index: 4, action: "brake", codes: ["ControlLeft"] }, // LB — freio
  { index: 5, action: "fire", codes: ["Space"] }, // RB — disparo principal
  { index: 6, action: "shield", codes: null }, // LT — escudo (futuro: hoje o escudo é automático)
  { index: 7, action: "cannon", codes: ["Space"] }, // RT — canhão
  { index: 8, action: "map", codes: null }, // Back — mapa/missões (futuro)
  { index: 9, action: "pause", codes: ["Escape"] }, // Start — pausa
  { index: 10, action: "boost", codes: ["ShiftLeft", "KeyW"] }, // L3 — turbo (supercruise, como o » do touch)
  { index: 11, action: "lockTarget", codes: null }, // R3 — travar alvo (futuro)
  { index: 12, action: "pitchUp", codes: ["ArrowUp"] }, // D-pad ↑
  { index: 13, action: "pitchDown", codes: ["ArrowDown"] }, // D-pad ↓
  { index: 14, action: "yawLeft", codes: ["ArrowLeft"] }, // D-pad ←
  { index: 15, action: "yawRight", codes: ["ArrowRight"] }, // D-pad →
];

// Eixos do layout standard.
export const AXES = {
  leftX: 0, // guinada (yaw)
  leftY: 1, // arfagem (pitch)
  rightX: 2, // câmera livre (futuro — já exposto como lookX)
  rightY: 3, // câmera livre (futuro — já exposto como lookY)
};

// Gatilhos analógicos contam como "pressionados" a partir daqui.
export const TRIGGER_THRESHOLD = 0.35;
