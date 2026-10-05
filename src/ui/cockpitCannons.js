// CockpitCannons — Canhões 3D de 1ª Pessoa / Visão Interna do Cockpit.
//
// Projetados no padrão autêntico de simuladores espaciais (Star Wars: Squadrons / Elite Dangerous):
//  • As estruturas de montagem (asas/pilares) nascem profundamente fora da tela (off-screen, ±X)
//    e atrás da lente da câmera (+Z), garantindo que NUNCA se veja o ponto onde o cano começa.
//  • Zero partes flutuando: o usuário vê apenas os imponentes tubos e bocais de disparo projetando-se
//    das bordas laterais do campo de visão em direção ao espaço.
//  • Travamento dinâmico no frustum da câmera: mesmo em aceleração, manobras ou supercruise,
//    as armas permanecem 100% ancoradas nas bordas da tela sem oscilar pra frente ou pra trás.
//  • Recuo mecânico exclusivo dos tubos individuais ao disparar (sem mover a câmera).

import * as THREE from "three";
import { radialGlowTexture } from "../core/textures.js";

export class CockpitCannons {
  constructor(camera, scene = null) {
    this.camera = camera;
    this.scene = scene;

    if (this.scene && this.camera && !this.camera.parent) {
      this.scene.add(this.camera);
    }

    this.root = new THREE.Group();
    this.root.name = "cockpitCannonsRig";
    this.root.visible = false;
    this.camera.add(this.root);

    this.activeShipId = "xr07";
    this.recoil = 0;
    this.flashOpacity = 0;
    this.flashSprites = [];
    this._recoilMeshes = [];

    this._lastFov = -1;
    this._lastAspect = -1;

    // Iluminação dedicada de cockpit: luzes direcionais, luzes de preenchimento (floodlights) e ambiente balanceadas
    const leftLight = new THREE.DirectionalLight(0xe8f4ff, 3.2);
    leftLight.position.set(-1.0, 1.0, 0.2);
    this.root.add(leftLight);

    const rightLight = new THREE.DirectionalLight(0xe8f4ff, 3.2);
    rightLight.position.set(1.0, 1.0, 0.2);
    this.root.add(rightLight);

    // Floodlights dedicados nas laterais para iluminar os canhões diretamente da própria nave
    const leftFill = new THREE.PointLight(0xa6d8ff, 2.8, 4.0);
    leftFill.position.set(-0.4, 0.2, -0.25);
    this.root.add(leftFill);

    const rightFill = new THREE.PointLight(0xa6d8ff, 2.8, 4.0);
    rightFill.position.set(0.4, 0.2, -0.25);
    this.root.add(rightFill);

    const ambLight = new THREE.AmbientLight(0xffffff, 2.2);
    this.root.add(ambLight);

    this._subGroups = {
      naveSW: new THREE.Group(),
      xr07: new THREE.Group(),
      shuttle: new THREE.Group(),
    };

    this.root.add(this._subGroups.naveSW);
    this.root.add(this._subGroups.xr07);
    this.root.add(this._subGroups.shuttle);

    this._buildFighterCannons();
    this._buildBaseCannons();
    this._buildShuttleCannons();

    this.setShipId("xr07");
    this.updateLayout(true);

    this._onResize = () => this.updateLayout(true);
    window.addEventListener("resize", this._onResize);
  }

  _createMuzzleFlash(tint = "#00e5ff", color = 0x66edff, size = 0.16) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialGlowTexture(tint),
        color: color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      })
    );
    sp.scale.setScalar(size);
    this.flashSprites.push(sp);
    return sp;
  }

  // 1) Caça Estelar SW-X: 4 canhões pesados de laser estelar (Estilo Star Wars X-Wing)
  _buildFighterCannons() {
    const grp = this._subGroups.naveSW;

    const wingArmorMat = new THREE.MeshStandardMaterial({
      color: 0x323e50,
      metalness: 0.65,
      roughness: 0.32,
    });
    const gunHousingMat = new THREE.MeshStandardMaterial({
      color: 0x48586e,
      metalness: 0.70,
      roughness: 0.28,
    });
    const barrelSteelMat = new THREE.MeshStandardMaterial({
      color: 0x5a6d85,
      metalness: 0.75,
      roughness: 0.22,
    });
    const energyCoilMat = new THREE.MeshStandardMaterial({
      color: 0x00c8ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.8,
      metalness: 0.2,
      roughness: 0.15,
      toneMapped: false,
    });
    const muzzleTipMat = new THREE.MeshStandardMaterial({
      color: 0x222a36,
      metalness: 0.85,
      roughness: 0.18,
    });

    const createQuadCannon = (isLeft, isTop) => {
      const rootCannon = new THREE.Group();
      const signX = isLeft ? -1 : 1;
      const signY = isTop ? 1 : -1;

      // --- ESTRUTURA FIXA DA ASA / BERÇO DO CANHÃO (Estende-se bem além das bordas da tela) ---
      const baseArm = new THREE.Group();

      // Longo braço de blindagem da asa (avança da borda externa para o centro)
      const pylonGeo = new THREE.BoxGeometry(0.35, 0.08, 0.65);
      const pylon = new THREE.Mesh(pylonGeo, wingArmorMat);
      pylon.position.set(signX * 0.18, signY * 0.03, 0.18);
      pylon.rotation.set(signY * 0.06, -signX * 0.25, signY * signX * 0.14);
      baseArm.add(pylon);

      // Cilindro da culatra receptora que envolve o cano
      const receiverGeo = new THREE.CylinderGeometry(0.026, 0.032, 0.38, 16);
      receiverGeo.rotateX(Math.PI / 2);
      const receiver = new THREE.Mesh(receiverGeo, gunHousingMat);
      receiver.position.set(0, 0, 0.08);
      baseArm.add(receiver);

      // Carenagem chanfrada de reforço
      const gussetGeo = new THREE.BoxGeometry(0.06, 0.05, 0.32);
      const gusset = new THREE.Mesh(gussetGeo, wingArmorMat);
      gusset.position.set(signX * 0.035, 0, 0.06);
      baseArm.add(gusset);

      rootCannon.add(baseArm);

      // --- CONJUNTO DO CANO MÓVEL (Recuo individual realista) ---
      const barrelAssembly = new THREE.Group();
      const barrelLength = 0.48;

      // Tubo longo de liga estelar que projeta para a frente da visão
      const barrelGeo = new THREE.CylinderGeometry(0.013, 0.016, barrelLength, 16);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, barrelSteelMat);
      barrel.position.z = -barrelLength / 2 + 0.04;
      barrelAssembly.add(barrel);

      // Carenagem de arrefecimento / jaqueta de resfriamento com aletas
      const sleeveGeo = new THREE.CylinderGeometry(0.019, 0.022, 0.18, 16);
      sleeveGeo.rotateX(Math.PI / 2);
      const sleeve = new THREE.Mesh(sleeveGeo, gunHousingMat);
      sleeve.position.z = -0.12;
      barrelAssembly.add(sleeve);

      // 3 Anéis de aceleração magnética de plasma (Cyan Glow)
      const ringGeo = new THREE.TorusGeometry(0.017, 0.0035, 8, 16);
      const ring1 = new THREE.Mesh(ringGeo, energyCoilMat);
      ring1.position.z = -0.22;
      barrelAssembly.add(ring1);

      const ring2 = ring1.clone();
      ring2.position.z = -0.30;
      barrelAssembly.add(ring2);

      const ring3 = ring1.clone();
      ring3.position.z = -0.38;
      barrelAssembly.add(ring3);

      // Bocal e ponteira de disparo estilo Star Wars
      const tipGeo = new THREE.CylinderGeometry(0.017, 0.013, 0.06, 16);
      tipGeo.rotateX(Math.PI / 2);
      const tip = new THREE.Mesh(tipGeo, muzzleTipMat);
      tip.position.z = -barrelLength;
      barrelAssembly.add(tip);

      const flash = this._createMuzzleFlash("#00e5ff", 0x7beeff, 0.18);
      flash.position.set(0, 0, -barrelLength - 0.04);
      barrelAssembly.add(flash);

      rootCannon.add(barrelAssembly);
      this._recoilMeshes.push(barrelAssembly);

      // Leve convergência angular em direção ao retículo central
      const yaw = signX * -0.022;
      const pitch = signY * 0.014;
      rootCannon.rotation.set(pitch, yaw, 0);

      return { root: rootCannon, barrel: barrelAssembly, isLeft, isTop };
    };

    this.swCannons = {
      upLeft: createQuadCannon(true, true),
      downLeft: createQuadCannon(true, false),
      upRight: createQuadCannon(false, true),
      downRight: createQuadCannon(false, false),
    };

    grp.add(this.swCannons.upLeft.root);
    grp.add(this.swCannons.downLeft.root);
    grp.add(this.swCannons.upRight.root);
    grp.add(this.swCannons.downRight.root);
  }

  // 2) Nave Base Tecnológica (XR-07): 2 Blasters de Plasma Laterais com Iluminação Própria
  _buildBaseCannons() {
    const grp = this._subGroups.xr07;

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x38475c,
      metalness: 0.60,
      roughness: 0.32,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x586b84,
      metalness: 0.72,
      roughness: 0.24,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x7a91ae,
      metalness: 0.80,
      roughness: 0.20,
    });
    const glowLineMat = new THREE.MeshStandardMaterial({
      color: 0x00d0ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 3.2,
      toneMapped: false,
    });

    const createBaseBlaster = (isLeft) => {
      const rootCannon = new THREE.Group();
      const signX = isLeft ? -1 : 1;

      const baseArm = new THREE.Group();
      const pylonGeo = new THREE.BoxGeometry(0.38, 0.09, 0.65);
      const pylon = new THREE.Mesh(pylonGeo, chassisMat);
      pylon.position.set(signX * 0.20, -0.03, 0.18);
      pylon.rotation.set(-0.06, -signX * 0.26, -signX * 0.10);
      baseArm.add(pylon);

      // Friso luminoso de LED / fibra óptica na carenagem externa
      const ledGeo = new THREE.BoxGeometry(0.012, 0.012, 0.42);
      const led = new THREE.Mesh(ledGeo, glowLineMat);
      led.position.set(signX * 0.045, 0.048, 0.12);
      baseArm.add(led);

      const housingGeo = new THREE.BoxGeometry(0.085, 0.065, 0.35);
      const housing = new THREE.Mesh(housingGeo, chassisMat);
      housing.position.set(0, 0, 0.08);
      baseArm.add(housing);

      const trimGeo = new THREE.BoxGeometry(0.088, 0.02, 0.30);
      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.position.set(0, 0.034, 0.08);
      baseArm.add(trim);

      rootCannon.add(baseArm);

      const barrelAssembly = new THREE.Group();
      const barrelLength = 0.46;

      const tubeGeo = new THREE.CylinderGeometry(0.016, 0.020, barrelLength, 16);
      tubeGeo.rotateX(Math.PI / 2);
      const tube = new THREE.Mesh(tubeGeo, barrelMat);
      tube.position.z = -barrelLength / 2 + 0.04;
      barrelAssembly.add(tube);

      // Linha de condução de plasma superaquecido ao longo do cano
      const glowGeo = new THREE.BoxGeometry(0.008, 0.008, 0.34);
      const glow = new THREE.Mesh(glowGeo, glowLineMat);
      glow.position.set(0, 0.021, -0.20);
      barrelAssembly.add(glow);

      // Anéis emissores de contenção magnética no bocal
      const muzzleRingGeo = new THREE.TorusGeometry(0.020, 0.0035, 8, 16);
      const muzzleRing = new THREE.Mesh(muzzleRingGeo, glowLineMat);
      muzzleRing.position.z = -barrelLength + 0.02;
      barrelAssembly.add(muzzleRing);

      const flash = this._createMuzzleFlash("#389bff", 0x88caff, 0.18);
      flash.position.set(0, 0, -barrelLength - 0.04);
      barrelAssembly.add(flash);

      rootCannon.add(barrelAssembly);
      this._recoilMeshes.push(barrelAssembly);

      rootCannon.rotation.set(0.014, signX * -0.024, 0);
      return { root: rootCannon, barrel: barrelAssembly, isLeft };
    };

    this.xrCannons = {
      left: createBaseBlaster(true),
      right: createBaseBlaster(false),
    };

    grp.add(this.xrCannons.left.root);
    grp.add(this.xrCannons.right.root);
  }

  // 3) Ônibus Espacial (Shuttle): 2 Canhões Pesados de Artilharia Naval
  _buildShuttleCannons() {
    const grp = this._subGroups.shuttle;

    const heavyArmorMat = new THREE.MeshStandardMaterial({
      color: 0x3d4554,
      metalness: 0.60,
      roughness: 0.35,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x546276,
      metalness: 0.70,
      roughness: 0.24,
    });
    const orangeAccMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff5500,
      emissiveIntensity: 2.5,
      toneMapped: false,
    });

    const createArtilleryCannon = (isLeft) => {
      const rootCannon = new THREE.Group();
      const signX = isLeft ? -1 : 1;

      const baseArm = new THREE.Group();
      const pylonGeo = new THREE.BoxGeometry(0.40, 0.10, 0.70);
      const pylon = new THREE.Mesh(pylonGeo, heavyArmorMat);
      pylon.position.set(signX * 0.22, -0.04, 0.20);
      pylon.rotation.set(-0.08, -signX * 0.28, -signX * 0.12);
      baseArm.add(pylon);

      const cradleGeo = new THREE.BoxGeometry(0.09, 0.07, 0.38);
      const cradle = new THREE.Mesh(cradleGeo, heavyArmorMat);
      cradle.position.set(0, 0, 0.09);
      baseArm.add(cradle);

      rootCannon.add(baseArm);

      const barrelAssembly = new THREE.Group();
      const barrelLength = 0.48;

      const barrelGeo = new THREE.CylinderGeometry(0.022, 0.026, barrelLength, 16);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, darkSteelMat);
      barrel.position.z = -barrelLength / 2 + 0.04;
      barrelAssembly.add(barrel);

      const brakeGeo = new THREE.BoxGeometry(0.054, 0.042, 0.09);
      const brake = new THREE.Mesh(brakeGeo, heavyArmorMat);
      brake.position.z = -barrelLength;
      barrelAssembly.add(brake);

      const ringGeo = new THREE.TorusGeometry(0.026, 0.004, 8, 16);
      const ring = new THREE.Mesh(ringGeo, orangeAccMat);
      ring.position.z = -0.24;
      barrelAssembly.add(ring);

      const flash = this._createMuzzleFlash("#ff7700", 0xffaa44, 0.22);
      flash.position.set(0, 0, -barrelLength - 0.05);
      barrelAssembly.add(flash);

      rootCannon.add(barrelAssembly);
      this._recoilMeshes.push(barrelAssembly);

      rootCannon.rotation.set(0.016, signX * -0.022, 0);
      return { root: rootCannon, barrel: barrelAssembly, isLeft };
    };

    this.shuttleCannons = {
      left: createArtilleryCannon(true),
      right: createArtilleryCannon(false),
    };

    grp.add(this.shuttleCannons.left.root);
    grp.add(this.shuttleCannons.right.root);
  }

  // Trava os canhões perfeitamente nas bordas do campo de visão mesmo sob qualquer FOV ou proporção
  updateLayout(force = false) {
    if (!this.camera) return;

    const fov = this.camera.fov || 65;
    const aspect = this.camera.aspect || (window.innerWidth / (window.innerHeight || 1));

    if (!force && Math.abs(fov - this._lastFov) < 0.01 && Math.abs(aspect - this._lastAspect) < 0.005) {
      return;
    }
    this._lastFov = fov;
    this._lastAspect = aspect;

    const fovRad = (fov * Math.PI) / 180;
    const dist = 0.35;
    const halfH = dist * Math.tan(fovRad / 2);
    const halfW = halfH * aspect;
    const zPos = -dist;

    // 1) Caça SW-X (4 Canhões nas 4 pontas):
    if (this.swCannons) {
      const xSW = Math.max(0.19, halfW * 0.92);
      const yTopSW = halfH * 0.60;
      const yBtmSW = -halfH * 0.60;

      this.swCannons.upLeft.root.position.set(-xSW, yTopSW, zPos);
      this.swCannons.downLeft.root.position.set(-xSW, yBtmSW, zPos);
      this.swCannons.upRight.root.position.set(xSW, yTopSW, zPos);
      this.swCannons.downRight.root.position.set(xSW, yBtmSW, zPos);
    }

    // 2) XR-07 (2 Blasters Inferiores):
    if (this.xrCannons) {
      const xXR = Math.max(0.18, halfW * 0.90);
      const yXR = -halfH * 0.58;
      this.xrCannons.left.root.position.set(-xXR, yXR, zPos);
      this.xrCannons.right.root.position.set(xXR, yXR, zPos);
    }

    // 3) Shuttle (2 Artilharias Inferiores):
    if (this.shuttleCannons) {
      const xShuttle = Math.max(0.19, halfW * 0.91);
      const yShuttle = -halfH * 0.59;
      this.shuttleCannons.left.root.position.set(-xShuttle, yShuttle, zPos);
      this.shuttleCannons.right.root.position.set(xShuttle, yShuttle, zPos);
    }
  }

  // Retorna as posições 3D das bocas dos canos para nascimento perfeito dos disparos a laser
  getMuzzleWorldOffsets(shipId = this.activeShipId) {
    this.updateLayout(true);

    const fov = this.camera.fov || 65;
    const aspect = this.camera.aspect || (window.innerWidth / (window.innerHeight || 1));
    const fovRad = (fov * Math.PI) / 180;
    const dist = 0.35;
    const halfH = dist * Math.tan(fovRad / 2);
    const halfW = halfH * aspect;
    const tipZ = -(dist + 0.48);

    if (shipId === "naveSW") {
      const x = Math.max(0.19, halfW * 0.92);
      const yT = halfH * 0.60;
      const yB = -halfH * 0.60;
      return [
        new THREE.Vector3(-x, yT, tipZ),
        new THREE.Vector3(x, yT, tipZ),
        new THREE.Vector3(-x, yB, tipZ),
        new THREE.Vector3(x, yB, tipZ),
      ];
    }

    if (shipId === "shuttle") {
      const x = Math.max(0.19, halfW * 0.91);
      const y = -halfH * 0.59;
      return [
        new THREE.Vector3(-x, y, tipZ),
        new THREE.Vector3(x, y, tipZ),
      ];
    }

    // xr07
    const x = Math.max(0.18, halfW * 0.90);
    const y = -halfH * 0.58;
    return [
      new THREE.Vector3(-x, y, tipZ),
      new THREE.Vector3(x, y, tipZ),
    ];
  }

  setShipId(shipId) {
    this.activeShipId = shipId || "xr07";
    this._subGroups.naveSW.visible = this.activeShipId === "naveSW";
    this._subGroups.xr07.visible = this.activeShipId === "xr07";
    this._subGroups.shuttle.visible = this.activeShipId === "shuttle";
    this.updateLayout(true);
  }

  setVisible(on) {
    this.root.visible = !!on;
    if (on) {
      if (this.scene && this.camera && !this.camera.parent) {
        this.scene.add(this.camera);
      }
      this.updateLayout(true);
    }
  }

  triggerRecoil() {
    this.recoil = 0.015; // Recuo sutil e mecânico nos tubos
    this.flashOpacity = 1.0;
  }

  update(dt) {
    if (!this.root.visible) return;

    // Garante sincronização contínua com qualquer alteração de FOV da câmera
    this.updateLayout();

    // Recuo mecânico suave no tubo individual (sem mover o rig ou o campo de visão)
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 0.18);
      const offsetZ = this.recoil;
      for (const mesh of this._recoilMeshes) {
        mesh.position.z = offsetZ;
      }
    } else {
      for (const mesh of this._recoilMeshes) {
        mesh.position.z = 0;
      }
    }

    // Clarão luminoso de disparo diminuindo suavemente
    if (this.flashOpacity > 0) {
      this.flashOpacity = Math.max(0, this.flashOpacity - dt * 18);
      for (const sp of this.flashSprites) {
        sp.material.opacity = this.flashOpacity;
      }
    }
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    if (this.camera && this.root) {
      this.camera.remove(this.root);
    }
  }
}
