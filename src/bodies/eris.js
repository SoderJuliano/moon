// Éris — planeta anão mais massivo que Plutão, no disco disperso (bem distante).
// (longitude aproximada)
import { icyTexture } from "../core/textures.js";

export default {
  id: "eris",
  name: "Éris",
  type: "dwarf",
  realRadiusKm: 1163,
  aAU: 67.78,
  periodDays: 204200,
  L0: 35,
  axialTilt: 78,
  rotDays: 1.08,
  menuColor: "#d2d2cf",
  hiresTextureUrl: "textures/2k_eris.jpg", // SolarSystemScope (LOD na aproximação)
  makeTexture() {
    return icyTexture({ base: "#d2d2cf", dark: "#9a9a96", light: "#ffffff", seed: 131 });
  },
};
