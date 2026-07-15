// Io — a mais vulcânica lua de Júpiter (amarela de enxofre). A textura real
// (mosaico Galileo/Voyager da USGS/NASA, domínio público) carrega só de perto
// via LOD; de longe usa a procedural leve.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "io",
  name: "Io",
  type: "moon",
  parent: "jupiter",
  realRadiusKm: 1821.6,
  moonDistanceKm: 421700, // distância média a Júpiter
  periodDays: 1.769, // órbita (também travada por maré)
  L0: 120, // fase inicial (arbitrária, só pra distribuir as luas)
  rotDays: 1.769,
  menuColor: "#d9c26a",
  hiresTextureUrl: "textures/2k_io.jpg",
  makeTexture() {
    return rockyTexture({ base: "#c9a94e", dark: "#8a6a2a", light: "#e8d488", seed: 44, craters: 30 });
  },
};
