// Ganimedes — a maior lua do Sistema Solar (maior que Mercúrio). Superfície
// cinza-amarronzada com sulcos e crateras. Textura procedural; NASA depois.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "ganymede",
  name: "Ganimedes",
  type: "moon",
  parent: "jupiter",
  realRadiusKm: 2634.1,
  moonDistanceKm: 1070400,
  periodDays: 7.155,
  L0: 40,
  rotDays: 7.155,
  menuColor: "#97897a",
  hiresTextureUrl: "textures/2k_ganymede.jpg", // carrega de perto (LOD), qualquer modo
  makeTexture() {
    return rockyTexture({ base: "#8f8577", dark: "#5f574a", light: "#b6ab98", seed: 63, craters: 70 });
  },
};
