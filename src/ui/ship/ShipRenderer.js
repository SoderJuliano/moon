import * as THREE from "three";
import { buildShipModel } from "../shipFlight.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class ShipRenderer {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ship = null;
    this.animationFrameId = null;
    
    // Drag rotation states
    this.isDragging = false;
    this.prevMousePos = { x: 0, y: 0 };
    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.zoom = 1.0;
  }

  // def opcional: { modelPath, yaw } — sem def carrega a nave padrão (XR-07)
  init(def = null) {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060b);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 1.2, 3.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Hangar lighting
    const ambientLight = new THREE.AmbientLight(0x0b1122, 1.5);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x8bc7ff, 2.5);
    dirLight1.position.set(2, 4, 3);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffbfa3, 1.2);
    dirLight2.position.set(-2, -2, -3);
    this.scene.add(dirLight2);

    const spotLight = new THREE.SpotLight(0xffffff, 4, 10, Math.PI / 6, 0.5, 1);
    spotLight.position.set(0, 5, 0);
    this.scene.add(spotLight);

    // Ship Model Container
    this.ship = new THREE.Group();
    this.scene.add(this.ship);

    this._fallback = buildShipModel();
    this._fallback.scale.setScalar(1.5);
    this.ship.add(this._fallback);
    this._currentFix = null;
    this._modelReq = null;

    this.setModel(def?.modelPath || "models/Spaceship.glb", def?.yaw ?? Math.PI, def?.pitch ?? 0);

    // Grid Floor
    const grid = new THREE.GridHelper(6, 30, 0x1d294a, 0x0c1328);
    grid.position.y = -0.7;
    this.scene.add(grid);

    this._setupControls();
    this._startLoop();

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  // troca a nave exibida (carrossel do hangar). Última chamada vence.
  setModel(url, yaw = Math.PI, pitch = 0) {
    if (!this.ship) return;
    this._modelReq = url;
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (this._modelReq !== url || !this.ship) return;
        const s = gltf.scene;
        const box = new THREE.Box3().setFromObject(s);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        s.position.sub(center);
        s.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material.metalness = Math.min(o.material.metalness ?? 0, 0.35);
            if (o.material.roughness == null) o.material.roughness = 0.6;
          }
        });
        const fix = new THREE.Group();
        fix.add(s);
        fix.rotation.set(pitch, yaw, 0); // Nose should point in the correct direction
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        fix.scale.setScalar((1.6 / maxDim) * 1.5);
        this.ship.remove(this._currentFix || this._fallback);
        this._currentFix = fix;
        this.ship.add(fix);
      },
      undefined,
      (err) => {
        console.warn(`Failed to load ${url} in ShipRenderer, keeping current model:`, err);
      }
    );
  }

  _setupControls() {
    const onMouseDown = (e) => {
      this.isDragging = true;
      this.prevMousePos.x = e.clientX;
      this.prevMousePos.y = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.prevMousePos.x;
      const deltaY = e.clientY - this.prevMousePos.y;

      this.targetRotation.y += deltaX * 0.007;
      this.targetRotation.x += deltaY * 0.007;
      
      // Limit vertical rotation to avoid flipping upside down
      this.targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.targetRotation.x));

      this.prevMousePos.x = e.clientX;
      this.prevMousePos.y = e.clientY;
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      this.zoom += e.deltaY * 0.001;
      this.zoom = Math.max(0.6, Math.min(1.8, this.zoom));
    };

    // Touch Support
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      this.isDragging = true;
      this.prevMousePos.x = e.touches[0].clientX;
      this.prevMousePos.y = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - this.prevMousePos.x;
      const deltaY = e.touches[0].clientY - this.prevMousePos.y;

      this.targetRotation.y += deltaX * 0.007;
      this.targetRotation.x += deltaY * 0.007;
      this.targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.targetRotation.x));

      this.prevMousePos.x = e.touches[0].clientX;
      this.prevMousePos.y = e.touches[0].clientY;
    };

    this.container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    this.container.addEventListener("wheel", onWheel, { passive: false });

    this.container.addEventListener("touchstart", onTouchStart, { passive: true });
    this.container.addEventListener("touchmove", onTouchMove, { passive: true });
    this.container.addEventListener("touchend", onMouseUp);

    this._cleanupControls = () => {
      this.container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      this.container.removeEventListener("wheel", onWheel);
      this.container.removeEventListener("touchstart", onTouchStart);
      this.container.removeEventListener("touchmove", onTouchMove);
      this.container.removeEventListener("touchend", onMouseUp);
    };
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _startLoop() {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);

      // Auto-rotation when not dragging
      if (!this.isDragging) {
        this.targetRotation.y += 0.003;
      }

      // Smooth interpolation
      this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.1;
      this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.1;

      if (this.ship) {
        this.ship.rotation.set(0, 0, 0); // reset
        this.ship.rotateY(this.currentRotation.y);
        this.ship.rotateX(this.currentRotation.x);
      }

      // Smooth zoom
      if (this.camera) {
        const targetZ = 3.5 * this.zoom;
        this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;
      }

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this._cleanupControls) {
      this._cleanupControls();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}
