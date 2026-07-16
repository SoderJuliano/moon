import { rockyTexture } from "../core/textures.js";

export default {
  id: "phobos",
  name: "Fobos",
  type: "moon",
  parent: "mars",
  realRadiusKm: 11.267,
  moonDistanceKm: 9377,
  periodDays: 0.31891,
  L0: 45,
  rotDays: 0.31891,
  lumpy: true,
  shapeScale: [1.0, 0.7, 0.85],
  menuColor: "#a1938b",
  hiresTextureUrl: "textures/2k_phobos.png",
  makeTexture() {
    return rockyTexture({ base: "#a1938b", dark: "#6e625a", light: "#d6c9c0", seed: 55, craters: 80 });
  },
};
