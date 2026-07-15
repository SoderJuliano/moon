// Reia — segunda maior lua de Saturno, gelo sujo cinza fortemente craterado.
// Textura procedural (muitas crateras); NASA depois.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "rhea",
  name: "Reia",
  type: "moon",
  parent: "saturn",
  realRadiusKm: 763.8,
  moonDistanceKm: 527108,
  periodDays: 4.518,
  L0: 300,
  rotDays: 4.518,
  menuColor: "#c2bfb8",
  hiresTextureUrl: "textures/2k_rhea.jpg", // carrega de perto (LOD), qualquer modo
  makeTexture() {
    return rockyTexture({ base: "#b6b3ab", dark: "#7c7970", light: "#dcd8ce", seed: 85, craters: 90 });
  },
};
