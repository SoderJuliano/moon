// Plutão — planeta anão clássico, gelado, além de Netuno.
import { icyTexture } from "../core/textures.js";

export default {
  id: "pluto",
  name: "Plutão",
  type: "dwarf",
  realRadiusKm: 1188.3,
  aAU: 39.4821,
  periodDays: 90560,
  L0: 238.92881,
  axialTilt: 122.5,
  rotDays: -6.39, // retrógrado
  menuColor: "#cbb79c",
  // mapa REAL (New Horizons/NASA); hemisfério sul nunca fotografado preenchido
  // com o mapa do Steve Albers (SOS). Carregada por LOD na aproximação.
  hiresTextureUrl: "textures/2k_pluto.jpg",
  makeTexture() {
    return icyTexture({ base: "#cbb79c", dark: "#7e6b54", light: "#efe3cf", seed: 101 });
  },
};
