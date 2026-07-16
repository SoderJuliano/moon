// Catálogo de DESCOBERTAS — os "cards" que o jogador pode desbloquear.
//
// Só dados, nenhuma lógica: quem decide QUANDO desbloquear é o
// AchievementSystem (via eventos); quem desenha é a UI (popup/tela).
//
// Categorias:
//   • Planetas — derivados AUTOMATICAMENTE de bodies/index.js (Sol, planetas,
//     anões e luas): corpo novo no sistema = descoberta nova, sem tocar aqui.
//   • Pontos de interesse — destroço, clusters de asteroides, rede de satélites
//     (e futuras estações/bases: é só adicionar uma linha + emitir o evento).
//   • Marcos — "primeira vez" de ações (colisão, disparo, supercruise…).
//
// item = { id, name, category, color? (bolinha de planeta) | icon? (emoji),
//          subtitle (texto da popup) }

import { MENU_ORDER, MOONS } from "../bodies/index.js";
import { t, hasLangKey } from "../core/i18n.js";

export const CATEGORIES = {
  PLANETS: "Planetas",
  POI: "Pontos de interesse",
  MARKS: "Marcos",
};

export function buildCatalog() {
  const items = [];

  // corpos celestes (Sol + planetas + anões) e luas
  for (const d of MENU_ORDER) {
    items.push({
      id: `body:${d.id}`,
      name: d.name,
      category: CATEGORIES.PLANETS,
      color: d.menuColor,
      subtitle: "Primeira visita",
    });
  }
  for (const moons of Object.values(MOONS)) {
    for (const m of moons) {
      items.push({
        id: `body:${m.id}`,
        name: m.name,
        category: CATEGORIES.PLANETS,
        color: m.menuColor || "#9aa3b0",
        subtitle: "Primeira visita",
      });
    }
  }

  // pontos de interesse
  items.push(
    { id: "poi:wreck", name: "Nave abandonada", category: CATEGORIES.POI, icon: "🛸", subtitle: "Ponto de interesse" },
    { id: "poi:region-belt", name: "Cinturão de asteroides", category: CATEGORIES.POI, icon: "☄️", subtitle: "Ponto de interesse" },
    { id: "poi:region-belt-saturn", name: "Cinturão de Saturno", category: CATEGORIES.POI, icon: "☄️", subtitle: "Ponto de interesse" },
    { id: "poi:region-kuiper", name: "Cinturão de Kuiper", category: CATEGORIES.POI, icon: "❄️", subtitle: "Ponto de interesse" },
    { id: "poi:satnet", name: "Rede de satélites", category: CATEGORIES.POI, icon: "🛰️", subtitle: "Ponto de interesse" }
  );

  // marcos ("primeira vez")
  items.push(
    { id: "mark:first-collision", name: "Primeira colisão", category: CATEGORIES.MARKS, icon: "💢", subtitle: "Marco" },
    { id: "mark:first-shot", name: "Primeiro disparo", category: CATEGORIES.MARKS, icon: "💥", subtitle: "Marco" },
    { id: "mark:first-supercruise", name: "Primeira supercruise", category: CATEGORIES.MARKS, icon: "🚀", subtitle: "Marco" },
    { id: "mark:weapon-unlocked", name: "Armas online", category: CATEGORIES.MARKS, icon: "⚡", subtitle: "Marco" },
    // surpresas por estatística (thresholds no AchievementSystem)
    { id: "mark:asteroid-hunter", name: "Caçador de Asteroides", category: CATEGORIES.MARKS, icon: "☄️", subtitle: "50 asteroides destruídos" },
    { id: "mark:alien-defeated", name: "Defensor do Sistema Solar", category: CATEGORIES.MARKS, icon: "🛡️", subtitle: "Repeliu a nave alienígena" },
    { id: "mark:alien-tech-home", name: "Tecnologia de Outro Mundo", category: CATEGORIES.MARKS, icon: "🛸", subtitle: "Rebocou um objeto alienígena até a Terra" },
    { id: "mark:space-tow", name: "Reboque Espacial", category: CATEGORIES.MARKS, icon: "🪝", subtitle: "Rebocou 5 rochas para análise na estação" },
    { id: "mark:space-worker", name: "Trabalhador Espacial", category: CATEGORIES.MARKS, icon: "👷", subtitle: "Concluiu todas as coletas secundárias" },
    { id: "mark:neptune-cleared", name: "Sentinela de Netuno", category: CATEGORIES.MARKS, icon: "🌊", subtitle: "Eliminou as criaturas na órbita de Netuno" },
    { id: "mark:twins-defeated", name: "Caçador de Gigantes", category: CATEGORIES.MARKS, icon: "🏆", subtitle: "Derrubou os Gêmeos do Ocaso — Eclipse e Vórtice" }
  );

  return items.map((item) => {
    let displayName = item.name;
    let displaySub = item.subtitle;
    if (item.id.startsWith("body:")) {
      const bodyId = item.id.substring(5);
      const bodyKey = "body." + bodyId;
      displayName = hasLangKey(bodyKey) ? t(bodyKey) : item.name;
      displaySub = hasLangKey("discovery.firstVisit") ? t("discovery.firstVisit") : item.subtitle;
    } else {
      displayName = hasLangKey("discovery.name." + item.id) ? t("discovery.name." + item.id) : item.name;
      displaySub = hasLangKey("discovery.sub." + item.id) ? t("discovery.sub." + item.id) : item.subtitle;
    }
    return {
      ...item,
      name: displayName,
      subtitle: displaySub,
    };
  });
}
