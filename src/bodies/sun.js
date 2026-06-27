// Sol — estrela central. Fica na origem; emite luz para todo o sistema.
import { starTexture } from "../core/textures.js";

export default {
  id: "sun",
  name: "Sol",
  type: "star",
  isSun: true,
  realRadiusKm: 696000, // ~109x a Terra (no modo real fica imenso, mas distante)
  aAU: 0,
  periodDays: 1e9, // imóvel
  L0: 0,
  rotDays: 25, // rotação do Sol ~25 dias
  menuColor: "#ffcc55",
  hiresTextureUrl: "textures/2k_sun.jpg", // fotosfera real, carregada só de perto (LOD)
  makeTexture() {
    return starTexture({ core: "#fff6d0", mid: "#ffcc55", edge: "#ff8a2b", seed: 7 });
  },
};
