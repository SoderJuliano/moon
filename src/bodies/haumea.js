// Haumea — planeta anão gelado e alongado, no cinturão de Kuiper.
// (longitude aproximada — efemérides de TNOs são imprecisas para visualização)
import { icyTexture } from "../core/textures.js";

export default {
  id: "haumea",
  name: "Haumea",
  type: "dwarf",
  realRadiusKm: 798,
  aAU: 43.218,
  periodDays: 103774,
  L0: 240,
  axialTilt: 28,
  rotDays: 0.163, // gira muito rápido (~4h), por isso é alongada
  menuColor: "#e6e0d4",
  makeTexture() {
    return icyTexture({ base: "#e6e0d4", dark: "#a89f8d", light: "#ffffff", seed: 111 });
  },
};
