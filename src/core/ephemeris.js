// Efeméride simplificada.
//
// Usamos a longitude média de cada corpo (graus, no plano da eclíptica) na época
// J2000 e a taxa diária derivada do período orbital. Assim, ao "dar play" em
// 01/01/2026, cada planeta aparece na posição angular correta daquela data e
// avança no ritmo real (Mercúrio rápido, Netuno lentíssimo).
//
// Simplificações intencionais (planetário, não simulador): órbitas circulares e
// coplanares — ignoramos excentricidade e inclinação. As POSIÇÕES ANGULARES
// (quem está na frente de quem) ficam corretas, que é o que se percebe na cena.

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0); // 2000-01-01 12:00 TT
const START = Date.UTC(2026, 0, 1, 0, 0, 0); // ponto de partida pedido: Jan 2026

// Dias entre J2000 e o instante de partida (Jan 2026).
export const START_DAYS = (START - J2000) / 86400000;

const DEG2RAD = Math.PI / 180;

// Longitude heliocêntrica (rad) de um corpo após `simDays` dias de simulação
// contados a partir de Jan 2026.
export function longitudeRad(body, simDays) {
  const days = START_DAYS + simDays;
  const deg = body.L0 + (360 * days) / body.periodDays;
  return (deg % 360) * DEG2RAD;
}

// Mesmo cálculo para uma lua: longitude relativa ao planeta-pai.
export function moonLongitudeRad(moon, simDays) {
  const days = START_DAYS + simDays;
  const deg = moon.L0 + (360 * days) / moon.periodDays;
  return (deg % 360) * DEG2RAD;
}

// Data simulada atual (para exibir na HUD).
export function simDate(simDays) {
  return new Date(START + simDays * 86400000);
}
