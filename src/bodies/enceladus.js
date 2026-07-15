// Encélado — lua de Saturno, a mais reflexiva do Sistema Solar (gelo puro, jatos
// de água no polo sul). Branco brilhante, quase liso. Textura procedural clara.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "enceladus",
  name: "Encélado",
  type: "moon",
  parent: "saturn",
  realRadiusKm: 252.1,
  moonDistanceKm: 237948,
  periodDays: 1.370,
  L0: 60,
  rotDays: 1.370,
  menuColor: "#eef2f5",
  hiresTextureUrl: "textures/2k_enceladus.jpg", // carrega de perto (LOD), qualquer modo
  makeTexture() {
    return rockyTexture({ base: "#e8edf0", dark: "#c2ccd2", light: "#ffffff", seed: 74, craters: 12 });
  },
};
