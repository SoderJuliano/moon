// Construção compartilhada do Sistema Solar — a "engine" comum aos dois modos.
//
// Monta os corpos (Sol, planetas, anões, luas), as regiões de asteroides, os
// alvos de navegação e o sistema de asteroides. NÃO decide câmera, HUD nem
// loop: cada modo (Exploração/Jogo) inicializa a própria experiência por cima
// deste mundo. É assim que os dois modos compartilham UMA implementação do
// Sistema Solar sem duplicar nada.

import { createBody, attachMoon } from "../core/body.js";
import { makeOrbitLine } from "../core/scene.js";
import { orbitRadius } from "../core/scales.js";
import { SUN, ORBITERS, MOONS } from "../bodies/index.js";
import { createAsteroidSystem, createRegionBodies } from "../systems/asteroidConfig.js";
import { SpaceAudio } from "../ui/spaceAudio.js";

// Constrói o mundo dentro da cena dada. `withOrbitLines: false` nem cria as
// linhas (no jogo não existe modo fantasia, então elas nunca apareceriam).
export function buildSolarSystem(scene, glow, { mode, withOrbitLines = true }) {
  const bodyById = new Map();

  // Sol na origem
  const sun = createBody(SUN, mode);
  scene.add(sun.orbitGroup);
  bodyById.set(sun.id, sun);
  glow.position.set(0, 0, 0);
  glow.scale.setScalar(sun.radius * 7);

  // Planetas + anões (e suas linhas de órbita, quando pedidas)
  const orbitLines = []; // { line, aAU }
  const bodies = [sun];
  for (const desc of ORBITERS) {
    const body = createBody(desc, mode);
    scene.add(body.orbitGroup);
    bodyById.set(body.id, body);
    bodies.push(body);

    if (withOrbitLines) {
      const line = makeOrbitLine(orbitRadius(desc.aAU, mode));
      scene.add(line);
      orbitLines.push({ line, aAU: desc.aAU });
    }

    // luas (por ora só a da Terra)
    const moons = MOONS[desc.id];
    if (moons) {
      for (const md of moons) {
        const moon = attachMoon(body, md, mode);
        bodyById.set(moon.id, moon);
      }
    }
  }

  // Regiões de asteroides como "corpos virtuais": marcadores de navegação e
  // referência da nave. FORA de bodyById de propósito (sem colisão de corpo,
  // sem áudio, sem LOD — asteroides têm colisão própria via hitTest).
  const regionById = new Map(createRegionBodies((id) => bodyById.get(id)).map((r) => [r.id, r]));

  function resolveBody(id) {
    return bodyById.get(id) || regionById.get(id);
  }

  // Alvos de navegação: todo corpo vira um marcador (Sol, planetas, anões,
  // luas, regiões). Interface { id, name, color, kind, getWorldPosition }.
  const markerTargets = [...bodyById.values(), ...regionById.values()].map((b) => ({
    id: b.id,
    name: b.name,
    color: b.descriptor?.menuColor || "#cdd6e6",
    kind: b.descriptor?.type || "planet",
    getWorldPosition: (v) => b.worldPosition(v),
  }));

  // Asteroides (sistema independente): cinturões densos + campos esparsos com
  // streaming/pooling próprios.
  const { asteroids, encounter } = createAsteroidSystem(
    scene,
    (id) => bodyById.get(id),
    () => bodyById.values()
  );

  return { sun, bodies, bodyById, regionById, resolveBody, orbitLines, markerTargets, asteroids, encounter };
}

// Som ambiente por proximidade (voo em escala real) — mesma configuração nos
// dois modos: ruído grave filtrado + sub-grave por corpo (sem mp3).
export function createAmbientAudio() {
  const audio = new SpaceAudio();
  // near/far alinhados à janela de APROXIMAÇÃO GRADUAL do voo (o planeta começa
  // a crescer a ~9× o raio gigante): o drone entra junto com o corpo ganhando
  // presença na tela — não quando ele ainda é um pontinho a 20 mil unidades.
  audio.add("jupiter", { type: "lowpass", freq: 170, q: 0.9, sub: 52, subGain: 0.5 }, 800, 4500);
  audio.add("saturn", { type: "bandpass", freq: 420, q: 1.4, sub: 70, subGain: 0.3 }, 700, 3600);
  // Sol: sonificação REAL da NASA (SOHO/Stanford) em loop sem emenda. near/far
  // em MÚLTIPLOS do raio atual (relativeToRadius): funciona tanto pra câmera
  // focada no Sol (raio ~109) quanto pra nave chegando perto (Sol inflado ~40×).
  audio.add("sun", { sampleUrl: "audio/sun_sonification.wav", relativeToRadius: true }, 3, 25);
  return audio;
}
