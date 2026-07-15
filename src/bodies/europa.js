// Europa — lua gelada de Júpiter, superfície branca rachada por linhas (lineae).
// Textura procedural clara (poucas crateras: é lisa); dá pra plugar mapa NASA
// depois via hiresTextureUrl.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "europa",
  name: "Europa",
  type: "moon",
  parent: "jupiter",
  realRadiusKm: 1560.8,
  moonDistanceKm: 671100,
  periodDays: 3.551,
  L0: 240,
  rotDays: 3.551,
  menuColor: "#dcd2bd",
  hiresTextureUrl: "textures/2k_europa.jpg", // carrega de perto (LOD), qualquer modo
  makeTexture() {
    return rockyTexture({ base: "#d9cdb6", dark: "#a89a7e", light: "#f2ead6", seed: 52, craters: 8 });
  },
};
