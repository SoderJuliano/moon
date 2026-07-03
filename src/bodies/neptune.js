// Netuno — gigante de gelo azul profundo, o planeta mais distante.
import { gasGiantTexture } from "../core/textures.js";

export default {
  id: "neptune",
  name: "Netuno",
  type: "planet",
  realRadiusKm: 24622,
  aAU: 30.11039,
  periodDays: 60189,
  L0: 304.88003,
  axialTilt: 28.32,
  rotDays: 0.671,
  roughness: 0.7,
  menuColor: "#3b5bd4",
  hiresTextureUrl: "textures/2k_neptune.jpg", // carregada só de perto (LOD por distância)
  makeTexture() {
    return gasGiantTexture({
      bands: ["#3b5bd4", "#2f49ad", "#4a6ae0", "#27408f", "#3f5fcf"],
      seed: 81,
      spot: { x: 0.4, y: 0.4, r: 0.8, color: "#1c2f6e" },
    });
  },
};
