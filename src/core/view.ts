import * as W from "./wave";
import * as THREE from "three";

export function start(wave: W.Wave): void {
  new Renderer(
    wave,
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

type PatternTextures = { [key: string]: THREE.Texture };

function renderPatternTextures(patterns: W.Pattern[]): PatternTextures {
  const textures: PatternTextures = {};
  for (const pattern of patterns) {
    textures[pattern.name] = renderPatternTexture(pattern);
  }
  return textures;
}

function renderPatternTexture(pattern: W.Pattern): THREE.Texture {
  const CellSize = 32;
  const FillRatio = 0.8;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height =
    CellSize * Math.max(pattern.grid.cols, pattern.grid.rows);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < pattern.grid.elements; i++) {
    const row = Math.floor(i / pattern.grid.cols);
    const col = i % pattern.grid.cols;
    const cell = pattern.grid.get(row, col);
    if (cell !== W.Cell.O) {
      ctx.fillRect(
        canvas.width * 0.5 + CellSize * (col - pattern.grid.cols / 2),
        canvas.height * 0.5 + CellSize * (row - pattern.grid.rows / 2),
        FillRatio * CellSize,
        FillRatio * CellSize
      );
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  return texture;
}

function worldToScreen(
  canvas: HTMLCanvasElement,
  position: [number, number]
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [rect.left + position[0], rect.bottom - position[1]];
}

function screenToWorld(
  canvas: HTMLCanvasElement,
  position: [number, number]
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [position[0] - rect.left, rect.bottom - position[1]];
}

class Mouse {
  position: [number, number] = [NaN, NaN];
  screenPosition: [number, number] = [NaN, NaN];
  click: boolean = false;
  nextClick: boolean = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousemove", (e) => {
      this.screenPosition = [e.clientX, e.clientY];
      this.position = screenToWorld(this.canvas, this.screenPosition);
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
  private elementTag: any = null;

  constructor(
    private readonly mouse: Mouse,
    private readonly canvas: HTMLCanvasElement
  ) {
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

  show(
    tag: any,
    when: boolean | Box,
    content?: () => string,
    position?: [number, number]
  ): void {
    const [mouseX, mouseY] = this.mouse.position;
    const shown =
      when === true
        ? true
        : when === false
        ? false
        : when.left <= mouseX &&
          mouseX <= when.right &&
          when.bottom <= mouseY &&
          mouseY <= when.top;
    if (shown) {
      this.element.style.display = "block";
      this.element.innerHTML = content ? content() : "";
      const offset = 10;
      let [tipX, tipY] = worldToScreen(
        this.canvas,
        position !== undefined ? position : this.mouse.position
      );
      if (position === undefined) {
        tipX += offset;
        tipY += offset;
      }
      this.element.style.left = `${tipX}px`;
      this.element.style.top = `${tipY}px`;
      this.elementTag = tag;
    } else if (this.elementTag === tag) {
      this.element.style.display = "none";
      this.elementTag = null;
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
        map: {
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
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vTint;
        void main() {
          vec4 c = texture2D(map, vUv);
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

class Item {
  private readonly mesh: THREE.Mesh;

  constructor(
    texture: string | THREE.Texture,
    private readonly tipText: string,
    private readonly tooltip: Tooltip,
    scene: THREE.Scene
  ) {
    const map = typeof texture === "string" ? loadTexture(texture) : texture;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        color: 0xaaaaaa,
      })
    );
    this.mesh.position.z = 0.05;
    scene.add(this.mesh);
  }

  update(cx: number, cy: number, w: number, h: number): void {
    const InnerSizeRatio = 0.6;
    this.mesh.position.set(cx, cy, this.mesh.position.z);
    this.mesh.scale.set(w * InnerSizeRatio, h * InnerSizeRatio, 1);
    this.tooltip.show(
      this,
      {
        left: cx - w / 2,
        right: cx + w / 2,
        bottom: cy - h / 2,
        top: cy + h / 2,
      },
      () => this.tipText
    );
  }
}

class Button {
  private readonly mesh: THREE.Mesh;
  private readonly outline: Outline;
  enabled: boolean = true;
  selected: boolean = false;

  constructor(
    texture: string,
    private readonly tipText: string | null,
    private readonly mouse: Mouse,
    private readonly tooltip: Tooltip,
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
    // Tooltip
    if (this.tipText !== null) {
      this.tooltip.show(
        this,
        {
          left: cx - w / 2,
          right: cx + w / 2,
          bottom: cy - h / 2,
          top: cy + h / 2,
        },
        () => this.tipText!
      );
    }
  }
}

class Pips {
  private readonly fills: THREE.Mesh[] = [];
  private readonly outlines: THREE.Mesh[] = [];

  constructor(private readonly count: number, scene: THREE.Scene) {
    const fillGeometry = new THREE.CircleGeometry(0.5, 24);
    const outlineGeometry = new THREE.RingGeometry(0.42, 0.5, 24);
    const fillMaterial = new THREE.MeshBasicMaterial({ color: 0xb37e1d });
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: 0x888888,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < count; i++) {
      const outline = new THREE.Mesh(outlineGeometry, outlineMaterial.clone());
      outline.position.z = 0.02;
      this.outlines.push(outline);
      scene.add(outline);

      const fill = new THREE.Mesh(fillGeometry, fillMaterial.clone());
      fill.position.z = 0.03;
      this.fills.push(fill);
      scene.add(fill);
    }
  }

  update(cx: number, cy: number, w: number, h: number, nfilled: number): void {
    const filled = Math.max(0, Math.min(this.count, Math.floor(nfilled)));
    const deltax = w / this.count;
    const scale = Math.min(h, deltax) * 0.7;
    for (let i = 0; i < this.count; i++) {
      const x = cx - w / 2 + (i + 0.5) * deltax;
      this.outlines[i].position.set(x, cy, this.outlines[i].position.z);
      this.outlines[i].scale.set(scale, scale, 1);
      this.fills[i].position.set(x, cy, this.fills[i].position.z);
      this.fills[i].scale.set(scale, scale, 1);
      this.fills[i].visible = this.count - 1 - i < filled;
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
    private readonly wave: W.Wave,
    private readonly mouse: Mouse,
    private readonly panel: PanelView,
    private readonly progress: ProgressView,
    scene: THREE.Scene
  ) {
    this.cells = new InstancedSpriteSheet(
      "img/cells.png",
      [1, 3],
      wave.grid.cells.length,
      scene
    );
    this.carets = new InstancedSpriteSheet(
      "img/caret.png",
      [1, 1],
      2 * (wave.grid.rows + wave.grid.cols),
      scene
    );
    this.hoverOutline = new Outline(0xaaaaaa, 0.05, scene);
    this.hoverOutline.line.visible = false;
    this.srcOutline = new Outline(0x447744, 0.05, scene);
    this.srcOutline.line.visible = false;
  }

  // Update instance matrices to match layout.grid and the current wave.grid
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

    const grid = this.wave.grid;
    const cellSize = Math.min(
      (bounds.right - bounds.left) / (grid.cols + 2),
      (bounds.top - bounds.bottom) / (grid.rows + 2)
    );
    const outlineSize = cellSize * (1 - 2 * OutlinePad);
    const markSize = MarkSizeRatio * cellSize;
    const cellsLeft = bounds.left + cellSize;
    const cellsTop = bounds.top - cellSize;

    // Mouse hover & click
    let hoverIndices = new Set<number>();
    let patternIndices = new Set<number>();
    let hoverComponent: number | null = null;
    const mrow = Math.floor((cellsTop - this.mouse.position[1]) / cellSize);
    const mcol = Math.floor((this.mouse.position[0] - cellsLeft) / cellSize);
    this.hoverOutline.line.visible = false;
    if (0 <= mrow && mrow < grid.rows && 0 <= mcol && mcol < grid.cols) {
      // Mouse is over the grid of cells
      hoverComponent = this.wave.score.cellToComponent[mrow * grid.cols + mcol];
      if (hoverComponent !== null) {
        const component = this.wave.score.components[hoverComponent];
        hoverIndices = new Set(component.cellIndices);
        for (const match of component.matches) {
          for (let j = 0; j < match.pattern.grid.elements; j++) {
            if (match.pattern.grid.cells[j] !== W.Cell.O) {
              patternIndices.add(
                match.position +
                  Math.floor(j / match.pattern.grid.cols) * grid.cols +
                  (j % match.pattern.grid.cols)
              );
            }
          }
        }
      }
      const actionIdx = this.panel.selectedAction();
      if (actionIdx !== null && this.wave.s.actions[actionIdx].name == "swap") {
        this.hoverOutline.line.visible = true;
        this.hoverOutline.update(
          cellsLeft + (mcol + 0.5) * cellSize,
          cellsTop - (mrow + 0.5) * cellSize,
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
            this.wave.execute(actionIdx, { i: this.swapSrc, j: cellIdx });
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
      const y = cellsTop - (row + 0.5) * cellSize;
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
    private readonly wave: W.Wave,
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
      this.wave.s.targetScore - this.wave.totalScore
    );
    let progress2 = 0;
    let progress1 = Math.min(progressAll, this.wave.score.total);
    const progress0 = Math.max(0, progressAll - progress1);
    if (this.hoverComponent !== null) {
      progress2 = Math.min(
        progressAll,
        this.wave.score.components[this.hoverComponent].score
      );
      progress1 = Math.max(0, progress1 - progress2);
    }

    let y = 0;
    for (const [i, progress] of [progress0, progress1, progress2].entries()) {
      const h = (innerH * progress) / this.wave.s.targetScore;
      this.fill[i].position.set(
        cx,
        cy - innerH / 2 + y + h / 2,
        this.fill[i].position.z
      );
      this.fill[i].scale.set(innerW, h, 1);
      y += h;
    }

    // Tooltip
    if (this.hoverComponent !== null) {
      const component = this.wave.score.components[this.hoverComponent];
      this.tooltip.show(
        this,
        component.score > 0,
        () => {
          const explanation = component.scoreExplanation
            .map(
              (e) =>
                `-${e.points} ×${e.count}&nbsp;&nbsp;<em>${
                  e.pattern?.title ?? ""
                }</em>`
            )
            .join("<br>&nbsp;&nbsp;&nbsp;&nbsp;");
          return `- ${component.score} nnats<br>&nbsp;= ${explanation}`;
        },
        [
          bounds.right,
          cy + innerH * (progressAll / this.wave.s.targetScore - 1 / 2),
        ]
      );
    } else {
      this.tooltip.show(this, bounds, () => {
        return `${progressAll} nnats (- ${this.wave.score.total})`;
      });
    }
  }
}

class PanelView {
  private readonly background: THREE.Mesh;
  private readonly controls: Button[];
  private readonly actions: Button[];
  private readonly patterns: Item[];
  private readonly bonuses: Item[];
  private readonly framePips: Pips;
  private readonly rerollPips: Pips;

  constructor(
    private readonly wave: W.Wave,
    mouse: Mouse,
    tooltip: Tooltip,
    scene: THREE.Scene,
    patternTextures: PatternTextures
  ) {
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x2b2b2b })
    );
    this.background.position.z = 0.01;
    scene.add(this.background);

    this.controls = [
      new Button(
        "img/submit.png",
        /*tipText*/ null,
        mouse,
        tooltip,
        scene,
        () => this.wave.submit()
      ),
      new Button(
        "img/reroll.png",
        /*tipText*/ null,
        mouse,
        tooltip,
        scene,
        () => this.wave.reroll(),
        (button) => {
          button.enabled = this.wave.roll < this.wave.s.maxRolls;
        }
      ),
      new Button(
        "img/undo.png",
        /*tipText*/ null,
        mouse,
        tooltip,
        scene,
        () => this.wave.undo(),
        (button) => {
          button.enabled = this.wave.canUndo;
        }
      ),
      new Button(
        "img/redo.png",
        /*tipText*/ null,
        mouse,
        tooltip,
        scene,
        () => this.wave.redo(),
        (button) => {
          button.enabled = this.wave.canRedo;
        }
      ),
    ];
    this.actions = this.wave.s.actions.map(
      (action) =>
        new Button(
          `img/actions/${action.name}.png`,
          `<b>${action.title}</b><br>${action.description}`,
          mouse,
          tooltip,
          scene,
          (button) => {
            this.actions.forEach((b) => {
              b.selected = false;
            });
            button.selected = true;
          }
        )
    );
    this.patterns = this.wave.s.patterns.map((pattern) => {
      return new Item(
        patternTextures[pattern.name],
        `<b>${pattern.title}</b> [${pattern.grid.rows}×${pattern.grid.cols}]` +
          `<br>-${pattern.points} nnats`,
        tooltip,
        scene
      );
    });
    this.bonuses = this.wave.s.bonuses.map(
      (bonus) =>
        new Item(
          `img/bonuses/${bonus.name}.png`,
          `<b>${bonus.title}</b><br>${bonus.description}`,
          tooltip,
          scene
        )
    );

    this.framePips = new Pips(this.wave.s.maxFrames, scene);
    this.rerollPips = new Pips(this.wave.s.maxRolls, scene);
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
    const PipHeightRatio = 0.3;
    const rows =
      PipHeightRatio + // Pips: half-height
      Math.ceil(this.controls.length / cols) +
      Math.ceil(this.wave.s.actions.length / cols) +
      Math.ceil(this.patterns.length / cols) +
      Math.ceil(this.bonuses.length / cols);

    // Layout
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.bottom + bounds.top) / 2;
    const w = bounds.right - bounds.left;
    const h = bounds.top - bounds.bottom;
    const inset = 0.02 * Math.min(w, h);
    const sectionPad = 2 * inset;
    const buttonSize = Math.min(
      (w - 2 * inset) / cols,
      (h - 2 * inset - 2 * sectionPad) / rows
    );

    // Background
    this.background.position.set(cx, cy, this.background.position.z);
    this.background.scale.set(w, h, 1);

    // Pips
    const x0 = bounds.left + inset + buttonSize / 2;
    let y = bounds.top - inset - (PipHeightRatio * buttonSize) / 2;
    this.framePips.update(
      x0,
      y,
      buttonSize,
      PipHeightRatio * buttonSize,
      this.wave.framesRemaining
    );
    this.rerollPips.update(
      x0 + (1 % cols) * buttonSize,
      y - Math.floor(1 / cols) * buttonSize,
      buttonSize,
      PipHeightRatio * buttonSize,
      this.wave.rollsRemaining
    );
    y -= (PipHeightRatio * buttonSize) / 2 + buttonSize / 2;
    // Controls
    for (let i = 0; i < this.controls.length; i++) {
      this.controls[i].update(
        x0 + (i % cols) * buttonSize,
        y - Math.floor(i / cols) * buttonSize,
        buttonSize,
        buttonSize
      );
    }
    y -= sectionPad + buttonSize * Math.ceil(this.controls.length / cols);
    // Actions
    for (let i = 0; i < this.actions.length; i++) {
      const button = this.actions[i];
      button.enabled = this.wave.hasAction(i);
      button.update(
        x0 + (i % cols) * buttonSize,
        y - Math.floor(i / cols) * buttonSize,
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
    y -= sectionPad + buttonSize * Math.ceil(this.wave.s.actions.length / cols);
    // Patterns
    for (let i = 0; i < this.patterns.length; i++) {
      this.patterns[i].update(
        x0 + (i % cols) * buttonSize,
        y - Math.floor(i / cols) * buttonSize,
        buttonSize,
        buttonSize
      );
    }
    y -= sectionPad + buttonSize * Math.ceil(this.patterns.length / cols);
    // Bonuses
    for (let i = 0; i < this.bonuses.length; i++) {
      this.bonuses[i].update(
        x0 + (i % cols) * buttonSize,
        y - Math.floor(i / cols) * buttonSize,
        buttonSize,
        buttonSize
      );
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

  constructor(private readonly wave: W.Wave, canvas: HTMLCanvasElement) {
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
    this.tooltip = new Tooltip(this.mouse, canvas);
    this.progressView = new ProgressView(this.wave, this.scene, this.tooltip);
    const patternTextures = renderPatternTextures(this.wave.s.patterns);
    this.panelView = new PanelView(
      this.wave,
      this.mouse,
      this.tooltip,
      this.scene,
      patternTextures
    );
    this.gridView = new GridView(
      this.wave,
      this.mouse,
      this.panelView,
      this.progressView,
      this.scene
    );

    // Keyboard controls
    window.addEventListener("keydown", (e) => {
      if (e.key === " ") {
        e.preventDefault();
        this.wave.submit();
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
    // const dt = (time - this.lastTime) / 1000; // for animation
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
