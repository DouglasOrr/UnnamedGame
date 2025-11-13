import * as G from "./game";
import * as THREE from "three";

export function start(game: G.Game): void {
  new Renderer(
    game,
    document.getElementById("canvas-main") as HTMLCanvasElement
  );
}

// Utility

class Logger {
  private trigger: boolean = false;
  constructor() {
    window.addEventListener("click", () => {
      this.trigger = true;
    });
  }
  log(...args: any[]) {
    if (this.trigger) {
      console.log(...args);
    }
  }
  tick() {
    this.trigger = false;
  }
}
const LOG = new Logger();

type Box = { left: number; right: number; bottom: number; top: number };

function backgroundColor(): THREE.Color {
  return new THREE.Color(getComputedStyle(document.body).backgroundColor);
}

function loadTexture(path: string): THREE.Texture {
  return new THREE.TextureLoader().load(path, undefined, undefined, (err) =>
    console.error(`Error loading texture ${path}`, err)
  );
}

class Mouse {
  position: [number, number] = [NaN, NaN];
  screenPosition: [number, number] = [NaN, NaN];
  click: boolean = false;
  nextClick: boolean = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousemove", (e) => {
      this.screenPosition = [e.clientX, e.clientY];
      const rect = this.canvas.getBoundingClientRect();
      this.position = [e.clientX - rect.left, rect.bottom - e.clientY];
    });
    canvas.addEventListener("mouseleave", () => {
      this.position = this.screenPosition = [NaN, NaN];
    });
    canvas.addEventListener("click", () => {
      this.nextClick = true;
    });
  }

  update() {
    this.click = this.nextClick;
    this.nextClick = false;
  }

  postUpdate() {
    this.click = false;
  }

  inside(cx: number, cy: number, w: number, h: number): boolean {
    return (
      cx - w / 2 <= this.position[0] &&
      this.position[0] <= cx + w / 2 &&
      cy - h / 2 <= this.position[1] &&
      this.position[1] <= cy + h / 2
    );
  }
}

class Tooltip {
  private readonly element: HTMLDivElement;
  private elementTag: string = "";

  constructor(private readonly mouse: Mouse) {
    this.element = document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.padding = "6px 8px";
    this.element.style.background = "#000000cc";
    this.element.style.color = "white";
    this.element.style.fontFamily = "sans-serif";
    this.element.style.fontSize = "12px";
    this.element.style.borderRadius = "4px";
    this.element.style.pointerEvents = "none";
    this.element.style.display = "none"; // hidden by default
    document.body.appendChild(this.element);
  }

  hover(box: Box, tag: string, content: () => string): void {
    const [x, y] = this.mouse.position;
    if (box.left <= x && x <= box.right && box.bottom <= y && y <= box.top) {
      this.element.style.display = "block";
      this.element.textContent = content();
      const offset = 10;
      const [screenX, screenY] = this.mouse.screenPosition;
      this.element.style.left = `${screenX + offset}px`;
      this.element.style.top = `${screenY + offset}px`;
      this.elementTag = tag;
    } else if (this.elementTag === tag) {
      this.element.style.display = "none";
      this.elementTag = "";
    }
  }
}

// Components

class Outline {
  readonly line: THREE.Line;

  constructor(color: number, z: number, scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    const a = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(a), 3)
    );
    this.line = new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({ color: color })
    );
    this.line.position.z = z;
    scene.add(this.line);
  }

  update(cx: number, cy: number, w: number, h: number): void {
    this.line.position.set(cx, cy, this.line.position.z);
    this.line.scale.set(w, h, 1);
  }
}

class InstancedSpriteSheet {
  private readonly mesh: THREE.InstancedMesh;
  private readonly tileAttr: THREE.InstancedBufferAttribute;
  private readonly tileArray: Float32Array;
  private readonly tintAttr: THREE.InstancedBufferAttribute;
  private readonly tintArray: Float32Array;

  // Temporaries
  private readonly mat = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(
    texturePath: string,
    tiles: [number, number],
    instanceCount: number,
    scene: THREE.Scene
  ) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tex: {
          value: loadTexture(texturePath),
        },
        texTiles: { value: new THREE.Vector2(tiles[0], tiles[1]) },
      },
      vertexShader: `
        attribute vec2 tile;
        attribute vec3 tint;
        uniform vec2 texTiles;

        varying vec2 vUv;
        varying vec3 vTint;

        void main() {
          vUv = (uv + tile) / texTiles;
          vTint = tint;
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tex;
        varying vec2 vUv;
        varying vec3 vTint;
        void main() {
          vec4 c = texture2D(tex, vUv);
          if (c.a < 0.01) discard;
          gl_FragColor = vec4(c.rgb * vTint, c.a);
        }
      `,
      transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      material,
      instanceCount
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.tileArray = new Float32Array(2 * this.mesh.count).fill(0);
    this.tileAttr = new THREE.InstancedBufferAttribute(this.tileArray, 2);
    this.tileAttr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute("tile", this.tileAttr);

    this.tintArray = new Float32Array(3 * this.mesh.count).fill(1);
    this.tintAttr = new THREE.InstancedBufferAttribute(this.tintArray, 3);
    this.tintAttr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute("tint", this.tintAttr);

    scene.add(this.mesh);
  }

  get instanceCount(): number {
    return this.mesh.count;
  }

  update(
    index: number,
    pos: [number, number],
    scale: [number, number],
    rot: number,
    tile: [number, number],
    tint: [number, number, number]
  ): void {
    this.mat.compose(
      this.pos.set(pos[0], pos[1], 0),
      this.quat.setFromAxisAngle(new THREE.Vector3(0, 0, -1), rot),
      this.scale.set(scale[0], scale[1], 1)
    );
    this.mesh.setMatrixAt(index, this.mat);
    this.tileArray[index * 2] = tile[0];
    this.tileArray[index * 2 + 1] = tile[1];
    this.tintArray[index * 3] = tint[0];
    this.tintArray[index * 3 + 1] = tint[1];
    this.tintArray[index * 3 + 2] = tint[2];
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tileAttr.needsUpdate = true;
    this.tintAttr.needsUpdate = true;
  }
}

class Button {
  private readonly mesh: THREE.Mesh;
  private readonly outline: Outline;
  enabled: boolean = true;
  selected: boolean = false;

  constructor(
    texture: string,
    private readonly mouse: Mouse,
    scene: THREE.Scene,
    private readonly click: (button: Button) => void,
    private readonly onUpdate?: (button: Button) => void
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: loadTexture(texture),
        transparent: true,
      })
    );
    this.mesh.position.z = 0.05;
    scene.add(this.mesh);

    this.outline = new Outline(0x447744, 0.05, scene);
  }

  update(cx: number, cy: number, w: number, h: number): void {
    if (this.onUpdate) {
      this.onUpdate(this);
    }
    const InnerSizeRatio = 0.6;
    const HoverSizeRatio = 1.05;
    const OutlinePad = 0.04;
    const Colors = {
      hovered: 0xffffff,
      enabled: 0xaaaaaa,
      disabled: 0x555555,
    };

    // Hover: size & color
    const hover = this.enabled && this.mouse.inside(cx, cy, w, h);
    const sizeRatio = hover ? HoverSizeRatio * InnerSizeRatio : InnerSizeRatio;
    this.mesh.position.set(cx, cy, this.mesh.position.z);
    this.mesh.scale.set(w * sizeRatio, h * sizeRatio, 1);
    (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(
      hover ? Colors.hovered : this.enabled ? Colors.enabled : Colors.disabled
    );

    // Selected: outline
    const pad = Math.min(w, h) * OutlinePad;
    this.outline.line.visible = this.selected && this.enabled;
    this.outline.update(cx, cy, w - 2 * pad, h - 2 * pad);

    // Clickable
    if (hover && this.mouse.click) {
      this.click(this);
    }
  }
}

// Views

class GridView {
  private readonly cells: InstancedSpriteSheet;
  private readonly carets: InstancedSpriteSheet;
  private readonly hoverOutline: Outline;
  private readonly srcOutline: Outline;
  private swapSrc: number | null = null;

  constructor(
    private readonly game: G.Game,
    private readonly mouse: Mouse,
    private readonly panel: PanelView,
    private readonly progress: ProgressView,
    scene: THREE.Scene
  ) {
    this.cells = new InstancedSpriteSheet(
      "img/cells.png",
      [1, 3],
      game.grid.cells.length,
      scene
    );
    this.carets = new InstancedSpriteSheet(
      "img/caret.png",
      [1, 1],
      2 * (game.grid.rows + game.grid.cols),
      scene
    );
    this.hoverOutline = new Outline(0xaaaaaa, 0.05, scene);
    this.hoverOutline.line.visible = false;
    this.srcOutline = new Outline(0x447744, 0.05, scene);
    this.srcOutline.line.visible = false;
  }

  // Update instance matrices to match layout.grid and the current game.grid
  update(bounds: Box): void {
    const MarkSizeRatio = 0.5;
    const MarkHoverGrow = 1.05;
    const OutlinePad = 0.04;

    const color = (v: number): [number, number, number] =>
      new THREE.Color(v).toArray() as [number, number, number];

    const colors = {
      caret: color(0x99aa99),
      o: color(0x999999),
      xw: color(0xdddddd),
      hover: color(0xeeeeee),
      pattern: color(0xffdd55),
    };

    const grid = this.game.grid;
    const cellSize = Math.min(
      (bounds.right - bounds.left) / (grid.cols + 2),
      (bounds.top - bounds.bottom) / (grid.rows + 2)
    );
    const outlineSize = cellSize * (1 - 2 * OutlinePad);
    const markSize = MarkSizeRatio * cellSize;
    const cellsLeft = bounds.left + cellSize;
    const cellsBottom = bounds.bottom + cellSize;

    // Mouse hover & click
    let hoverIndices = new Set<number>();
    let patternIndices = new Set<number>();
    let hoverComponent: number | null = null;
    const mrow = Math.floor((this.mouse.position[1] - cellsBottom) / cellSize);
    const mcol = Math.floor((this.mouse.position[0] - cellsLeft) / cellSize);
    this.hoverOutline.line.visible = false;
    if (0 <= mrow && mrow < grid.rows && 0 <= mcol && mcol < grid.cols) {
      // Mouse is over the grid of cells
      hoverComponent = this.game.score.cellToComponent[mrow * grid.cols + mcol];
      if (hoverComponent !== null) {
        const component = this.game.score.components[hoverComponent];
        hoverIndices = new Set(component.indices);
        for (const i in component.patterns) {
          const pattern = this.game.patterns[component.patterns[i]];
          const pos = component.patternPositions[i];
          for (let j = 0; j < pattern.grid.rows * pattern.grid.cols; j++) {
            if (pattern.grid.cells[j] !== G.Cell.O) {
              patternIndices.add(
                pos +
                  Math.floor(j / pattern.grid.cols) * grid.cols +
                  (j % pattern.grid.cols)
              );
            }
          }
        }
      }
      const actionIdx = this.panel.selectedAction();
      if (actionIdx !== null && this.game.actions[actionIdx].name == "swap") {
        this.hoverOutline.line.visible = true;
        this.hoverOutline.update(
          cellsLeft + (mcol + 0.5) * cellSize,
          cellsBottom + (mrow + 0.5) * cellSize,
          outlineSize,
          outlineSize
        );
        if (this.mouse.click) {
          const cellIdx = mrow * grid.cols + mcol;
          if (this.swapSrc === null) {
            this.swapSrc = cellIdx;
          } else if (this.swapSrc === cellIdx) {
            this.swapSrc = null; // cancel
          } else {
            this.game.execute(actionIdx, { i: this.swapSrc, j: cellIdx });
            this.swapSrc = null;
          }
        }
      }
    }
    this.progress.hover(hoverComponent);

    // Cells
    if (this.swapSrc === null) {
      this.srcOutline.line.visible = false;
    }
    for (let i = 0; i < grid.cells.length; i++) {
      const row = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      const x = cellsLeft + (col + 0.5) * cellSize;
      const y = cellsBottom + (row + 0.5) * cellSize;
      const tint = patternIndices.has(i)
        ? colors.pattern
        : hoverIndices.has(i)
        ? colors.hover
        : grid.cells[i] === 0
        ? colors.o
        : colors.xw;
      const size = hoverIndices.has(i) ? MarkHoverGrow * markSize : markSize;
      this.cells.update(
        i,
        /*pos*/ [x, y],
        /*scale*/ [size, size],
        /*rot*/ 0,
        /*tile*/ [0, 2 - grid.cells[i]],
        /*tint*/ tint
      );
      if (i === this.swapSrc) {
        this.srcOutline.update(x, y, outlineSize, outlineSize);
        this.srcOutline.line.visible = true;
      }
    }

    // Carets
    let caretIndex = 0;
    const addCaret = (row: number, col: number, rot: number) => {
      this.carets.update(
        caretIndex++,
        /*pos*/ [
          bounds.left + (col + 1.5) * cellSize,
          bounds.bottom + (row + 1.5) * cellSize,
        ],
        /*scale*/ [markSize, 0.5 * markSize],
        /*rot*/ rot,
        /*tile*/ [0, 0],
        /*tint*/ colors.caret
      );
    };
    for (let i = 0; i < grid.cols; i++) {
      addCaret(-1, i, 0);
      addCaret(grid.rows, i, Math.PI);
    }
    for (let i = 0; i < grid.rows; i++) {
      addCaret(i, -1, Math.PI / 2);
      addCaret(i, grid.cols, -Math.PI / 2);
    }
  }
}

class ProgressView {
  private readonly outline: THREE.Mesh;
  private readonly background: THREE.Mesh;
  private readonly fill: [THREE.Mesh, THREE.Mesh, THREE.Mesh];
  private hoverComponent: number | null = null;

  constructor(
    private readonly game: G.Game,
    scene: THREE.Scene,
    private readonly tooltip: Tooltip
  ) {
    this.outline = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x161616 })
    );
    this.outline.position.z = 0;

    scene.add(this.outline);
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: backgroundColor().getHex() })
    );
    this.background.position.z = 0.01;
    scene.add(this.background);

    // Colors: remaining nats, scored nats, hover nats
    this.fill = [0x447744, 0xb37e1d, 0xdddddd].map(
      (color) =>
        new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color: color })
        )
    ) as unknown as [THREE.Mesh, THREE.Mesh, THREE.Mesh];
    for (const f of this.fill) {
      f.position.z = 0.02;
      scene.add(f);
    }
  }

  hover(component: number | null) {
    this.hoverComponent = component;
  }

  update(bounds: Box): void {
    // Basic layout
    const w = bounds.right - bounds.left;
    const h = 0.85 * (bounds.top - bounds.bottom);
    const inset = 0.2 * Math.min(w, h);
    const innerW = w - 2 * inset;
    const innerH = h - 2 * inset;
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.bottom + bounds.top) / 2;

    this.outline.position.set(cx, cy, this.outline.position.z);
    this.outline.scale.set(w, h, 1);
    this.background.position.set(cx, cy, this.background.position.z);
    this.background.scale.set(innerW, innerH, 1);

    // Progress
    const progressAll = Math.max(
      0,
      this.game.targetScore - this.game.roundScore
    );
    let progress2 = 0;
    let progress1 = Math.min(progressAll, this.game.score.total);
    const progress0 = Math.max(0, progressAll - progress1);
    if (this.hoverComponent !== null) {
      progress2 = Math.min(
        progressAll,
        this.game.score.components[this.hoverComponent].score
      );
      progress1 = Math.max(0, progress1 - progress2);
    }

    let y = 0;
    for (const [i, progress] of [progress0, progress1, progress2].entries()) {
      const h = (innerH * progress) / this.game.targetScore;
      this.fill[i].position.set(
        cx,
        cy - innerH / 2 + y + h / 2,
        this.fill[i].position.z
      );
      this.fill[i].scale.set(innerW, h, 1);
      y += h;
    }

    // Tooltip
    this.tooltip.hover(bounds, "progress", () => {
      return `${progressAll} nnats (- ${this.game.score.total})`;
    });
  }
}

class PanelView {
  private readonly background: THREE.Mesh;
  private readonly controls: Button[];
  private readonly actions: Button[];

  constructor(private readonly game: G.Game, mouse: Mouse, scene: THREE.Scene) {
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x2b2b2b })
    );
    this.background.position.z = 0.01;
    scene.add(this.background);

    this.controls = [
      new Button("img/submit.png", mouse, scene, () => this.game.submit()),
      new Button(
        "img/shuffle.png",
        mouse,
        scene,
        () => this.game.newGrid(),
        (button) => {
          button.enabled = this.game.roll < this.game.maxRolls;
        }
      ),
      new Button(
        "img/undo.png",
        mouse,
        scene,
        () => this.game.undo(),
        (button) => {
          button.enabled = this.game.stateIndex > 0;
        }
      ),
      new Button(
        "img/redo.png",
        mouse,
        scene,
        () => this.game.redo(),
        (button) => {
          button.enabled = this.game.stateIndex < this.game.state.length - 1;
        }
      ),
    ];
    this.actions = this.game.actions.map(
      (action) =>
        new Button(`img/actions/${action.name}.png`, mouse, scene, (button) => {
          this.actions.forEach((b) => {
            b.selected = false;
          });
          button.selected = true;
        })
    );
  }

  selectedAction(): number | null {
    for (let i = 0; i < this.actions.length; i++) {
      if (this.actions[i].selected) {
        return i;
      }
    }
    return null;
  }

  update(bounds: Box): void {
    const cols = 4;
    const minRows =
      Math.ceil(this.controls.length / cols) +
      Math.ceil(this.game.patterns.length / cols) +
      Math.ceil(this.game.actions.length / cols);

    // Layout
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.bottom + bounds.top) / 2;
    const w = bounds.right - bounds.left;
    const h = bounds.top - bounds.bottom;
    const inset = 0.02 * Math.min(w, h);
    const sectionPad = 2 * inset;
    const buttonSize = Math.min(
      (w - 2 * inset) / cols,
      (h - 2 * inset - 2 * sectionPad) / minRows
    );

    // Positions
    this.background.position.set(cx, cy, this.background.position.z);
    this.background.scale.set(w, h, 1);
    for (let i = 0; i < this.controls.length; i++) {
      this.controls[i].update(
        bounds.left + inset + (i % cols) * buttonSize + buttonSize / 2,
        bounds.top - inset - Math.floor(i / cols) * buttonSize - buttonSize / 2,
        buttonSize,
        buttonSize
      );
    }
    for (let i = 0; i < this.actions.length; i++) {
      const button = this.actions[i];
      button.enabled = this.game.hasAction(i);
      button.update(
        bounds.left + inset + (i % cols) * buttonSize + buttonSize / 2,
        bounds.top -
          inset -
          sectionPad -
          buttonSize *
            (Math.ceil(this.controls.length / cols) + Math.floor(i / cols)) -
          buttonSize / 2,
        buttonSize,
        buttonSize
      );
      button.selected &&= button.enabled;
    }
    // If no action is selected, select the first enabled one
    if (this.actions.reduce((acc, b) => acc || b.selected, false) === false) {
      for (const b of this.actions) {
        if (b.enabled) {
          b.selected = true;
          break;
        }
      }
    }
  }
}

// Core rendering

class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private lastTime: number | null = null;

  private readonly mouse: Mouse;
  private readonly tooltip: Tooltip;
  private readonly gridView: GridView;
  private readonly progressView: ProgressView;
  private readonly panelView: PanelView;

  constructor(private readonly game: G.Game, canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.camera = new THREE.OrthographicCamera();
    this.camera.near = 0.1;
    this.camera.far = 1000;
    this.camera.position.z = 10;
    this.scene = new THREE.Scene();
    this.scene.background = backgroundColor();
    this.onResize();
    window.addEventListener("resize", this.onResize.bind(this));
    requestAnimationFrame(this.onAnimate.bind(this));

    // Views
    this.mouse = new Mouse(canvas);
    this.tooltip = new Tooltip(this.mouse);
    this.progressView = new ProgressView(this.game, this.scene, this.tooltip);
    this.panelView = new PanelView(this.game, this.mouse, this.scene);
    this.gridView = new GridView(
      this.game,
      this.mouse,
      this.panelView,
      this.progressView,
      this.scene
    );

    // Keyboard controls
    window.addEventListener("keydown", (e) => {
      if (e.key === " ") {
        e.preventDefault();
        this.game.submit();
      }
    });
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
    // Preamble
    if (this.lastTime === null) {
      this.lastTime = time;
    }
    // const dt = (time - this.lastTime) / 1000; // TODO: animate
    this.lastTime = time;

    // Update views
    this.mouse.update();
    const layout = this.topLevelLayout();
    this.gridView.update(layout.grid);
    this.progressView.update(layout.progress);
    this.panelView.update(layout.panel);
    this.mouse.postUpdate();

    // Render
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.onAnimate.bind(this));
    LOG.tick();
  }

  private topLevelLayout(): { grid: Box; progress: Box; panel: Box } {
    const w = this.camera.right - this.camera.left;
    const h = this.camera.top - this.camera.bottom;
    const pad = 0.02 * w;
    const panelW = 0.25 * w;
    const progressW = Math.min(0.03 * w, 0.03 * (h - 2 * pad));
    const gridSize = Math.min(h - 2 * pad, w - panelW - progressW - 4 * pad);
    const y = h / 2 - gridSize / 2;
    return {
      grid: {
        left: pad,
        right: pad + gridSize,
        bottom: y,
        top: y + gridSize,
      },
      progress: {
        left: pad + gridSize + pad,
        right: pad + gridSize + pad + progressW,
        bottom: y,
        top: y + gridSize,
      },
      panel: {
        left: pad + gridSize + pad + progressW + pad,
        right: pad + gridSize + pad + progressW + pad + panelW,
        bottom: y,
        top: y + gridSize,
      },
    };
  }
}
