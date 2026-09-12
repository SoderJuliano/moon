// Bootstrap da aplicação: menu inicial → modo escolhido.
//
// Dois produtos sobre a mesma engine:
//   • Exploration Mode (app/explorationMode.js) — o planetário interativo,
//     conceitualmente congelado.
//   • Game Mode (app/gameMode.js) — jogo de exploração espacial pilotando a
//     nave; é onde as novas mecânicas serão adicionadas.
// A construção do Sistema Solar é compartilhada (app/world.js) — nenhum modo
// tem implementação própria do mundo.
//
// Atalho de desenvolvimento: ?mode=exploration ou ?mode=game pula o menu.

import { startMainMenu } from "./app/mainMenu.js";
import { input } from "./input/InputManager.js";

// Inicializa o gerenciador de entrada globalmente para suportar controle no menu inicial
input.start();

async function startMode(mode, opts) {
  if (mode === "game") {
    const { startGameMode } = await import("./app/gameMode.js");
    startGameMode(opts); // { resume: true|false } do menu; ?mode=game = "auto"
  } else if (mode === "vela") {
    const { startVelaMode } = await import("./app/velaMode.js");
    startVelaMode({ onExit: () => startMainMenu({ onSelect: startMode }) });
  } else {
    const { startExplorationMode } = await import("./app/explorationMode.js");
    startExplorationMode();
  }
}

const requested = new URLSearchParams(location.search).get("mode");
if (requested === "game" || requested === "exploration" || requested === "vela") startMode(requested);
else startMainMenu({ onSelect: startMode });
