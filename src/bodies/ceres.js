// Ceres — planeta anão no cinturão de asteroides (entre Marte e Júpiter).
import { rockyTexture } from "../core/textures.js";

export default {
  id: "ceres",
  name: "Ceres",
  type: "dwarf",
  realRadiusKm: 473,
  aAU: 2.7675,
  periodDays: 1681.6,
  L0: 95.9888,
  axialTilt: 4,
  rotDays: 0.378,
  menuColor: "#8a8175",
  hiresTextureUrl: "textures/2k_ceres.jpg", // SolarSystemScope (LOD na aproximação)
  makeTexture() {
    return rockyTexture({ base: "#8a8175", dark: "#544c43", light: "#b3a896", seed: 91, craters: 80 });
  },
};
