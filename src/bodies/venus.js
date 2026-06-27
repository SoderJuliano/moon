// Vênus — coberto por nuvens amareladas, rotação retrógrada lentíssima.
import { gasGiantTexture } from "../core/textures.js";

export default {
  id: "venus",
  name: "Vênus",
  type: "planet",
  realRadiusKm: 6051.8,
  aAU: 0.723332,
  periodDays: 224.701,
  L0: 181.97973,
  axialTilt: 177.4, // praticamente de cabeça para baixo
  rotDays: -243.0, // retrógrado, dia mais longo que o ano
  roughness: 1,
  menuColor: "#d9b36b",
  hiresTextureUrl: "textures/2k_venus_surface.jpg", // carregada só de perto (LOD)
  makeTexture() {
    return gasGiantTexture({
      bands: ["#e7c98a", "#d9b36b", "#c79a52", "#e3c179", "#cda75c"],
      seed: 21,
    });
  },
};
