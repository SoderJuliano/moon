// Registro central de corpos. Cada planeta vive no seu próprio arquivo e traz
// a própria textura; aqui só montamos a ordem e o mapa pai->luas.

import sun from "./sun.js";
import mercury from "./mercury.js";
import venus from "./venus.js";
import earth from "./earth.js";
import mars from "./mars.js";
import jupiter from "./jupiter.js";
import saturn from "./saturn.js";
import uranus from "./uranus.js";
import neptune from "./neptune.js";
import ceres from "./ceres.js";
import pluto from "./pluto.js";
import haumea from "./haumea.js";
import makemake from "./makemake.js";
import eris from "./eris.js";
import moon from "./moon.js";

// Ordem do Sol para fora (planetas + anões intercalados pela distância).
export const ORBITERS = [
  mercury,
  venus,
  earth,
  mars,
  ceres,
  jupiter,
  saturn,
  uranus,
  neptune,
  pluto,
  haumea,
  makemake,
  eris,
];

export const SUN = sun;

// Luas por planeta (por ora, só a da Terra).
export const MOONS = {
  earth: [moon],
};

// Tudo que aparece no menu (Sol + orbitadores), na ordem de exibição.
export const MENU_ORDER = [sun, ...ORBITERS];
