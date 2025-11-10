import * as G from "./game";
import * as THREE from "three";

export function start(game: G.Game): void {
  new Renderer(
    game,
    document.getElementById("canvas-main") as HTMLCanvasElement
  );
}

type Box = { left: number; right: number; bottom: number; top: number };

class Logger {
  private trigger: boolean = false;
  constructor() {
    window.addEventListener("click", (e) => {
      this.trigger = true;
    });
  }
  log(...args: any[]) {
    if (this.trigger) {
      console.log(...args);
      this.trigger = false;
    }
  }
}

class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private lastTime: number | null = null;
  private readonly logger: Logger = new Logger();

  private gridBg: THREE.Mesh;

  constructor(game: G.Game, canvas: HTMLCanvasElement) {
    void game; // TODO

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.camera = new THREE.OrthographicCamera();
    this.camera.near = 0.1;
    this.camera.far = 1000;
    this.camera.position.z = 10;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      getComputedStyle(document.body).backgroundColor
    );
    this.onResize();
    window.addEventListener("resize", this.onResize.bind(this));
    requestAnimationFrame(this.onAnimate.bind(this));

    // Dummy content
    const w = window.innerWidth;
    const h = window.innerHeight;
    const planeGeometry = new THREE.PlaneGeometry(w / 4, h / 4);
    const texture = new THREE.TextureLoader().load("img/cells.png");
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.offset.set(0, 0.5);
    texture.repeat.set(1, 0.5);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    this.gridBg = new THREE.Mesh(planeGeometry, planeMaterial);
    this.gridBg.position.set(w / 2, h / 2, 0);
    this.scene.add(this.gridBg);
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  private onAnimate(time: number) {
    if (this.lastTime === null) {
      this.lastTime = time;
    }
    // const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    // TODO - update animations

    const layout = this.topLevelLayout();
    this.logger.log(layout);

    this.gridBg.position.set(
      (layout.grid.left + layout.grid.right) / 2,
      (layout.grid.bottom + layout.grid.top) / 2,
      0
    );
    this.gridBg.scale.set(
      (layout.grid.right - layout.grid.left) /
        this.gridBg.geometry.parameters.width,
      (layout.grid.top - layout.grid.bottom) /
        this.gridBg.geometry.parameters.height,
      1
    );

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.onAnimate.bind(this));
  }

  private topLevelLayout(): { grid: Box; panel: Box } {
    const w = this.camera.right - this.camera.left;
    const h = this.camera.top - this.camera.bottom;
    const pad = 0.02 * w;
    const panelW = 0.3 * w;
    const gridSize = Math.min(h - 2 * pad, w - panelW - 3 * pad);
    const y = h / 2 - gridSize / 2;
    return {
      grid: {
        left: pad,
        right: pad + gridSize,
        bottom: y,
        top: y + gridSize,
      },
      panel: {
        left: pad + gridSize + pad,
        right: pad + gridSize + pad + panelW,
        bottom: y,
        top: y + gridSize,
      },
    };
  }
}
