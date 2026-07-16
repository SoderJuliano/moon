import { rockyTexture } from "../core/textures.js";

export default {
  id: "deimos",
  name: "Deimos",
  type: "moon",
  parent: "mars",
  realRadiusKm: 6.2,
  moonDistanceKm: 23460,
  periodDays: 1.26244,
  L0: 180,
  rotDays: 1.26244,
  lumpy: true,
  shapeScale: [1.0, 0.75, 0.8],
  menuColor: "#8b8175",
  hiresTextureUrl: "textures/2k_deimos.png",
  makeTexture() {
    return rockyTexture({ base: "#8b8175", dark: "#5d544b", light: "#baa896", seed: 66, craters: 60 });
  },
};
