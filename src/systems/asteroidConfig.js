// Configuração/fábrica do AsteroidSystem: define a DISTRIBUIÇÃO dos campos e liga
// tudo. Mantém o main.js enxuto e deixa os "níveis" (onde há pedras) num só lugar,
// fácil de evoluir (cinturões completos, estações, sondas no futuro).

import { AsteroidSystem } from "./asteroidSystem.js";
import { AsteroidField } from "./asteroidField.js";

// Distribuição natural e ESPARSA (não encher o universo de pedras):
//  • pequenos grupos perto de alguns planetas;
//  • início de um cinturão (fragmento de anel) entre Marte e Júpiter;
//  • alguns errantes isolados.
// Campos ancorados ficam FORA da bolha gigante do planeta (ver AsteroidField).
const FIELD_DEFS = [
  // grupos perto de planetas
  { id: "mars-rocks", kind: "cluster", anchorId: "mars", count: 14,
    models: ["rocksSmall", "rockSingle", "rockHi"], scaleRange: [0.04, 0.22],
    spinRange: [0.05, 0.4], drift: 0.002, spread: 9, seed: 1011 },
  { id: "jupiter-rocks", kind: "cluster", anchorId: "jupiter", count: 20,
    models: ["rocksSmall", "rockHi", "rockSingle"], scaleRange: [0.06, 0.5],
    spinRange: [0.04, 0.35], drift: 0.0015, spread: 16, seed: 2022 },
  { id: "saturn-rocks", kind: "cluster", anchorId: "saturn", count: 10,
    models: ["rocksSmall", "rockSingle"], scaleRange: [0.05, 0.3],
    spinRange: [0.05, 0.3], drift: 0.002, spread: 11, seed: 3033 },

  // início de cinturão (fragmento de anel) — ancorado a Marte, voltado p/ fora
  { id: "belt-fragment", kind: "belt", anchorId: "mars",
    torus: { R: 26, r: 4 }, count: 40,
    models: ["rocksSmall", "rockSingle", "rockHi", "rocksField"], scaleRange: [0.05, 0.35],
    spinRange: [0.03, 0.25], drift: 0.0015, seed: 4044 },

  // errantes isolados
  { id: "earth-wanderers", kind: "scatter", anchorId: "earth", count: 6,
    models: ["rockSingle", "rockHi"], scaleRange: [0.05, 0.4],
    spinRange: [0.02, 0.15], drift: 0.003, spread: 30, seed: 5055 },
  { id: "neptune-wanderers", kind: "scatter", anchorId: "neptune", count: 5,
    models: ["rockSingle", "rockHi"], scaleRange: [0.06, 0.45],
    spinRange: [0.02, 0.15], drift: 0.0025, spread: 24, seed: 6066 },
];

// Cria o sistema, registra os campos e dispara o carregamento dos modelos (async,
// não bloqueia). Retorna o sistema pronto p/ receber update()/hitTest() no loop.
export function createAsteroidSystem(scene, getBody) {
  const system = new AsteroidSystem(scene, { getBody, streamRadius: 38 });
  for (const def of FIELD_DEFS) system.addField(new AsteroidField(def));
  system.load(); // fire-and-forget; update() só instancia depois de carregado
  return system;
}
