// Titã — a maior lua de Saturno, coberta por atmosfera laranja densa. Textura
// real (mosaico Cassini ISS da NASA/JPL, tingido no tom de haze) via LOD.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "titan",
  name: "Titã",
  type: "moon",
  parent: "saturn",
  realRadiusKm: 2574.7,
  moonDistanceKm: 1221870, // distância média a Saturno
  periodDays: 15.945,
  L0: 200,
  rotDays: 15.945,
  menuColor: "#d99a4e",
  hiresTextureUrl: "textures/2k_titan.jpg",
  makeTexture() {
    return rockyTexture({ base: "#c98a3e", dark: "#8a5a26", light: "#e0b060", seed: 71, craters: 12 });
  },
};
