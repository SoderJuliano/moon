// Júpiter — o gigante gasoso, com a Grande Mancha Vermelha.
import { gasGiantTexture } from "../core/textures.js";

export default {
  id: "jupiter",
  name: "Júpiter",
  type: "planet",
  realRadiusKm: 69911,
  aAU: 5.2026,
  periodDays: 4332.589,
  L0: 34.40438,
  axialTilt: 3.13,
  rotDays: 0.414, // dia mais curto do sistema solar (~10h)
  roughness: 0.62,
  menuColor: "#c8a17a",
  realTextureUrl: "textures/2k_jupiter.jpg", // NASA/SolarSystemScope (só no modo real)
  makeTexture() {
    return gasGiantTexture({
      bands: ["#d8c0a0", "#b88a5e", "#e3d2b6", "#a9744d", "#cdb293", "#9c6743"],
      seed: 51,
      spot: { x: 0.62, y: 0.62, r: 1.1, color: "#b5482e" },
    });
  },
};
