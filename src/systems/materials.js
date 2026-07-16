// MATERIAIS DOS ASTEROIDES — fonte única de verdade da composição das rochas.
//
// Um asteroide raramente é "de um material só": ele é MAJORITARIAMENTE de algo,
// com traços de outra coisa. A composição é DETERMINÍSTICA pelo id (o mesmo id
// sempre dá o mesmo resultado — nada é sorteado a cada frame), então o scanner,
// as missões de reboque e a COR da pedra concordam entre si.
//
// Consumido por:
//  • scanner.js       — rótulo/descrição imersiva ao escanear;
//  • asteroidBelt.js  — cor por instância (instanceColor) nos cinturões densos;
//  • asteroidSystem.js— material tingido dos asteroides de streaming;
//  • rockDelivery.js  — casa o material pedido pela missão.

import * as THREE from "three";

// materiais possíveis (os da ficha do scanner + gelo e cobre)
export const MATERIALS = ["Gelo", "Ferro", "Cobre", "Níquel", "Silício", "Titânio", "Magnésio"];

// ficha por material: cor VIVA (usada na UI/rótulo), glifo curto e uma nota de
// sabor. A cor do 3D é derivada desta (normalizada) em materialTint().
export const MATERIAL_INFO = {
  Gelo: { color: 0xbfe4ff, glyph: "❄", note: "voláteis e água congelada" },
  Ferro: { color: 0xc06a42, glyph: "Fe", note: "óxidos metálicos densos" },
  Cobre: { color: 0x37b08c, glyph: "Cu", note: "veios metálicos esverdeados" },
  Níquel: { color: 0x9fa889, glyph: "Ni", note: "liga ferro-níquel" },
  Silício: { color: 0xa998c6, glyph: "Si", note: "silicatos rochosos" },
  Titânio: { color: 0x7f95b6, glyph: "Ti", note: "metal leve e resistente" },
  Magnésio: { color: 0xd0cca4, glyph: "Mg", note: "minerais leves e claros" },
};

function hashId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// composição DETERMINÍSTICA pelo id:
//  { material (majoritário), concentration (55–95%), secondary (traço) }
export function composition(id) {
  const h = hashId(id);
  const material = MATERIALS[h % MATERIALS.length];
  const concentration = 55 + (h % 41); // 55–95%
  let secondary = MATERIALS[(h >> 3) % MATERIALS.length];
  if (secondary === material) secondary = MATERIALS[((h >> 3) + 1) % MATERIALS.length];
  return { material, concentration, secondary };
}

// classe pela concentração — dá nome imersivo ("rico"/"médio"/"pobre")
function grade(pct) {
  if (pct >= 85) return "rico";
  if (pct >= 70) return "de teor médio";
  return "de baixo teor";
}

// descrição pronta pra HUD do scanner. Nada de "é de ferro" seco: é um
// asteroide cuja composição é MAJORITARIAMENTE de um material.
export function describe(id) {
  const c = composition(id);
  return {
    ...c,
    title: `Asteroide ${grade(c.concentration)} de ${c.material}`,
    line: `${c.concentration}% ${c.material} · traços de ${c.secondary}`,
    note: MATERIAL_INFO[c.material].note,
  };
}

const _white = new THREE.Color(1, 1, 1);

// tint base de um material (multiplicador de brilho neutro: canal máximo = 1),
// misturado com branco pela força da tonalidade. Usado direto pelo streaming
// (cacheado por material) e via materialTint() pelos cinturões (por id).
export function tintForMaterial(name, concentration = 75, out = new THREE.Color()) {
  out.set(MATERIAL_INFO[name]?.color ?? 0x8d8175);
  const m = Math.max(out.r, out.g, out.b) || 1; // normaliza p/ máx = 1
  out.multiplyScalar(1 / m);
  const strength = 0.45 + (concentration / 100) * 0.4; // 0.45–0.85
  return out.lerp(_white, 1 - strength); // mistura com branco (tint suave)
}

// COR/TONALIDADE do 3D por id: a força da tonalidade cresce com a concentração
// (pedra rica puxa mais pro tom do material; pobre fica mais acinzentada).
// Determinística pelo id.
export function materialTint(id, out = new THREE.Color()) {
  const { material, concentration } = composition(id);
  return tintForMaterial(material, concentration, out);
}
