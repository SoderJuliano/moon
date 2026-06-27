// Lua — única lua modelada por enquanto (as demais ficam para depois).
// Reaproveita moon.jpg, mas esse arquivo é pesado (~13MB); usamos textura
// procedural por padrão para não estourar memória/loading em tablets.
import { rockyTexture } from "../core/textures.js";

export default {
  id: "moon",
  name: "Lua",
  type: "moon",
  parent: "earth",
  realRadiusKm: 1737.4,
  moonDistanceKm: 384400, // distância média à Terra (modo real: ~60 raios terrestres)
  periodDays: 27.3217,
  L0: 318, // fase aproximada em Jan 2026
  rotDays: 27.32, // travada por maré (gira junto com a órbita)
  menuColor: "#b8b8b8",
  makeTexture() {
    return rockyTexture({ base: "#b0b0b0", dark: "#6f6f6f", light: "#e2e2e2", seed: 33, craters: 90 });
  },
};
