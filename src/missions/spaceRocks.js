// Missões de reboque de rochas — a 1ª (primária) dá o SCANNER; ela libera a
// SÉRIE SECUNDÁRIA de coletas tipadas, encadeadas, que ocupa o jogador. Toda a
// mecânica vem da fábrica reutilizável (rockDelivery). Concluir a série toda →
// conquista "Trabalhador Espacial".

import { createRockDeliveryMission } from "./rockDelivery.js";
import { emit } from "../game/events.js";
import { t } from "../core/i18n.js";

// 1ª missão de rochas: 5 quaisquer → recompensa SCANNER (progressão principal)
export function createSpaceRocksMission(scene) {
  return createRockDeliveryMission(scene, {
    id: "space-rocks",
    title: t("mission.rocks.primaryTitle"),
    kind: "primary",
    goal: 5,
    material: null,
    reward: (ctx) => {
      emit("milestone", { id: "space-tow" }); // conquista "Reboque Espacial"
      ctx.scanner?.grant(); // recompensa: scanner equipável
    },
    onDone: (ctx) => ctx.mgr.makeAvailable("sec-ferro"), // abre a série secundária
  });
}

// Série SECUNDÁRIA (pós-scanner): coletas tipadas encadeadas. O scanner é o que
// torna viável achar o material certo. Concluir todas → "Trabalhador Espacial".
export function createRockChores(scene) {
  return [
    createRockDeliveryMission(scene, {
      id: "sec-ferro", title: t("mission.rocks.secIronTitle"), kind: "secondary",
      goal: 10, material: "Ferro",
      onDone: (ctx) => ctx.mgr.makeAvailable("sec-gelo"),
    }),
    createRockDeliveryMission(scene, {
      id: "sec-gelo", title: t("mission.rocks.secIceTitle"), kind: "secondary",
      goal: 10, material: "Gelo",
      onDone: (ctx) => {
        emit("milestone", { id: "space-worker" }); // conquista final da série
        ctx.mgr.stationSay(t("mission.rocks.allDoneDialog"), 7);
      },
    }),
  ];
}
