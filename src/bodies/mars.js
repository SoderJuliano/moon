// Marte — o planeta vermelho.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "mars",
  name: "Marte",
  type: "planet",
  realRadiusKm: 3389.5,
  aAU: 1.523679,
  periodDays: 686.98,
  L0: 355.45332,
  axialTilt: 25.19,
  rotDays: 1.026,
  menuColor: "#c1440e",
  hiresTextureUrl: "textures/2k_mars.jpg", // carregada só de perto (LOD por distância)
  makeTexture() {
    return rockyTexture({ base: "#c1440e", dark: "#7a2b09", light: "#e08552", seed: 41, craters: 50 });
  },
};
