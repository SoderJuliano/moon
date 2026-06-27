// Urano — gigante de gelo azul-esverdeado, eixo praticamente deitado.
import { gasGiantTexture } from "../core/textures.js";

export default {
  id: "uranus",
  name: "Urano",
  type: "planet",
  realRadiusKm: 25362,
  aAU: 19.21845,
  periodDays: 30685.4,
  L0: 313.23218,
  axialTilt: 97.77, // rola "deitado"
  rotDays: -0.718, // retrógrado
  ring: { inner: 1.4, outer: 1.9, colors: { inner: "#8fbfc7", outer: "#5f8a92" } },
  roughness: 0.7,
  menuColor: "#9fe0e0",
  makeTexture() {
    return gasGiantTexture({
      bands: ["#bdeaea", "#9fe0e0", "#aee6e6", "#8fd6d6", "#b4e8e8"],
      seed: 71,
    });
  },
};
