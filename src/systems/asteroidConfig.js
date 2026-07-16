// Configuração do sistema de asteroides: define as regiões do Sistema Solar
// e como o jogador as encontra. Mantém o main.js enxuto.
//
// REGIÕES (ancoradas nos planetas correspondentes):
//  • Cinturão Principal — DENSO e instanciado (AsteroidBelt, ~2.200 pedras) a
//    ~680u de Júpiter; a nave entra ALINHADA a ele e o atravessa (labirinto).
//  • Cinturão de Saturno — segundo cinturão denso, ~20% MAIOR (~3.800 pedras) a
//    ~690u de Saturno; mesma mecânica de entrada alinhada.
//  • Zona Troiana — 3 clusters menores entre o cinturão e Júpiter (~540u).
//  • Proximidade de Marte — 3 clusters esparsos no caminho de aproximação.
//  • Proximidade de Saturno — 2 clusters na abordagem de Saturno.
//  • NEOs (Terra) — 3 campos muito esparsos para dar vida ao espaço interno.
//  • Cinturão de Kuiper (Netuno) — 4 campos espalhados e raros.

import * as THREE from "three";
import { AsteroidSystem } from "./asteroidSystem.js";
import { AsteroidField } from "./asteroidField.js";
import { AsteroidBelt } from "./asteroidBelt.js";
import { AsteroidEncounter } from "./asteroidEncounter.js";

// Entrada da nave por corpo: mul substitui o padrão 2.4× e dir FIXA o lado de
// entrada (direção planeta→spawn, em mundo). Com dir igual ao eixo do cinturão,
// ele fica SEMPRE entre o spawn e o planeta — impossível passar ao largo.
// Lido pelo ShipFlight via callback getEntryInfo(bodyId).
export const ENTRY_OVERRIDES = {
  jupiter: { mul: 2.2, dir: [1, 0.02, 0] }, // spawn ~966u; cinturão em 560–800u no caminho
  saturn: { mul: 2.6, dir: [1, 0.03, 0.1] }, // spawn ~953u; cinturão em 546–834u no caminho
  // Urano não tem cinturão (sem dir): só afasta o spawn — o anel é enorme
  // (raio ~302u inflado) e com o 2.4 padrão a nave nascia colada nele.
  uranus: { mul: 3.2 },
  neptune: { mul: 2.8, dir: [1, 0.04, 0.05] }, // spawn ~433u; kuiper-0 a ~310u no caminho
};

// ---- Cinturões densos (instanciados) ----------------------------------------
// halfExtents [tangencial, vertical, radial]: comprido ao longo do anel orbital,
// achatado na vertical, espessura radial ≈ tempo de travessia em boost.
// dir de cada um = mesmo eixo do ENTRY_OVERRIDES do planeta âncora.
const BELT_DEFS = [
  // Júpiter — ~2.200 pedras ⇒ espaçamento médio ~19u: cheio, mas com corredores.
  {
    id: "main-belt",
    anchorId: "jupiter",
    dir: [1, 0.02, 0],
    dist: 680,
    halfExtents: [230, 70, 120],
    count: 2200,
    seed: 9001,
  },
  // Saturno — 20% maior em cada eixo; count acompanha o volume (×1.73) para
  // manter o MESMO espaçamento (~19u). triBudget maior: com o padrão de 550k
  // o corte por modelo derrubaria o total para ~2.350 pedras.
  // No caminho de entrada (546–834u), com saturn-0 logo depois da saída (500u).
  {
    id: "saturn-belt",
    anchorId: "saturn",
    dir: [1, 0.03, 0.1],
    dist: 690,
    halfExtents: [276, 84, 144],
    count: 3800,
    triBudget: 1_000_000,
    seed: 9002,
  },
];

// ---- Pontos de interesse das regiões (atalhos do menu) ----------------------
// Cada região vira um "corpo virtual": clicável no menu (a câmera voa até lá),
// marcador de navegação e corpo de referência da nave (W entra pilotando rumo
// ao campo). O centro acompanha o planeta âncora — mesma conta do AsteroidField.
export const REGION_POIS = [
  { id: "region-belt", name: "Cinturão", menuColor: "#b59a76",
    anchorId: "jupiter", offsetDir: [1, 0.02, 0], offsetDist: 680, entryRadius: 35 }, // = main-belt
  { id: "region-belt-saturn", name: "Cint. Saturno", menuColor: "#c9b183",
    anchorId: "saturn", offsetDir: [1, 0.03, 0.1], offsetDist: 690, entryRadius: 42 }, // = saturn-belt
  { id: "region-kuiper", name: "Kuiper", menuColor: "#9fb8d0",
    anchorId: "neptune", offsetDir: [1, 0.04, 0.05], offsetDist: 310, entryRadius: 60 }, // = kuiper-0
];

// Corpo virtual com a interface mínima que CameraRig/ShipFlight esperam.
// radius pequeno: a gravidade (∝ r²) fica desprezível — região não "suga" a
// nave pro centro invisível do cluster. approachRadius define a distância de
// entrada da nave (entryRadius × 2.4 do centro → nasce fora e atravessa o campo).
export function createRegionBodies(getBody) {
  return REGION_POIS.map((poi) => {
    const dir = new THREE.Vector3(...poi.offsetDir).normalize();
    return {
      id: poi.id,
      name: poi.name,
      descriptor: { type: "region", menuColor: poi.menuColor },
      radius: 8,
      baseRadius: 8,
      approachRadius: poi.entryRadius,
      moons: [],
      setApproach() {}, // região não infla na aproximação (planetas inflam)
      worldPosition(out) {
        const anchor = getBody(poi.anchorId);
        if (anchor) anchor.worldPosition(out);
        else out.set(0, 0, 0);
        return out.addScaledVector(dir, poi.offsetDist);
      },
    };
  });
}

// ---- Campos (esparsos, via streaming) ---------------------------------------
const FIELD_DEFS = [
  // --- Zona Troiana (entre o cinturão e Júpiter) ----------------------------
  { id: "trojan-0", kind: "cluster", anchorId: "jupiter",
    offsetDist: 540, offsetDir: [0.866, 0.05, 0.5],
    count: 12, models: ["rockSingle", "rockHi", "rocksSmall"],
    scaleRange: [0.03, 0.35], spinRange: [0.03, 0.35], drift: 0.001, spread: 18, seed: 5501 },
  { id: "trojan-1", kind: "cluster", anchorId: "jupiter",
    offsetDist: 555, offsetDir: [-0.5, -0.04, 0.866],
    count: 10, models: ["rockSingle", "rocksSmall", "rockHi"],
    scaleRange: [0.03, 0.3], spinRange: [0.04, 0.4], drift: 0.0012, spread: 15, seed: 5502 },
  { id: "trojan-2", kind: "cluster", anchorId: "jupiter",
    offsetDist: 535, offsetDir: [0.1, 0.03, -1],
    count: 14, models: ["rocksField", "rockSingle", "rockHi"],
    scaleRange: [0.04, 0.4], spinRange: [0.03, 0.3], drift: 0.0009, spread: 20, seed: 5503 },

  // --- Proximidade de Marte -------------------------------------------------
  // Entre o spawn (~146u) e a zona de aproximação (~60u) → detectável na chegada
  { id: "mars-0", kind: "cluster", anchorId: "mars",
    offsetDist: 88, offsetDir: [1, 0.05, 0.2],
    count: 14, models: ["rocksSmall", "rockSingle", "rockHi"],
    scaleRange: [0.04, 0.3], spinRange: [0.05, 0.4], drift: 0.002, spread: 25, seed: 3301 },
  { id: "mars-1", kind: "cluster", anchorId: "mars",
    offsetDist: 95, offsetDir: [-0.8, -0.04, 0.6],
    count: 10, models: ["rockSingle", "rocksSmall"],
    scaleRange: [0.03, 0.22], spinRange: [0.04, 0.35], drift: 0.0025, spread: 20, seed: 3302 },
  { id: "mars-2", kind: "scatter", anchorId: "mars",
    offsetDist: 105, offsetDir: [0.3, 0.08, -0.95],
    count: 8, models: ["rockHi", "rockSingle"],
    scaleRange: [0.04, 0.28], spinRange: [0.02, 0.2], drift: 0.003, spread: 35, seed: 3303 },

  // --- Proximidade de Saturno -----------------------------------------------
  // Saturno: giantRadius≈366u, spawn≈882u. Clusters a 500u: entre spawn e planeta.
  { id: "saturn-0", kind: "cluster", anchorId: "saturn",
    offsetDist: 500, offsetDir: [1, 0.03, 0.1],
    count: 18, models: ["rocksSmall", "rocksField", "rockSingle"],
    scaleRange: [0.05, 0.45], spinRange: [0.04, 0.35], drift: 0.0015, spread: 38, seed: 4401 },
  { id: "saturn-1", kind: "scatter", anchorId: "saturn",
    offsetDist: 520, offsetDir: [-0.7, -0.06, 0.714],
    count: 12, models: ["rockSingle", "rockHi", "rocksSmall"],
    scaleRange: [0.04, 0.35], spinRange: [0.03, 0.3], drift: 0.002, spread: 50, seed: 4402 },

  // --- NEOs — Terra ---------------------------------------------------------
  // Terra: giantRadius=60u, spawn=146u. Muito esparsos, só para dar vida.
  { id: "neo-0", kind: "scatter", anchorId: "earth",
    offsetDist: 112, offsetDir: [0.9, 0.1, 0.44],
    count: 4, models: ["rockSingle", "rockHi"],
    scaleRange: [0.04, 0.28], spinRange: [0.02, 0.15], drift: 0.003, spread: 55, seed: 2201 },
  { id: "neo-1", kind: "scatter", anchorId: "earth",
    offsetDist: 118, offsetDir: [-0.6, -0.05, 0.8],
    count: 3, models: ["rockHi", "rockSingle"],
    scaleRange: [0.05, 0.32], spinRange: [0.02, 0.18], drift: 0.0035, spread: 65, seed: 2202 },
  { id: "neo-2", kind: "scatter", anchorId: "earth",
    offsetDist: 108, offsetDir: [0.1, 0.08, -1],
    count: 4, models: ["rockSingle", "rocksSmall"],
    scaleRange: [0.03, 0.24], spinRange: [0.03, 0.2], drift: 0.004, spread: 50, seed: 2203 },

  // --- Cinturão de Kuiper — Netuno ------------------------------------------
  // Netuno: giantRadius≈154.5u, spawn_novo≈434u. Muito espalhado, objetos raros.
  // Espalhado mas VISÍVEL: com streamRadius 60, ~3-5 pedras à vista dentro do
  // campo (menos que isso o jogador atravessa sem notar nada).
  { id: "kuiper-0", kind: "scatter", anchorId: "neptune",
    offsetDist: 310, offsetDir: [1, 0.04, 0.05],
    count: 26, models: ["rockHi", "rockSingle", "rocksSmall"],
    scaleRange: [0.05, 0.65], spinRange: [0.01, 0.2], drift: 0.001, spread: 120, seed: 7701 },
  { id: "kuiper-1", kind: "scatter", anchorId: "neptune",
    offsetDist: 340, offsetDir: [-0.85, -0.03, 0.527],
    count: 20, models: ["rockSingle", "rockHi"],
    scaleRange: [0.06, 0.7], spinRange: [0.01, 0.18], drift: 0.0008, spread: 130, seed: 7702 },
  { id: "kuiper-2", kind: "scatter", anchorId: "neptune",
    offsetDist: 295, offsetDir: [0.3, 0.06, -0.954],
    count: 30, models: ["rocksSmall", "rockHi", "rockSingle"],
    scaleRange: [0.05, 0.6], spinRange: [0.01, 0.22], drift: 0.0012, spread: 110, seed: 7703 },
  { id: "kuiper-3", kind: "scatter", anchorId: "neptune",
    offsetDist: 325, offsetDir: [-0.5, 0.04, -0.866],
    count: 22, models: ["rockSingle", "rocksSmall", "rockHi"],
    scaleRange: [0.06, 0.75], spinRange: [0.01, 0.15], drift: 0.0009, spread: 125, seed: 7704 },
];

// Cria o sistema, registra os campos e dispara o carregamento. Retorna
// { asteroids, encounter } prontos para uso no loop principal.
export function createAsteroidSystem(scene, getBody, getBodies) {
  const system = new AsteroidSystem(scene, { getBody, streamRadius: 60, poolCap: 32 });

  for (const def of BELT_DEFS) system.addBelt(new AsteroidBelt(def));
  for (const def of FIELD_DEFS) system.addField(new AsteroidField(def));

  system.load(); // fire-and-forget

  const encounter = new AsteroidEncounter(system, { getBodies });
  return { asteroids: system, encounter };
}
