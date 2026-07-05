// Haumea — planeta anão gelado e alongado, no cinturão de Kuiper.
// (longitude aproximada — efemérides de TNOs são imprecisas para visualização)
import { icyTexture } from "../core/textures.js";

export default {
  id: "haumea",
  name: "Haumea",
  type: "dwarf",
  realRadiusKm: 1161, // semieixo MAIOR (o raio médio é ~798 km; ver shapeScale)
  aAU: 43.218,
  periodDays: 103774,
  L0: 240,
  axialTilt: 28,
  rotDays: 0.163, // gira muito rápido (~4h), por isso é alongada
  // Elipsoide triaxial real: semieixos ~1161×513×852 km normalizados pelo
  // maior (nenhum componente >1 — colisão/aproximação assumem esfera de raio 1).
  // Y é o eixo polar (o mais curto — o giro rápido achatou o corpo).
  shapeScale: [1, 0.44, 0.73],
  menuColor: "#e6e0d4",
  hiresTextureUrl: "textures/2k_haumea.jpg", // SolarSystemScope (LOD na aproximação)
  makeTexture() {
    return icyTexture({ base: "#e6e0d4", dark: "#a89f8d", light: "#ffffff", seed: 111 });
  },
};
