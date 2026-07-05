// Terra — de longe usa a earth.jpg leve (~350KB, 1280×640); de perto o LOD
// troca pro Blue Marble da NASA em 4k (o dobro dos outros corpos: é o planeta
// inicial do jogo, visto de pertíssimo, e a hi-res é descartada ao afastar).
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
  hiresTextureUrl: "textures/4k_earth.jpg", // NASA Blue Marble (LOD na aproximação)
  makeTexture() {
    const tex = loader.load("earth.jpg");
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  },
};
