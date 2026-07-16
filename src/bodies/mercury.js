// Mercúrio — pequeno, rochoso e craterizado.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "mercury",
  name: "Mercúrio",
  type: "planet",
  realRadiusKm: 2439.7,
  aAU: 0.387098,
  periodDays: 87.969,
  L0: 252.25084, // longitude média J2000
  axialTilt: 0.03,
  rotDays: 58.65,
  menuColor: "#9c8b7d",
  hiresTextureUrl: "textures/2k_mercury.jpg", // carregada só de perto (LOD por distância)
  makeTexture() {
    return rockyTexture({ base: "#9c8b7d", dark: "#5b5046", light: "#cbb9a6", seed: 11, craters: 70 });
  },
};
