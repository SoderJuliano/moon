// Escalas de visualização — dois modos bem diferentes:
//
//  • FANTASIA (default): tamanhos e distâncias COMPRIMIDOS e estilizados, tudo
//    pertinho e visível ao mesmo tempo. Raios "achatados" (expoente 0.4) pra os
//    pequenos não sumirem e os gigantes não dominarem.
//
//  • REAL: proporções VERDADEIRAS de tamanho e distância. Unidade = 1 raio
//    terrestre. Então a Terra tem raio 1 e fica a ~23.480 unidades do Sol; o Sol
//    tem raio ~109 (parece uma lâmpada distante de longe); a Lua, raio ~0.27 a
//    60 unidades da Terra (quase invisível); Saturno, um pontinho lá longe.
//    É a realidade — só navegável de verdade indo até cada corpo pelo menu.

const EARTH_RADIUS_KM = 6371;
const AU_KM = 149_597_870.7;
const AU_IN_EARTH_RADII = AU_KM / EARTH_RADIUS_KM; // ~23480

// --- Fantasia --------------------------------------------------------------
const EARTH_VISUAL_RADIUS = 4;
export const SUN_VISUAL_RADIUS = 36;
const FANTASY_BASE = 72;
const FANTASY_K = 60;

// Raio de um corpo (unidades de cena) conforme o modo.
export function bodyRadius(realRadiusKm, mode, isSun = false) {
  if (mode === "real") return realRadiusKm / EARTH_RADIUS_KM; // proporção real
  if (isSun) return SUN_VISUAL_RADIUS;
  return Math.max(1.6, EARTH_VISUAL_RADIUS * Math.pow(realRadiusKm / EARTH_RADIUS_KM, 0.4));
}

// Raio da órbita ao redor do Sol (unidades de cena) conforme o modo.
export function orbitRadius(aAU, mode) {
  if (mode === "real") return aAU * AU_IN_EARTH_RADII; // distância verdadeira
  return FANTASY_BASE + FANTASY_K * Math.sqrt(aAU);
}

// Raio da órbita de uma lua ao redor do planeta.
//  • real: distância verdadeira (km do planeta / raio terrestre)
//  • fantasia: múltiplo do raio (comprimido) do planeta, pra ficar visível perto
export function moonOrbitRadius(planetFantasyRadius, moonDistanceKm, mode) {
  if (mode === "real") {
    if (typeof window !== "undefined" && window.isGameMode) {
      return (moonDistanceKm / EARTH_RADIUS_KM) * 5;
    }
    return moonDistanceKm / EARTH_RADIUS_KM;
  }
  return planetFantasyRadius * 4.5;
}
