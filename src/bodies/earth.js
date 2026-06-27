// Terra — único corpo que reaproveita uma imagem real (earth.jpg, ~350KB, leve).
import * as THREE from "three";

const loader = new THREE.TextureLoader();

export default {
  id: "earth",
  name: "Terra",
  type: "planet",
  realRadiusKm: 6371,
  aAU: 1.0,
  periodDays: 365.256,
  L0: 100.46435,
  axialTilt: 23.44,
  rotDays: 0.997,
  roughness: 0.8,
  menuColor: "#3b7fd4",
  makeTexture() {
    const tex = loader.load("earth.jpg");
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  },
};
