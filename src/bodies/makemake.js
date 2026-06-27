// Makemake — planeta anão avermelhado no cinturão de Kuiper.
// (longitude aproximada)
import { icyTexture } from "../core/textures.js";

export default {
  id: "makemake",
  name: "Makemake",
  type: "dwarf",
  realRadiusKm: 715,
  aAU: 45.43,
  periodDays: 111845,
  L0: 180,
  axialTilt: 20,
  rotDays: 0.937,
  menuColor: "#b07a5a",
  makeTexture() {
    return icyTexture({ base: "#b07a5a", dark: "#6e4630", light: "#d8a787", seed: 121 });
  },
};
