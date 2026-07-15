// Fábrica de corpos celestes.
//
// Hierarquia Three.js:
//
//   orbitGroup (gira em Y -> longitude correta)
//     └─ pivot (na distância da órbita; SEM escala/spin)
//          ├─ mesh (escala = raio do corpo; gira em si)  └─ [anel]
//          └─ [orbitGroup de luas]  (pendurado no pivot, não no mesh, para não
//                                     herdar a escala/rotação do planeta)
//
// As esferas são unitárias (raio 1) e o tamanho é dado por mesh.scale. Assim
// trocar de modo (fantasia<->real) só anima escala e distância — sem recriar
// geometria. Isso permite o modo real ter proporções de tamanho VERDADEIRAS.

import * as THREE from "three";
import { bodyRadius, orbitRadius, moonOrbitRadius } from "./scales.js";
import { longitudeRad, moonLongitudeRad } from "./ephemeris.js";
import { ringTexture } from "./textures.js";

const SEGMENTS = 64; // silhueta lisa mesmo de perto (custo trivial)

// Ao pilotar e aproximar uma LUA, ela infla pra escala gigante (igual aos
// planetas). Mas a lua orbita o planeta a uma distância pequena — inflada, ela
// engoliria o planeta-pai. Então afastamos a lua do planeta o suficiente pra ela
// (gigante) não cobrir o pai: distância ≥ raio_inflado·FATOR + raio_do_pai.
// Sem aproximação (escala normal) isso não muda nada (mantém a órbita real).
const MOON_APPROACH_CLEARANCE = 1.4;

function makeMesh(descriptor, isSun) {
  const texture = descriptor.makeTexture();
  const material = isSun
    ? new THREE.MeshBasicMaterial({ map: texture }) // Sol não depende de luz
    : new THREE.MeshStandardMaterial({
        map: texture,
        roughness: descriptor.roughness ?? 0.9,
        metalness: 0,
      });
  const geometry = new THREE.SphereGeometry(1, SEGMENTS, SEGMENTS);
  // Corpos não-esféricos (ex.: Haumea): proporção assada na GEOMETRIA, pra
  // mesh.scale continuar uniforme (as animações de escala dependem disso).
  // Componentes devem ser ≤1 (colisão/aproximação tratam o corpo como esfera
  // de raio mesh.scale.x — o eixo maior não pode ultrapassar esse raio).
  // Eixo Y = eixo de rotação (polar); X/Z = plano equatorial.
  if (descriptor.shapeScale) geometry.scale(...descriptor.shapeScale);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.bodyId = descriptor.id;
  if (descriptor.axialTilt) mesh.rotation.z = THREE.MathUtils.degToRad(descriptor.axialTilt);
  return mesh;
}

// anel construído relativo ao raio base 1 (escala junto com o mesh do planeta)
function addRing(mesh, ring) {
  const inner = ring.inner;
  const outer = ring.outer;
  const geo = new THREE.RingGeometry(inner, outer, 96);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const t = (v3.length() - inner) / (outer - inner);
    uv.setXY(i, t, 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture(ring.colors),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const ringMesh = new THREE.Mesh(geo, mat);
  ringMesh.rotation.x = Math.PI / 2;
  mesh.add(ringMesh);
  return ringMesh;
}

const textureLoader = new THREE.TextureLoader();

// Troca o mapa entre a textura procedural (fantasia) e a real/NASA (real),
// carregando a real sob demanda na primeira vez que o modo real é usado.
function makeTextureSwitcher(mesh, ringMesh, descriptor) {
  const proceduralMap = mesh.material.map;
  const proceduralRingMap = ringMesh ? ringMesh.material.map : null;
  let realMap = null;
  let realRingMap = null;

  function loadReal(url) {
    const t = textureLoader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  return (currentMode) => {
    const wantReal = currentMode === "real";

    if (descriptor.realTextureUrl) {
      if (wantReal) {
        if (!realMap) realMap = loadReal(descriptor.realTextureUrl);
        if (mesh.material.map !== realMap) {
          mesh.material.map = realMap;
          mesh.material.needsUpdate = true;
        }
      } else if (mesh.material.map !== proceduralMap) {
        mesh.material.map = proceduralMap;
        mesh.material.needsUpdate = true;
      }
    }

    if (ringMesh && descriptor.ring && descriptor.ring.realTextureUrl) {
      if (wantReal) {
        if (!realRingMap) {
          realRingMap = loadReal(descriptor.ring.realTextureUrl);
          realRingMap.wrapS = THREE.ClampToEdgeWrapping;
        }
        if (ringMesh.material.map !== realRingMap) {
          ringMesh.material.map = realRingMap;
          ringMesh.material.needsUpdate = true;
        }
      } else if (ringMesh.material.map !== proceduralRingMap) {
        ringMesh.material.map = proceduralRingMap;
        ringMesh.material.needsUpdate = true;
      }
    }
  };
}

// aproxima current de target de forma suave e independente de framerate
function approach(current, target, dt) {
  const d = target - current;
  if (Math.abs(d) < 1e-5) return target;
  return current + d * Math.min(1, dt * 2.5);
}

const _lodPos = new THREE.Vector3();

// LOD por distância (reutilizado por planetas e luas): textura pesada (NASA/2k)
// só quando a câmera chega perto; de longe volta pra procedural e DESCARTA a
// hi-res (libera VRAM no tablet). Vale em QUALQUER modo. Limiar generoso com
// piso absoluto pra valer também pra corpos pequenos (Marte/Lua), cujo raio é
// minúsculo.
function makeDetailLOD(mesh, descriptor) {
  const proceduralMap = mesh.material.map;
  let hiresMap = null;
  let on = false;
  return function (cameraPos, currentMode) {
    if (!descriptor.hiresTextureUrl) return;
    // Corpos que TAMBÉM têm realTextureUrl (Júpiter/Saturno): no modo real quem
    // manda no mapa é o switcher (textura pesada SEMPRE, mesmo de longe). O LOD
    // se retira — senão, ao afastar, ele devolveria a procedural por cima.
    if (descriptor.realTextureUrl && currentMode === "real") {
      if (on) {
        on = false; // o mapa já foi trocado pelo switcher; só solta a cópia do LOD
        if (hiresMap) {
          hiresMap.dispose();
          hiresMap = null;
        }
      }
      return;
    }
    mesh.getWorldPosition(_lodPos);
    const dist = cameraPos.distanceTo(_lodPos);
    const r = mesh.scale.x;
    const onAt = Math.max(16, r * 7 + 6);
    const offAt = Math.max(26, r * 12 + 12); // histerese pra não piscar
    if (!on && dist < onAt) {
      if (!hiresMap) {
        hiresMap = textureLoader.load(descriptor.hiresTextureUrl, () => {
          mesh.material.needsUpdate = true;
        });
        hiresMap.colorSpace = THREE.SRGBColorSpace;
        hiresMap.anisotropy = 8;
      }
      mesh.material.map = hiresMap;
      mesh.material.needsUpdate = true;
      on = true;
    } else if (on && dist > offAt) {
      mesh.material.map = proceduralMap;
      mesh.material.needsUpdate = true;
      on = false;
      if (hiresMap) {
        hiresMap.dispose();
        hiresMap = null;
      }
    }
  };
}

export function createBody(descriptor, mode) {
  const mesh = makeMesh(descriptor, descriptor.isSun);
  const ringMesh = descriptor.ring ? addRing(mesh, descriptor.ring) : null;
  const switchTexture = makeTextureSwitcher(mesh, ringMesh, descriptor);

  const pivot = new THREE.Object3D();
  pivot.add(mesh);
  const orbitGroup = new THREE.Object3D();
  orbitGroup.add(pivot);

  const lod = makeDetailLOD(mesh, descriptor);

  const body = {
    descriptor,
    id: descriptor.id,
    name: descriptor.name,
    mesh,
    pivot,
    orbitGroup,
    moons: [],

    _targetX: 0,
    _targetScale: 1,
    _approachMul: 1, // multiplicador de escala ao pilotar perto (planeta gigante)
    _approachTargetMul: 1,

    get radius() {
      return mesh.scale.x;
    },

    // raio "real" na escala atual (sem o multiplicador de aproximação)
    get baseRadius() {
      return this._targetScale;
    },

    // raio que o corpo terá no fim da escala atual (sem esperar a animação) —
    // usado pra posicionar a nave fora do planeta já no tamanho gigante
    get approachRadius() {
      return this._targetScale * this._approachTargetMul;
    },

    // ao pilotar, mul>>1 deixa o planeta gigante (nave vira grão de areia)
    setApproach(mul) {
      this._approachTargetMul = mul;
    },

    applyMode(currentMode, instant = true) {
      this._targetX = descriptor.isSun ? 0 : orbitRadius(descriptor.aAU, currentMode);
      this._targetScale = bodyRadius(descriptor.realRadiusKm ?? 6371, currentMode, descriptor.isSun);
      switchTexture(currentMode);
      if (instant) {
        pivot.position.x = this._targetX;
        mesh.scale.setScalar(this._targetScale * this._approachMul);
      }
      for (const m of this.moons) m.applyMode(currentMode, instant);
    },

    update(simDays, dSimDays, dt) {
      pivot.position.x = approach(pivot.position.x, this._targetX, dt);
      this._approachMul = approach(this._approachMul, this._approachTargetMul, dt);
      mesh.scale.setScalar(approach(mesh.scale.x, this._targetScale * this._approachMul, dt));
      orbitGroup.rotation.y = longitudeRad(descriptor, simDays);
      // giro no próprio eixo amarrado ao TEMPO SIMULADO (1 volta por rotDays);
      // negativo = retrógrado. Desacelera junto com a velocidade do tempo.
      mesh.rotation.y += ((2 * Math.PI) / (descriptor.rotDays ?? 1)) * dSimDays;
      for (const m of this.moons) m.update(simDays, dSimDays, dt);
    },

    worldPosition(target) {
      return mesh.getWorldPosition(target);
    },

    // chamado a cada frame com a posição da câmera e o modo atual; cascateia
    // pras luas (que têm seu próprio LOD)
    updateDetail(cameraPos, currentMode) {
      lod(cameraPos, currentMode);
      for (const m of this.moons) if (m.updateDetail) m.updateDetail(cameraPos, currentMode);
    },
  };

  body.applyMode(mode);
  return body;
}

// Cria uma lua presa ao PIVOT do planeta (segue a posição, não a escala/spin).
// moonIndex = ordem da lua no planeta (0,1,2…): espalha as órbitas em cascas
// distintas pra várias luas não empilharem no mesmo raio.
export function attachMoon(planet, descriptor, mode, moonIndex = 0) {
  const mesh = makeMesh(descriptor, false);
  const pivot = new THREE.Object3D();
  pivot.add(mesh);
  const orbitGroup = new THREE.Object3D();
  orbitGroup.add(pivot);
  planet.pivot.add(orbitGroup);

  // raio "fantasia" do planeta é constante; usado para posicionar a lua perto
  // dele no modo fantasia
  const planetFantasyRadius = bodyRadius(planet.descriptor.realRadiusKm, "fantasy");

  // DISTÂNCIA INFLADA FIXA (modo real/game): ao pilotar perto, o planeta cresce
  // pra "gigante" (~40× o raio, ou mais pros pequenos — ver APPROACH_MUL=40 e
  // MIN_APPROACH_R=60 no ShipFlight). As luas precisam orbitar FORA desse
  // gigante, senão são engolidas. Valor FIXO (não escala com a inflação) → nunca
  // engolidas E nunca "andam sozinhas" quando o planeta incha. O índice espalha
  // as luas em cascas concêntricas (1.3×, 1.9×, 2.5×… o raio-gigante).
  const planetRealRadius = bodyRadius(planet.descriptor.realRadiusKm, "real");
  const giantRadius = planetRealRadius * Math.max(40, 60 / planetRealRadius);

  const lod = makeDetailLOD(mesh, descriptor);

  const moon = {
    descriptor,
    id: descriptor.id,
    name: descriptor.name,
    mesh,
    pivot,
    parent: planet,
    _targetX: 0,
    _targetScale: 1,
    _approachMul: 1,
    _approachTargetMul: 1,

    get radius() {
      return mesh.scale.x;
    },

    get baseRadius() {
      return this._targetScale;
    },

    get approachRadius() {
      return this._targetScale * this._approachTargetMul;
    },

    setApproach(mul) {
      this._approachTargetMul = mul;
    },

    applyMode(currentMode, instant = true) {
      if (currentMode === "real") {
        // fixo, FORA do planeta inflado, com as luas espalhadas em cascas por índice
        const orbit = moonOrbitRadius(planetFantasyRadius, descriptor.moonDistanceKm, currentMode);
        this._targetX = Math.max(orbit, giantRadius * (1.3 + moonIndex * 0.6));
      } else {
        // fantasia/exploração: sem inflação; espalha as luas em cascas distintas
        this._targetX = planetFantasyRadius * (4.5 + moonIndex * 1.8);
      }
      this._targetScale = bodyRadius(descriptor.realRadiusKm, currentMode);
      if (instant) {
        pivot.position.x = this._targetX;
        mesh.scale.setScalar(this._targetScale * this._approachMul);
      }
    },

    update(simDays, dSimDays, dt) {
      this._approachMul = approach(this._approachMul, this._approachTargetMul, dt);
      const inflated = this._targetScale * this._approachMul;
      mesh.scale.setScalar(approach(mesh.scale.x, inflated, dt));

      // ESPAÇAMENTO na aproximação: afasta a lua do planeta o bastante pra ela
      // (gigante) não engolir o pai. Sem inflar (_approachMul≈1) → órbita real.
      const clearance = inflated * MOON_APPROACH_CLEARANCE + (planet.baseRadius || 0);
      const distTarget = Math.max(this._targetX, clearance);
      pivot.position.x = approach(pivot.position.x, distTarget, dt);

      orbitGroup.rotation.y = moonLongitudeRad(descriptor, simDays);
      mesh.rotation.y += ((2 * Math.PI) / (descriptor.rotDays ?? 1)) * dSimDays;
    },

    worldPosition(target) {
      return mesh.getWorldPosition(target);
    },

    updateDetail(cameraPos, currentMode) {
      lod(cameraPos, currentMode);
    },
  };

  moon.applyMode(mode);
  planet.moons.push(moon);
  return moon;
}
