import * as THREE from "three";
import * as R from "./run";
import * as W from "./wave";

export function start(run: R.Run): void {
  new Renderer(
    run,
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

const Colors = {
  foreground: 0xffffff,
  outline: 0x888888,
  item_outline: { common: 0x888888, uncommon: 0x1d2fb7, rare: 0xb12121 },
};

type CBox = { cx: number; cy: number; w: number; h: number };
type Box = { left: number; right: number; bottom: number; top: number };

function backgroundColor(): THREE.Color {
  return new THREE.Color(getComputedStyle(document.body).backgroundColor);
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

  hide() {
    this.element.style.display = "none";
    this.elementTag = null;
  }

  show(
    tag: any,
    when: boolean | CBox,
    content?: () => string,
    position?: [number, number]
  ): void {
    const [mouseX, mouseY] = this.mouse.position;
    const shown =
      when === true
        ? true
        : when === false
        ? false
        : when.cx - when.w / 2 <= mouseX &&
          mouseX <= when.cx + when.w / 2 &&
          when.cy - when.h / 2 <= mouseY &&
          mouseY <= when.cy + when.h / 2;
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
      this.hide();
    }
  }
}

interface ViewContext {
  mouse: Mouse;
  tooltip: Tooltip;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
}

// Textures

const TextureCache: { [id: string]: THREE.Texture } = {};

function renderPatternTexture(pattern: W.Pattern): THREE.Texture {
  const Size = 256;
  const FillRatio = 0.8;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Size;
  const cellSize = Size / Math.max(pattern.grid.cols, pattern.grid.rows);
  const fillSize = FillRatio * cellSize;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < pattern.grid.elements; i++) {
    const row = Math.floor(i / pattern.grid.cols);
    const col = i % pattern.grid.cols;
    const cell = pattern.grid.get(row, col);
    if (cell !== W.Cell.O) {
      const cx = Size * 0.5 + cellSize * (col + 0.5 - pattern.grid.cols / 2);
      const cy = Size * 0.5 + cellSize * (row + 0.5 - pattern.grid.rows / 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - fillSize / 2, cy - fillSize / 2, fillSize, fillSize);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  return texture;
}

function loadTexture(p: string | W.Item): THREE.Texture {
  const key = typeof p === "string" ? p : `img/${p.kind}/${p.name}.png`;
  if (!TextureCache[key]) {
    if (typeof p === "string" || p.kind !== "pattern") {
      TextureCache[key] = new THREE.TextureLoader().load(
        key,
        undefined,
        undefined,
        (err) => console.error(`Error loading texture ${key}`, err)
      );
    } else {
      TextureCache[key] = renderPatternTexture(p);
    }
  }
  return TextureCache[key];
}

// Components

interface Component {
  update(cx: number, cy: number, w: number, h: number): void;
}

class Outline implements Component {
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

class Button implements Component {
  private readonly mesh: THREE.Mesh;
  private readonly outline: Outline;
  enabled: boolean = true;
  selected: boolean = false;

  constructor(
    texture: THREE.Texture,
    outlineColor: number,
    private readonly tipText: string | null,
    private readonly context: ViewContext,
    private readonly click?: (button: Button) => void,
    private readonly onUpdate?: (button: Button) => void,
    readonly selectable: boolean = true
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
      })
    );
    this.mesh.position.z = 0.05;
    this.context.scene.add(this.mesh);

    this.outline = new Outline(outlineColor, 0.05, this.context.scene);
  }

  update(cx: number, cy: number, w: number, h: number): void {
    if (this.onUpdate) {
      this.onUpdate(this);
    }
    const HoverSizeRatio = 1.05;
    const OutlinePad = 0.04;
    const InnerSizeRatio = 0.7;
    const Colors = {
      hovered: 0xffffff,
      enabled: 0xaaaaaa,
      disabled: 0x555555,
    };

    // Hover: size & color
    const hover =
      this.click && this.enabled && this.context.mouse.inside(cx, cy, w, h);
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

    // Click
    if (hover && this.context.mouse.click) {
      this.click(this);
    }
    // Tooltip
    if (this.tipText !== null) {
      this.context.tooltip.show(this, { cx, cy, w, h }, () => this.tipText!);
    }
  }
}

class Pips implements Component {
  filled: number;
  private readonly fills: THREE.Mesh[] = [];
  private readonly outlines: THREE.Mesh[] = [];

  constructor(
    readonly total: number,
    scene: THREE.Scene,
    readonly fillFrom: "left" | "right" = "left"
  ) {
    const fillGeometry = new THREE.CircleGeometry(0.5, 24);
    const outlineGeometry = new THREE.RingGeometry(0.42, 0.5, 24);
    const fillMaterial = new THREE.MeshBasicMaterial({ color: 0xb37e1d });
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: 0x888888,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < this.total; i++) {
      const outline = new THREE.Mesh(outlineGeometry, outlineMaterial.clone());
      outline.position.z = 0.02;
      this.outlines.push(outline);
      scene.add(outline);

      const fill = new THREE.Mesh(fillGeometry, fillMaterial.clone());
      fill.position.z = 0.03;
      this.fills.push(fill);
      scene.add(fill);
    }
    this.filled = total;
  }

  update(cx: number, cy: number, w: number, h: number): void {
    const filled = Math.max(0, Math.min(this.total, Math.floor(this.filled)));
    const deltax = w / this.total;
    const scale = Math.min(h, deltax) * 0.7;
    for (let i = 0; i < this.total; i++) {
      const x = cx - w / 2 + (i + 0.5) * deltax;
      this.outlines[i].position.set(x, cy, this.outlines[i].position.z);
      this.outlines[i].scale.set(scale, scale, 1);
      this.fills[i].position.set(x, cy, this.fills[i].position.z);
      this.fills[i].scale.set(scale, scale, 1);
      this.fills[i].visible =
        this.fillFrom === "left" ? i < filled : this.total - 1 - i < filled;
    }
  }
}

// Views

class MenuView {
  private readonly background: THREE.Mesh;
  private readonly progress: Pips;

  constructor(
    private readonly run: R.Run,
    private readonly context: ViewContext
  ) {
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x2b2b2b })
    );
    this.background.position.z = 0;
    context.scene.add(this.background);
    this.progress = new Pips(this.run.totalWaves(), context.scene);
  }

  update(bounds: Box): void {
    this.progress.filled = this.run.waveCount();

    const InsetRatio = 0.05;
    const PipHeightRatio = 0.5;
    const PipMaxAspect = 1.5;

    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.bottom + bounds.top) / 2;
    const w = bounds.right - bounds.left;
    const h = bounds.top - bounds.bottom;
    this.background.position.set(cx, cy, this.background.position.z);
    this.background.scale.set(w, h, 1);

    const inset = InsetRatio * Math.min(w, h);
    const pipsH = PipHeightRatio * (h - 2 * inset);
    const pipsW = Math.min(
      PipMaxAspect * pipsH * this.progress.total,
      w - 2 * inset
    );
    const pipsX = bounds.left + inset + pipsW / 2;
    this.progress.update(pipsX, cy, pipsW, pipsH);

    this.context.tooltip.show(
      this,
      {
        cx: pipsX,
        cy: cy,
        w: pipsW,
        h: pipsH,
      },
      () => `Wave ${this.run.waveCount()} of ${this.run.totalWaves()}`
    );
  }
}

class GridView {
  private readonly cells: InstancedSpriteSheet;
  private readonly carets: InstancedSpriteSheet;
  private readonly hoverOutline: Outline;
  private readonly srcOutline: Outline;
  private swapSrc: number | null = null;

  constructor(
    private readonly wave: W.Wave,
    private readonly panel: PanelView,
    private readonly progress: ProgressView,
    private readonly context: ViewContext
  ) {
    this.cells = new InstancedSpriteSheet(
      "img/cells.png",
      [1, 3],
      wave.grid.cells.length,
      this.context.scene
    );
    this.carets = new InstancedSpriteSheet(
      "img/caret.png",
      [1, 1],
      2 * (wave.grid.rows + wave.grid.cols),
      this.context.scene
    );
    this.hoverOutline = new Outline(0xaaaaaa, 0.05, this.context.scene);
    this.hoverOutline.line.visible = false;
    this.srcOutline = new Outline(0x447744, 0.05, this.context.scene);
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
    const mrow = Math.floor(
      (cellsTop - this.context.mouse.position[1]) / cellSize
    );
    const mcol = Math.floor(
      (this.context.mouse.position[0] - cellsLeft) / cellSize
    );
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
      if (actionIdx !== null) {
        const actionName = this.wave.s.actions[actionIdx].name;
        if (actionName == "swap" || actionName == "wildcard") {
          this.hoverOutline.line.visible = true;
          this.hoverOutline.update(
            cellsLeft + (mcol + 0.5) * cellSize,
            cellsTop - (mrow + 0.5) * cellSize,
            outlineSize,
            outlineSize
          );
          if (this.context.mouse.click) {
            if (actionName == "swap") {
              const cellIdx = mrow * grid.cols + mcol;
              if (this.swapSrc === null) {
                this.swapSrc = cellIdx;
              } else if (this.swapSrc === cellIdx) {
                this.swapSrc = null; // cancel
              } else {
                this.wave.execute(actionIdx, { i: this.swapSrc, j: cellIdx });
                this.swapSrc = null;
              }
            } else if (actionName == "wildcard") {
              this.wave.execute(actionIdx, { i: mrow * grid.cols + mcol });
            }
          }
        }
      }
    } else if (
      -1 <= mrow &&
      mrow < grid.rows + 1 &&
      -1 <= mcol &&
      mcol < grid.cols + 1
    ) {
      const actionIdx = this.panel.selectedAction();
      const isLeft = mcol < 0;
      const isRight = mcol >= grid.cols;
      const isTop = mrow < 0;
      const isBottom = mrow >= grid.rows;
      // Exclude corners
      if (actionIdx !== null && +isLeft + +isRight + +isTop + +isBottom === 1) {
        const actionName = this.wave.s.actions[actionIdx].name;
        if (actionName == "shift") {
          this.hoverOutline.line.visible = true;
          this.hoverOutline.update(
            cellsLeft + (mcol + 0.5) * cellSize,
            cellsTop - (mrow + 0.5) * cellSize,
            outlineSize,
            outlineSize
          );
          if (this.context.mouse.click) {
            this.wave.execute(actionIdx, {
              direction: isLeft
                ? "right"
                : isRight
                ? "left"
                : isTop
                ? "down"
                : "up",
              index: isLeft || isRight ? mrow : mcol,
            });
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
    private readonly context: ViewContext
  ) {
    this.outline = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x181818 })
    );
    this.outline.position.z = 0;

    this.context.scene.add(this.outline);
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: backgroundColor().getHex() })
    );
    this.background.position.z = 0.01;
    this.context.scene.add(this.background);

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
      this.context.scene.add(f);
    }
  }

  hover(component: number | null) {
    this.hoverComponent = component;
  }

  update(bounds: Box): void {
    // Basic layout
    const w = bounds.right - bounds.left;
    const h = 1 * (bounds.top - bounds.bottom);
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
      this.context.tooltip.show(
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
      this.context.tooltip.show(this, { cx, cy, w, h }, () => {
        return `${progressAll} nnats (- ${this.wave.score.total})`;
      });
    }
  }
}

function itemFreqHtml(freq: W.Frequency): string {
  const text = freq.charAt(0).toUpperCase() + freq.slice(1);
  const color = Colors.item_outline[freq].toString(16).padStart(6, "0");
  return `<span style="color: #${color}; font-weight: bold;">(${text})</span>`;
}

function itemButton(
  item: W.Item,
  context: ViewContext,
  click?: (button: Button) => void,
  s: { style?: "plain" | "rich"; selectable?: boolean } = {}
): Button {
  const style = s.style ?? "plain";
  const selectable = s.selectable ?? true;

  let tipText: string;
  const freq = style === "plain" ? "" : " " + itemFreqHtml(item.freq);
  if (item.kind === "action") {
    tipText = `<b>${item.title}</b>${freq}<br>${item.description}`;
  } else if (item.kind === "pattern") {
    tipText =
      `<b>${item.title}</b> [${item.grid.rows}×${item.grid.cols}]${freq}` +
      `<br>-${item.points} nnats`;
  } else if (item.kind === "bonus") {
    tipText = `<b>${item.title}</b>${freq}<br>${item.description}`;
  } else {
    throw new Error(`Unknown item kind for item ${JSON.stringify(item)}`);
  }
  return new Button(
    loadTexture(item),
    style === "plain" ? Colors.outline : Colors.item_outline[item.freq],
    tipText,
    context,
    click,
    undefined,
    selectable
  );
}

class DynamicRowsView {
  private readonly background: THREE.Mesh;

  constructor(
    readonly rows: {
      components: Component[];
      height?: number;
      padBelow?: boolean;
    }[],
    readonly cols: number,
    scene: THREE.Scene
  ) {
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x2b2b2b })
    );
    this.background.position.z = 0.01;
    scene.add(this.background);
  }

  update(bounds: Box): void {
    const InsetRatio = 0.02;
    const SectionPadRatio = 0.04;

    // Layout parameters
    let rowsCount = 0;
    let padCount = 0;
    for (const [j, r] of this.rows.entries()) {
      rowsCount += (r.height ?? 1) * Math.ceil(r.components.length / this.cols);
      padCount += +(r.padBelow ?? j < this.rows.length - 1);
    }
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.bottom + bounds.top) / 2;
    const w = bounds.right - bounds.left;
    const h = bounds.top - bounds.bottom;
    const inset = InsetRatio * Math.min(w, h);
    const sectionPad = SectionPadRatio * Math.min(w, h);
    const size = Math.min(
      (w - 2 * inset) / this.cols,
      (h - 2 * inset - padCount * sectionPad) / rowsCount
    );

    // Background
    this.background.position.set(cx, cy, this.background.position.z);
    this.background.scale.set(w, h, 1);

    // Rows
    const x0 = bounds.left + inset + size / 2;
    let y = bounds.top - inset;
    for (const [j, row] of this.rows.entries()) {
      const cHeight = (row.height ?? 1) * size;
      y -= cHeight / 2;
      for (let i = 0; i < row.components.length; i++) {
        const button = row.components[i];
        button.update(
          x0 + (i % this.cols) * size,
          y - Math.floor(i / this.cols) * size,
          size,
          cHeight
        );
      }
      y -= cHeight * Math.ceil(row.components.length / this.cols) - cHeight / 2;
      if (row.padBelow ?? j < this.rows.length - 1) {
        y -= sectionPad;
      }
    }
  }
}

class PanelView {
  private readonly panelView: DynamicRowsView;
  private readonly actions: Button[];
  private readonly framePips: Pips;
  private readonly rerollPips: Pips;

  private static readonly Controls = [
    {
      name: "submit",
      click: (wave: W.Wave) => wave.submit(),
      enable: () => true,
    },
    {
      name: "reroll",
      click: (wave: W.Wave) => wave.reroll(),
      enable: (wave: W.Wave) => wave.roll < wave.s.maxRolls,
    },
    {
      name: "undo",
      click: (wave: W.Wave) => wave.undo(),
      enable: (wave: W.Wave) => wave.canUndo,
    },
    {
      name: "redo",
      click: (wave: W.Wave) => wave.redo(),
      enable: (wave: W.Wave) => wave.canRedo,
    },
  ];

  constructor(private readonly wave: W.Wave, context: ViewContext) {
    const controls = PanelView.Controls.map(
      (control) =>
        new Button(
          loadTexture(`img/control/${control.name}.png`),
          Colors.foreground,
          /*tipText*/ null,
          context,
          () => control.click(this.wave),
          (button) => {
            button.enabled = control.enable(this.wave);
          }
        )
    );
    this.actions = this.wave.s.actions.map((action, index) =>
      itemButton(
        action,
        context,
        (button) => {
          if (button.selectable) {
            this.actions.forEach((b) => {
              b.selected = false;
            });
            button.selected = true;
          } else {
            this.wave.execute(index);
          }
        },
        {
          selectable:
            action.name === "swap" ||
            action.name === "wildcard" ||
            action.name === "shift",
        }
      )
    );
    const patterns = this.wave.s.patterns.map((p) => itemButton(p, context));
    const bonuses = this.wave.s.bonuses.map((b) => itemButton(b, context));

    this.framePips = new Pips(this.wave.s.maxFrames, context.scene, "left");
    this.rerollPips = new Pips(this.wave.s.maxRolls, context.scene, "left");

    this.panelView = new DynamicRowsView(
      [
        {
          components: [this.framePips, this.rerollPips],
          height: 0.3,
          padBelow: false,
        },
        { components: controls },
        { components: this.actions },
        { components: patterns },
        { components: bonuses },
      ],
      4,
      context.scene
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
    this.framePips.filled = this.wave.framesRemaining;
    this.rerollPips.filled = this.wave.rollsRemaining;

    // Disable unavailable actions and ensure one is selected
    for (const [i, button] of this.actions.entries()) {
      button.enabled = this.wave.hasAction(i);
      button.selected &&= button.enabled && button.selectable;
    }
    if (!this.actions.reduce((acc, b) => acc || b.selected, false)) {
      for (const button of this.actions) {
        if (button.enabled && button.selectable) {
          button.selected = true;
          break;
        }
      }
    }

    this.panelView.update(bounds);
  }
}

class SelectInventoryView {
  private readonly items: DynamicRowsView;

  constructor(select: R.Select, context: ViewContext) {
    const itemRows = ["action", "pattern", "bonus"]
      .map((kind) =>
        select.items
          .filter((item) => item.kind === kind)
          .map((item) =>
            itemButton(item, context, undefined, { style: "rich" })
          )
      )
      .filter((row) => row.length > 0)
      .map((components) => ({ components: components }));

    this.items = new DynamicRowsView(itemRows, 4, context.scene);
  }

  update(bounds: Box): void {
    this.items.update(bounds);
  }
}

class SelectOffersView {
  readonly items: Button[] = [];

  constructor(readonly select: R.Select, context: ViewContext) {
    for (const [index, item] of select.offers.entries()) {
      const button = itemButton(
        item,
        context,
        () => {
          select.selected = index;
        },
        { style: "rich" }
      );
      button.selected = true;
      this.items.push(button);
    }
  }

  update(bounds: Box): void {
    const OfferSizeRatio = 0.8;

    const width = (bounds.right - bounds.left) / this.items.length;
    const size = width * OfferSizeRatio;
    this.items.forEach((button, index) => {
      button.update(
        bounds.left + width * (index + 0.5),
        (bounds.top + bounds.bottom) / 2,
        size,
        size
      );
    });
  }
}

// Scenes

function topLevelLayout(context: ViewContext): {
  menu: Box;
  main: Box;
  progress: Box;
  panel: Box;
} {
  const w = context.camera.right - context.camera.left;
  const h = context.camera.top - context.camera.bottom;
  const pad = 0.02 * w;
  const panelW = Math.min(0.25 * w, 0.3 * h);
  const menuH = 0.25 * panelW;
  const bodyH = h - 3 * pad - menuH;
  const progressW = Math.min(0.03 * w, 0.03 * bodyH);
  const gridSize = Math.min(bodyH, w - panelW - progressW - 4 * pad);
  const bodyY = context.camera.bottom + pad + bodyH / 2 - gridSize / 2;
  const x0 = context.camera.left + pad;
  return {
    menu: {
      left: x0,
      right: context.camera.right - pad,
      bottom: context.camera.top - pad - menuH,
      top: context.camera.top - pad,
    },
    main: {
      left: x0,
      right: x0 + gridSize,
      bottom: bodyY,
      top: bodyY + gridSize,
    },
    progress: {
      left: x0 + gridSize + pad,
      right: x0 + gridSize + pad + progressW,
      bottom: bodyY,
      top: bodyY + gridSize,
    },
    panel: {
      left: x0 + gridSize + pad + progressW + pad,
      right: x0 + gridSize + pad + progressW + pad + panelW,
      bottom: bodyY,
      top: bodyY + gridSize,
    },
  };
}

interface Scene {
  readonly context: ViewContext;
  phase(): W.Wave | R.Select | R.RunOutcome;
  finished(): boolean;
  update(): void;
  dispose(): void;
}

class WaveScene implements Scene {
  private readonly menu: MenuView;
  private readonly gridView: GridView;
  private readonly progressView: ProgressView;
  private readonly panelView: PanelView;

  constructor(
    run: R.Run,
    readonly wave: W.Wave,
    readonly context: ViewContext
  ) {
    context.scene.background = backgroundColor();
    this.menu = new MenuView(run, context);
    this.progressView = new ProgressView(wave, context);
    this.panelView = new PanelView(wave, context);
    this.gridView = new GridView(
      wave,
      this.panelView,
      this.progressView,
      context
    );
  }

  phase(): W.Wave {
    return this.wave;
  }

  finished(): boolean {
    return this.wave.status !== "playing";
  }

  update(): void {
    const layout = topLevelLayout(this.context);
    this.menu.update(layout.menu);
    this.gridView.update(layout.main);
    this.progressView.update(layout.progress);
    this.panelView.update(layout.panel);
  }

  dispose(): void {
    // TODO
  }
}

class SelectScene implements Scene {
  private readonly menu: MenuView;
  private readonly offers: SelectOffersView;
  private readonly inventory: SelectInventoryView;

  constructor(
    run: R.Run,
    readonly select: R.Select,
    readonly context: ViewContext
  ) {
    context.scene.background = backgroundColor();
    this.menu = new MenuView(run, context);
    this.offers = new SelectOffersView(select, context);
    this.inventory = new SelectInventoryView(select, context);
  }

  phase(): R.Select {
    return this.select;
  }

  finished(): boolean {
    return this.select.selected !== null;
  }

  update(): void {
    const layout = topLevelLayout(this.context);
    this.menu.update(layout.menu);
    this.offers.update(layout.main);
    this.inventory.update(layout.panel);
  }

  dispose(): void {
    // TODO
  }
}

class RunOutcomeScene implements Scene {
  readonly element: HTMLElement;

  constructor(readonly outcome: R.RunOutcome, readonly context: ViewContext) {
    context.scene.background = backgroundColor();
    this.element = document.createElement("div");
    this.element.innerText = outcome.result === "win" ? "Victory!" : "Defeat";
    this.element.style.position = "absolute";
    this.element.style.left = "50%";
    this.element.style.top = "50%";
    this.element.style.transform = "translate(-50%, -50%)";
    this.element.style.color = "white";
    this.element.style.fontSize = "72px";
    this.element.style.userSelect = "none";
    document.body.appendChild(this.element);
  }

  phase(): R.RunOutcome {
    return this.outcome;
  }

  finished(): boolean {
    return false;
  }

  update(): void {}

  dispose(): void {
    document.body.removeChild(this.element);
  }
}

// Top-level renderer

class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly mouse: Mouse;
  private readonly tooltip: Tooltip;

  // State
  private lastTime: number | null = null;
  private scene: Scene | null = null;

  constructor(private readonly run: R.Run, canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.camera = new THREE.OrthographicCamera();
    this.camera.near = 0.1;
    this.camera.far = 1000;
    this.camera.position.z = 10;
    this.mouse = new Mouse(canvas);
    this.tooltip = new Tooltip(this.mouse, canvas);

    this.onResize();
    window.addEventListener("resize", this.onResize.bind(this));
    requestAnimationFrame(this.onAnimationFrame.bind(this));

    this.nextScene();
  }

  private nextScene() {
    if (this.scene) {
      this.scene.dispose();
      this.tooltip.hide();
    }
    const nextPhase = this.run.next(this.scene?.phase());
    const context = {
      mouse: this.mouse,
      tooltip: this.tooltip,
      scene: new THREE.Scene(),
      camera: this.camera,
    };
    if (nextPhase.phase === "wave") {
      this.scene = new WaveScene(this.run, nextPhase, context);
    } else if (nextPhase.phase === "select") {
      this.scene = new SelectScene(this.run, nextPhase, context);
    } else if (nextPhase.phase === "outcome") {
      this.scene = new RunOutcomeScene(nextPhase, context);
    } else {
      throw new Error(`Unknown phase: ${nextPhase}`);
    }
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

  private onAnimationFrame(time: number) {
    // Preamble
    if (this.lastTime === null) {
      this.lastTime = time;
    }
    // const dt = (time - this.lastTime) / 1000; // for animations
    this.lastTime = time;
    this.mouse.update();

    // Update scene
    if (this.scene?.finished()) {
      this.nextScene();
    }
    this.scene?.update();

    // Render
    this.mouse.postUpdate();
    if (this.scene) {
      this.renderer.render(this.scene.context.scene, this.camera);
    }
    requestAnimationFrame(this.onAnimationFrame.bind(this));
    LOG.tick();
  }
}
