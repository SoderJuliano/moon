// Saturno — gigante gasoso com o sistema de anéis mais famoso.
import { gasGiantTexture } from "../core/textures.js";

export default {
  id: "saturn",
  name: "Saturno",
  type: "planet",
  realRadiusKm: 58232,
  aAU: 9.55491,
  periodDays: 10759.22,
  L0: 49.94432,
  axialTilt: 26.73,
  rotDays: 0.446,
  roughness: 0.62,
  menuColor: "#e3c88f",
  realTextureUrl: "textures/2k_saturn.jpg", // NASA/SolarSystemScope (só no modo real)
  ring: {
    inner: 1.2,
    outer: 2.3,
    colors: { inner: "#e6d3a3", outer: "#b6a071" },
    realTextureUrl: "textures/2k_saturn_ring_alpha.png", // anel real com transparência
  },
  makeTexture() {
    return gasGiantTexture({
      bands: ["#efdcae", "#d9c089", "#f1e3bd", "#cbae74", "#e2cd9a"],
      seed: 61,
    });
  },
};
