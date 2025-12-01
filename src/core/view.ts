import * as THREE from "three";
import * as R from "./run";
import { AchievementTracker } from "./achievements";
import * as A from "./achievements";
import * as W from "./wave";
import * as S from "./sound";

export type Menu =
  | "main_menu"
  | "achievements"
  | "settings"
  | "introduction"
  | { level: string }
  | null;

export function start(s: { skipTo: Menu }): void {
  new Renderer(s, document.getElementById("canvas-main") as HTMLCanvasElement);
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

function _c(s: string): THREE.Color {
  return new THREE.Color(s);
}
const Colors = {
  background: _c("#e0e0e0"),
  menu_background: _c("#d4d4d4"),
  foreground: _c("#000000"),
  outline: _c("#888888"),
  pip_fill: _c("#cf7220"),
  grid: {
    hover: _c("#333333"),
    src: _c("#cf7220"),
    caret: _c("#cf7220"),
    o: _c("#dddddd"),
    xw: _c("#a8a8a8"),
    highlight: _c("#333333"),
    pattern: _c("#e60000"),
  },
  button: {
    hovered: _c("#000000"),
    enabled: _c("#4c4c4c"),
    disabled: _c("#aaaaaa"),
  },
  item_outline: {
    common: _c("#888888"),
    uncommon: _c("#2137dc"),
    rare: _c("#e60000"),
  },
  progress: {
    outline: _c("#d0d0d0"),
    remaining: _c("#444444"),
    scored: _c("#cf7220"),
    hover: _c("#e60000"),
  },
};

function fmt_number(n: number): string {
  if (Math.abs(n) >= 10) {
    return n.toFixed(0);
  }
  const s = n.toString();
  if (s.length <= 3) {
    return s;
  }
  return n.toFixed(2);
}

type Box = { cx: number; cy: number; w: number; h: number };

function boxFromBounds(
  left: number,
  right: number,
  bottom: number,
  top: number
): Box {
  return {
    cx: (left + right) / 2,
    cy: (bottom + top) / 2,
    w: right - left,
    h: top - bottom,
  };
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
    this.element.classList.add("tooltip");
    this.element.style.display = "none"; // hidden by default
    document.body.appendChild(this.element);
  }

  hide() {
    this.element.style.display = "none";
    this.elementTag = null;
  }

  show(
    tag: any,
    when: boolean | Box,
    content?: () => string,
    position?: [number, number]
  ): void {
    const EdgeMarginPx = 100;
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
      const bounds = this.canvas.getBoundingClientRect();
      tipX = Math.min(tipX, bounds.right - EdgeMarginPx);
      tipY = Math.min(tipY, bounds.bottom - EdgeMarginPx);
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

function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      if (obj instanceof THREE.InstancedMesh) {
        obj.dispose();
      }
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      for (const mat of materials) {
        // Dispose material but not textures (they're cached in TextureCache)
        mat.dispose();
      }
    }
  });
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
  const key = typeof p === "string" ? p : `${p.kind}/${p.name}`;
  if (!TextureCache[key]) {
    if (typeof p === "string" || p.kind !== "pattern") {
      const path = typeof p === "string" ? p : `img/${p.icon}`;
      TextureCache[key] = new THREE.TextureLoader().load(
        path,
        undefined,
        undefined,
        (err) => console.error(`Error loading texture ${path}`, err)
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

  constructor(color: THREE.Color, z: number, scene: THREE.Scene) {
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
    outlineColor: THREE.Color,
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

    // Hover: size & color
    const hover =
      this.click && this.enabled && this.context.mouse.inside(cx, cy, w, h);
    const sizeRatio = hover ? HoverSizeRatio * InnerSizeRatio : InnerSizeRatio;
    this.mesh.position.set(cx, cy, this.mesh.position.z);
    this.mesh.scale.set(w * sizeRatio, h * sizeRatio, 1);
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(
      hover
        ? Colors.button.hovered
        : this.enabled
        ? Colors.button.enabled
        : Colors.button.disabled
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
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: Colors.pip_fill,
    });
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: Colors.outline,
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
  private readonly homeButton: Button;
  onHome: (() => void) | null = null;

  constructor(
    private readonly run: R.Run,
    private readonly context: ViewContext
  ) {
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: Colors.menu_background })
    );
    this.background.position.z = 0;
    context.scene.add(this.background);
    this.progress = new Pips(this.run.totalWaves(), context.scene);
    this.homeButton = new Button(
      loadTexture("img/menu/home.png"),
      Colors.foreground,
      "Abandon run and return to home screen",
      context,
      () => {
        if (this.onHome) this.onHome();
      }
    );
  }

  update(bounds: Box): void {
    this.progress.filled = this.run.waveCount();

    const InsetRatio = 0.05;
    const PipHeightRatio = 0.5;
    const PipMaxAspect = 1.5;

    this.background.position.set(
      bounds.cx,
      bounds.cy,
      this.background.position.z
    );
    this.background.scale.set(bounds.w, bounds.h, 1);

    const inset = InsetRatio * Math.min(bounds.w, bounds.h);
    const buttonSize = bounds.h - 2 * inset;
    const buttonX = bounds.cx + bounds.w / 2 - inset - buttonSize / 2;
    this.homeButton.update(buttonX, bounds.cy, buttonSize, buttonSize);

    const pipsH = PipHeightRatio * (bounds.h - 2 * inset);
    const pipsW = Math.min(
      PipMaxAspect * pipsH * this.progress.total,
      bounds.w - 3 * inset - buttonSize
    );
    const pipsX = bounds.cx - bounds.w / 2 + inset + pipsW / 2;
    this.progress.update(pipsX, bounds.cy, pipsW, pipsH);

    this.context.tooltip.show(
      this,
      {
        cx: pipsX,
        cy: bounds.cy,
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
  // Animation
  private prev: { grid: W.Grid; roll: number; frame: number };
  private revealElapsed = 0;
  private cellRevealStart: number[] = [];

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
    this.hoverOutline = new Outline(
      Colors.grid.hover,
      0.05,
      this.context.scene
    );
    this.hoverOutline.line.visible = false;
    this.srcOutline = new Outline(Colors.grid.src, 0.05, this.context.scene);
    this.srcOutline.line.visible = false;
    this.prev = { grid: wave.grid, roll: wave.roll, frame: wave.frame };
    this.startGridAnimation(this.wave.grid);
  }

  private startGridAnimation(grid: W.Grid, animate: boolean = true): void {
    const RevealTime = 0.75;
    this.cellRevealStart = grid.cells.map(
      (_, idx) => (idx * RevealTime) / grid.cells.length
    );
    this.revealElapsed = animate ? 0 : Infinity;
  }

  private cellRevealAmount(index: number): number {
    const CellRevealDuration = 0.1;
    const t = this.revealElapsed - (this.cellRevealStart[index] ?? 0);
    return Math.max(0, Math.min(1, t / CellRevealDuration));
  }

  // Update instance matrices to match layout.grid and the current wave.grid
  update(bounds: Box, dt: number): void {
    const MarkSizeRatio = 0.5;
    const MarkHoverGrow = 1.05;
    const OutlinePad = 0.04;

    const grid = this.wave.grid;

    // Animation
    if (
      this.prev.grid !== grid ||
      this.cellRevealStart.length !== grid.cells.length
    ) {
      const animate =
        this.prev.roll !== this.wave.roll ||
        this.prev.frame !== this.wave.frame;
      this.startGridAnimation(grid, animate);
    }
    this.prev = {
      grid: this.wave.grid,
      roll: this.wave.roll,
      frame: this.wave.frame,
    };
    this.revealElapsed += dt;

    const cellSize = Math.min(
      bounds.w / (grid.cols + 2),
      bounds.h / (grid.rows + 2)
    );
    const outlineSize = cellSize * (1 - 2 * OutlinePad);
    const markSize = MarkSizeRatio * cellSize;
    const cellsLeft = bounds.cx - bounds.w / 2 + cellSize;
    const cellsTop = bounds.cy + bounds.h / 2 - cellSize;

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
                S.Effects.play("action");
                this.swapSrc = null;
              }
            } else if (actionName == "wildcard") {
              this.wave.execute(actionIdx, { i: mrow * grid.cols + mcol });
              S.Effects.play("action");
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
            S.Effects.play("action");
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
        ? Colors.grid.pattern
        : hoverIndices.has(i)
        ? Colors.grid.highlight
        : grid.cells[i] === W.Cell.O
        ? Colors.grid.o
        : Colors.grid.xw;
      const size =
        this.cellRevealAmount(i) *
        (hoverIndices.has(i) ? MarkHoverGrow * markSize : markSize);
      this.cells.update(
        i,
        /*pos*/ [x, y],
        /*scale*/ [size, size],
        /*rot*/ 0,
        /*tile*/ [0, 2 - grid.cells[i]],
        /*tint*/ tint.toArray() as [number, number, number]
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
          bounds.cx - bounds.w / 2 + (col + 1.5) * cellSize,
          bounds.cy - bounds.h / 2 + (row + 1.5) * cellSize,
        ],
        /*scale*/ [markSize, 0.5 * markSize],
        /*rot*/ rot,
        /*tile*/ [0, 0],
        /*tint*/ Colors.grid.caret.toArray() as [number, number, number]
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
  private prevProgress: number;

  constructor(
    private readonly wave: W.Wave,
    private readonly context: ViewContext
  ) {
    this.outline = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: Colors.progress.outline })
    );
    this.outline.position.z = 0;

    this.context.scene.add(this.outline);
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: Colors.background })
    );
    this.background.position.z = 0.01;
    this.context.scene.add(this.background);

    this.fill = [
      Colors.progress.remaining,
      Colors.progress.scored,
      Colors.progress.hover,
    ].map(
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
    this.prevProgress = this.progress();
  }

  private progress(): number {
    return Math.max(0, this.wave.s.targetScore - this.wave.totalScore);
  }

  private animatedProgress(dt: number): number {
    const LerpSpeed = 6;
    const FinishedThreshold = 0.1;

    const actualRemaining = this.progress();
    if (!Number.isFinite(this.prevProgress)) {
      this.prevProgress = actualRemaining;
    }
    const diff = actualRemaining - this.prevProgress;
    if (Math.abs(diff) < FinishedThreshold) {
      this.prevProgress = actualRemaining;
    } else {
      this.prevProgress += diff * Math.min(1, dt * LerpSpeed);
    }
    return Math.min(this.wave.s.targetScore, Math.max(0, this.prevProgress));
  }

  hover(component: number | null) {
    this.hoverComponent = component;
  }

  update(bounds: Box, dt: number): void {
    // Basic layout
    const inset = 0.2 * Math.min(bounds.w, bounds.h);
    const innerW = bounds.w - 2 * inset;
    const innerH = bounds.h - 2 * inset;

    this.outline.position.set(bounds.cx, bounds.cy, this.outline.position.z);
    this.outline.scale.set(bounds.w, bounds.h, 1);
    this.background.position.set(
      bounds.cx,
      bounds.cy,
      this.background.position.z
    );
    this.background.scale.set(innerW, innerH, 1);

    // Progress
    const progressAll = this.animatedProgress(dt);
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
        bounds.cx,
        bounds.cy - innerH / 2 + y + h / 2,
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
          const explanation = component.scoreExplanation;
          const sep = "<br>&nbsp;&nbsp;&nbsp;&nbsp;";
          let text = "";
          if (explanation.multiplier !== 1) {
            text +=
              `${fmt_number(explanation.multiplier)}×` +
              `&nbsp;&nbsp;<em>bonus</em>${sep}`;
          }
          text += explanation.matches
            .map(
              (e) =>
                `−${fmt_number(e.points)} ×${e.count}&nbsp;&nbsp;` +
                `<em>${e.pattern?.title ?? ""}</em>${sep}`
            )
            .join("");
          if (text.endsWith(sep)) {
            text = text.slice(0, -sep.length);
          }
          return (
            `− ${fmt_number(component.score)} nnats` + `<br>&nbsp;= ${text}`
          );
        },
        [
          bounds.cx + bounds.w / 2,
          bounds.cy + innerH * (progressAll / this.wave.s.targetScore - 1 / 2),
        ]
      );
    } else {
      this.context.tooltip.show(this, bounds, () => {
        const sep = "<br>&nbsp;&nbsp;&nbsp;";
        let text = `${fmt_number(this.progress())} nnats<br>− ${fmt_number(
          this.wave.score.total
        )} nnats`;
        text += `<br>&nbsp;= `;
        const explanation = this.wave.score.explanation;
        if (explanation.multiplier !== 1) {
          text +=
            `${fmt_number(explanation.multiplier)}×` +
            `&nbsp;&nbsp;<em>bonus</em>${sep}`;
        }
        for (const e of explanation.components) {
          text += `−${fmt_number(e)}` + `&nbsp;&nbsp;<em>group</em>${sep}`;
        }
        if (explanation.addPoints) {
          text +=
            `−${fmt_number(explanation.addPoints)}` +
            `&nbsp;&nbsp;<em>bonus</em>`;
        }
        if (text.endsWith(sep)) {
          text = text.slice(0, -sep.length);
        }
        return text;
      });
    }
  }
}

function itemFreqHtml(freq: W.Frequency): string {
  const text = freq.charAt(0).toUpperCase() + freq.slice(1);
  const color = Colors.item_outline[freq].getStyle();
  return `<span style="color: ${color}; font-weight: bold;">(${text})</span>`;
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
      new THREE.MeshBasicMaterial({ color: Colors.menu_background })
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
    const inset = InsetRatio * Math.min(bounds.w, bounds.h);
    const sectionPad = SectionPadRatio * Math.min(bounds.w, bounds.h);
    const size = Math.min(
      (bounds.w - 2 * inset) / this.cols,
      (bounds.h - 2 * inset - padCount * sectionPad) / rowsCount
    );

    // Background
    this.background.position.set(
      bounds.cx,
      bounds.cy,
      this.background.position.z
    );
    this.background.scale.set(bounds.w, bounds.h, 1);

    // Rows
    const x0 = bounds.cx - bounds.w / 2 + inset + size / 2;
    let y = bounds.cy + bounds.h / 2 - inset;
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
      click: (wave: W.Wave) => {
        wave.submit();
        S.Effects.play("submit");
      },
      enable: () => true,
    },
    {
      name: "reroll",
      click: (wave: W.Wave) => {
        wave.reroll();
        S.Effects.play("reroll");
      },
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
            S.Effects.play("action");
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
  readonly skip: Button;

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
    this.skip = new Button(
      loadTexture("img/menu/skip.png"),
      Colors.foreground,
      "Skip this item",
      context,
      () => {
        select.selected = "skip";
      }
    );
    this.skip.selected = true;
  }

  update(bounds: Box): void {
    const OfferSizeRatio = 0.8;

    const width = bounds.w / this.items.length;
    const size = width * OfferSizeRatio;
    this.items.forEach((button, index) => {
      button.update(
        bounds.cx - bounds.w / 2 + width * (index + 0.5),
        bounds.cy,
        size,
        size
      );
    });
    const skipSize = 0.3 * size;
    this.skip.update(
      bounds.cx,
      bounds.cy - size / 2 - skipSize,
      skipSize,
      skipSize
    );
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
  const totalW = gridSize + pad + progressW + pad + panelW;
  const x0 = context.camera.left + (w - totalW) / 2;
  return {
    menu: boxFromBounds(
      x0,
      x0 + totalW,
      context.camera.top - pad - menuH,
      context.camera.top - pad
    ),
    main: boxFromBounds(x0, x0 + gridSize, bodyY, bodyY + gridSize),
    progress: boxFromBounds(
      x0 + gridSize + pad,
      x0 + gridSize + pad + progressW,
      bodyY,
      bodyY + gridSize
    ),
    panel: boxFromBounds(
      x0 + gridSize + pad + progressW + pad,
      x0 + gridSize + pad + progressW + pad + panelW,
      bodyY,
      bodyY + gridSize
    ),
  };
}

interface Scene {
  readonly context: ViewContext;
  navigate(): Menu;
  finished(): boolean;
  update(dt: number): void;
  dispose(): void;
}

class WaveScene implements Scene {
  private readonly menu: MenuView;
  private readonly gridView: GridView;
  private readonly progressView: ProgressView;
  private readonly panelView: PanelView;
  private navigateTo: Menu = null;

  constructor(
    private readonly run: R.Run,
    readonly wave: W.Wave,
    readonly context: ViewContext
  ) {
    context.scene.background = Colors.background;
    this.menu = new MenuView(run, context);
    this.menu.onHome = () => {
      this.navigateTo = "main_menu";
    };
    this.progressView = new ProgressView(wave, context);
    this.panelView = new PanelView(wave, context);
    this.gridView = new GridView(
      wave,
      this.panelView,
      this.progressView,
      context
    );
  }

  navigate(): Menu {
    return this.navigateTo;
  }

  nextRunPhase(): W.Wave | R.Select | R.RunOutcome {
    return this.run.next(this.wave);
  }

  finished(): boolean {
    return this.wave.status !== "playing" || this.navigateTo !== null;
  }

  update(dt: number): void {
    const layout = topLevelLayout(this.context);
    this.menu.update(layout.menu);
    this.gridView.update(layout.main, dt);
    this.progressView.update(layout.progress, dt);
    this.panelView.update(layout.panel);
  }

  dispose(): void {
    disposeScene(this.context.scene);
  }
}

class SelectScene implements Scene {
  private readonly menu: MenuView;
  private readonly offers: SelectOffersView;
  private readonly inventory: SelectInventoryView;
  private navigateTo: Menu = null;

  constructor(
    private readonly run: R.Run,
    readonly select: R.Select,
    readonly context: ViewContext
  ) {
    context.scene.background = Colors.background;
    this.menu = new MenuView(run, context);
    this.menu.onHome = () => {
      this.navigateTo = "main_menu";
    };
    this.offers = new SelectOffersView(select, context);
    this.inventory = new SelectInventoryView(select, context);
  }

  navigate(): Menu {
    return this.navigateTo;
  }

  nextRunPhase(): W.Wave | R.Select | R.RunOutcome {
    return this.run.next(this.select);
  }

  finished(): boolean {
    return this.select.selected !== null || this.navigateTo !== null;
  }

  update(): void {
    const layout = topLevelLayout(this.context);
    this.menu.update(layout.menu);
    this.offers.update(layout.main);
    this.inventory.update(layout.panel);
  }

  dispose(): void {
    disposeScene(this.context.scene);
  }
}

class MainMenuScene implements Scene {
  private destination: Menu = null;
  private destinationLevel: string = "level_0";
  private readonly element: HTMLElement;
  private readonly mainButtons: Button[] = [];
  private readonly levelButtons: Button[] = [];

  constructor(readonly context: ViewContext) {
    context.scene.background = Colors.background;

    this.element = document.createElement("div");
    this.element.classList.add("screen");
    this.element.innerHTML = `<h1>Patternats</h1>`;
    document.body.appendChild(this.element);

    const addButton = (texture: string, tip: string, dest: Menu) => {
      this.mainButtons.push(
        new Button(
          loadTexture(texture),
          Colors.foreground,
          tip,
          context,
          () => {
            if (dest instanceof Object && "level" in dest) {
              if (
                this.destinationLevel === "level_0" &&
                AchievementTracker.get().stats().wavesCompleted === 0
              ) {
                this.destination = "introduction";
              } else {
                this.destination = { level: this.destinationLevel };
              }
            } else {
              this.destination = dest;
            }
          }
        )
      );
    };
    addButton("img/menu/new_run.png", "New Run", { level: "level_0" });
    addButton("img/menu/trophy.png", "Achievements", "achievements");
    addButton("img/menu/settings.png", "Settings", "settings");

    const stats = AchievementTracker.get().stats();
    for (const level of Object.values(R.Levels)) {
      const button = new Button(
        loadTexture(`img/level/${level.name}.png`),
        Colors.foreground,
        level.title,
        context,
        (button) => {
          this.destinationLevel = level.name;
          for (const otherButton of this.levelButtons) {
            otherButton.selected = false;
          }
          button.selected = true;
        }
      );
      button.enabled =
        level.unlockedBy === null ||
        (stats.levelsWon[level.unlockedBy] ?? 0) > 0;
      if (this.destinationLevel === level.name) {
        button.selected = true;
      }
      this.levelButtons.push(button);
    }
  }

  navigate(): Menu {
    return this.destination;
  }

  finished(): boolean {
    return this.destination !== null;
  }

  update(): void {
    const w = this.context.camera.right - this.context.camera.left;
    const h = this.context.camera.top - this.context.camera.bottom;
    const buttonSize = Math.min(w * 0.15, h * 0.2);
    const spacing = buttonSize * 1.5;
    const totalWidth = spacing * (this.mainButtons.length - 1);
    const startX = this.context.camera.left + w / 2 - totalWidth / 2;
    const centerY = this.context.camera.bottom + 0.55 * h;

    for (let i = 0; i < this.mainButtons.length; i++) {
      this.mainButtons[i].update(
        startX + i * spacing,
        centerY,
        buttonSize,
        buttonSize
      );
    }

    const levelButtonCols = 2;
    const levelButtonSize = spacing / 3;
    for (let i = 0; i < this.levelButtons.length; i++) {
      const col = i % levelButtonCols;
      const row = Math.floor(i / levelButtonCols);

      this.levelButtons[i].update(
        startX + (col - levelButtonCols / 2 + 0.5) * levelButtonSize,
        centerY - spacing / 2 - row * levelButtonSize,
        levelButtonSize,
        levelButtonSize
      );
    }
  }

  dispose(): void {
    document.body.removeChild(this.element);
    disposeScene(this.context.scene);
  }
}

class IntroductionScene implements Scene {
  private continue: boolean = false;
  private readonly element: HTMLElement;

  constructor(readonly context: ViewContext) {
    context.scene.background = Colors.background;

    this.element = document.createElement("div");
    this.element.classList.add("screen");
    this.element.innerHTML = `
      <h1>Your first run</h1>
      <div class="introduction">
        <p>Waves of entropy are crashing through the cosmos, threatening to
        make life <em>infinitely boring</em>. Your job is to restore order by
        finding patterns in the fundamental fabric of reality.</p>

        <ul>
          <li>Your goal is to reduce entropy (measured in nano nats, <b>nnats</b>), by making patterns in a <b>grid</b>.</li>
          <li>You've 3 grids per <b>wave</b> to reduce entropy to zero, or the game is over.</li>
          <li>You can collect <b>actions</b>, <b>patterns</b>, and <b>bonuses</b> to help you.</li>
          <li><b>Actions</b> like swap <img src="img/action/swap.png"> are selected and used manually on the grid.</li>
          <li><b>Patterns</b> are matched automatically <em>(try hovering the grid)</em>.</li>
          <li><b>Bonuses</b> apply extra effects to reduce entropy.</li>
        </ul>
        <button>Click to begin</button>
      </div>
    `;
    document.body.appendChild(this.element);

    this.element.addEventListener("click", () => {
      this.continue = true;
    });
  }

  navigate(): Menu {
    return { level: "level_0" };
  }

  finished(): boolean {
    return this.continue;
  }

  update(): void {}

  dispose(): void {
    document.body.removeChild(this.element);
    disposeScene(this.context.scene);
  }
}

class AchievementsScene implements Scene {
  private destination: Menu = null;
  private readonly element: HTMLElement;

  constructor(readonly context: ViewContext) {
    context.scene.background = Colors.background;

    this.element = document.createElement("div");
    this.element.classList.add("screen");
    this.element.innerHTML = `
      <h1>Achievements</h1>
      <img class="back-button" src="img/menu/home.png" alt="Home">
      <div id="achievements-stats"></div>
      <div id="achievements-list"></div>
      <div id="achievements-button-container">
        <button id="achievements-reset">Reset<br>(triple-click)</button>
      </div>
    `;
    document.body.appendChild(this.element);

    // Stats
    const statsElement = this.element.querySelector(
      "#achievements-stats"
    ) as HTMLElement;
    this.buildStatsElement(statsElement);

    // Achievements
    const listElement = this.element.querySelector(
      "#achievements-list"
    ) as HTMLElement;
    this.buildAchievementList(listElement);

    // Triple-click reset button
    const resetButton = this.element.querySelector(
      "#achievements-reset"
    ) as HTMLButtonElement;
    let clickCount = 0;
    let clickTimer: number | null = null;
    resetButton.addEventListener("click", () => {
      clickCount++;
      if (clickTimer !== null) {
        clearTimeout(clickTimer);
      }
      if (clickCount >= 3) {
        clickCount = 0;
        AchievementTracker.get().reset();
        this.buildStatsElement(statsElement);
        this.buildAchievementList(listElement);
      } else {
        clickTimer = window.setTimeout(() => {
          clickCount = 0;
          clickTimer = null;
        }, 500);
      }
    });

    this.element
      .querySelector(".back-button")!
      .addEventListener("click", () => {
        this.destination = "main_menu";
      });
  }

  static createAchievementElement(a: A.AchievementState): HTMLElement {
    const div = document.createElement("div");
    div.classList.add("achievement");
    div.innerHTML = `
        <img src="img/menu/trophy.png" class="achievement-icon" />
        <b>${a.achievement.title}</b><span>${a.achievement.description}</span>
      `;
    div.style.display = "flex";
    div.style.alignItems = "center";
    const aIcon = div.querySelector(".achievement-icon") as HTMLImageElement;
    aIcon.style.filter = a.unlock ? "brightness(0)" : "brightness(0.5)";
    if (a.unlock) {
      const unlockDate = new Date(a.unlock);
      div.title = `Unlocked ${unlockDate.toDateString()} ${unlockDate.toLocaleTimeString()}`;
    } else {
      const playerStats = AchievementTracker.get().stats();
      const titleParts: string[] = [];
      if (a.achievement.progress) {
        const progress = a.achievement.progress(playerStats);
        titleParts.push(`${(progress * 100).toFixed(0)}% complete`);
      }
      if (a.achievement.todo) {
        let missing = a.achievement.todo(AchievementTracker.get().stats());
        if (missing.length > 4) {
          missing = missing
            .slice(0, 4)
            .concat([`+ ${missing.length - 4} more`]);
        }
        titleParts.push(`missing ${missing.join(", ")}`);
      }
      div.title = titleParts.join("; ");
    }
    return div;
  }

  private buildAchievementList(element: HTMLElement): void {
    element.innerHTML = "";
    const achievements = AchievementTracker.get().list();
    achievements.sort((a, b) => {
      const aUnlocked = a.unlock !== null;
      const bUnlocked = b.unlock !== null;
      if (aUnlocked && !bUnlocked) return -1;
      if (!aUnlocked && bUnlocked) return 1;
      if (aUnlocked && bUnlocked) {
        return b.unlock! - a.unlock!;
      }
      return a.achievement.priority! - b.achievement.priority!;
    });
    for (const a of achievements) {
      element.appendChild(AchievementsScene.createAchievementElement(a));
    }
  }

  private buildStatsElement(element: HTMLElement): void {
    element.innerHTML = "";
    const stats = AchievementTracker.get().stats();
    const runsAbandoned = stats.runsStarted - stats.runsWon - stats.runsLost;
    const achievements = AchievementTracker.get().list();
    const unlockedCount = achievements.filter((a) => a.unlock !== null).length;
    const levelsWon = Object.entries(stats.levelsWon).filter(
      ([, wins]) => wins > 0
    ).length;

    for (const line of [
      `Runs: ${stats.runsWon}W / ${stats.runsLost}L / ${runsAbandoned}A` +
        `  |  Waves: ${stats.wavesCompleted}`,
      `Total: ${stats.totalScore} nnats  |  Best: ${stats.highestGridScore} nnats`,
      `Achievements: ${unlockedCount}/${achievements.length}` +
        `  |  Levels: ${levelsWon}/${Object.keys(R.Levels).length}`,
    ]) {
      const div = document.createElement("pre");
      div.textContent = line;
      element.appendChild(div);
    }
  }

  navigate(): Menu {
    return this.destination;
  }

  finished(): boolean {
    return this.destination !== null;
  }

  update(): void {}

  dispose(): void {
    document.body.removeChild(this.element);
    disposeScene(this.context.scene);
  }
}

class SettingsScene implements Scene {
  private destination: Menu = null;
  private readonly element: HTMLElement;

  constructor(readonly context: ViewContext) {
    context.scene.background = Colors.background;

    this.element = document.createElement("div");
    this.element.classList.add("screen");
    this.element.innerHTML = `
      <h1>Settings</h1>
      <div id="settings-options"></div>
      <div id="settings-credits"></div>
      <img class="back-button" src="img/menu/home.png" alt="Home">
      `;
    this.buildOptionsElement(
      this.element.querySelector("#settings-options") as HTMLElement
    );
    this.buildCreditsElement(
      this.element.querySelector("#settings-credits") as HTMLElement
    );
    document.body.appendChild(this.element);
    this.element
      .querySelector(".back-button")!
      .addEventListener("click", () => {
        this.destination = "main_menu";
      });
  }

  private buildOptionsElement(element: HTMLElement): void {
    element.innerHTML = `
      <div>
        <label for="music-toggle">Music</label>
        <input type="checkbox" id="music-toggle"
          ${S.Music.enabled ? "checked" : ""}>
      </div>
      <div>
        <label for="sound-toggle">Sound Effects</label>
        <input type="checkbox" id="sound-toggle"
          ${S.Effects.enabled ? "checked" : ""}>
      </div>
    `;
    const musicToggle = element.querySelector(
      "#music-toggle"
    ) as HTMLInputElement;
    musicToggle.addEventListener("change", () => {
      S.Music.shuffle();
      S.Music.enabled = musicToggle.checked;
    });
    const soundToggle = element.querySelector(
      "#sound-toggle"
    ) as HTMLInputElement;
    soundToggle.addEventListener("change", () => {
      S.Effects.enabled = soundToggle.checked;
    });
  }

  private buildCreditsElement(element: HTMLElement): void {
    element.innerHTML = `
      <h2>Credits</h2>
      <div class="settings-credits-list">
        <p><b>Music and sound effects</b> from
          <a href="https://www.zapsplat.com" target="_blank">Zapsplat.com</a>
        </p>
        <p><b>Graphics</b> using
          <a href="https://threejs.org/" target="_blank">three.js</a>
        </p>
      </div>
    `;
  }

  navigate(): Menu {
    return this.destination;
  }

  finished(): boolean {
    return this.destination !== null;
  }

  update(): void {}

  dispose(): void {
    document.body.removeChild(this.element);
    disposeScene(this.context.scene);
  }
}

class RunOutcomeScene implements Scene {
  readonly element: HTMLElement;
  private clickedContinue: boolean = false;

  constructor(readonly outcome: R.RunOutcome, readonly context: ViewContext) {
    context.scene.background = Colors.background;
    this.element = document.createElement("div");
    const outcomeText = outcome.result === "win" ? "Victory!" : "Defeat";
    this.element.innerHTML = `
      <h1>${outcomeText}</h1>
      <button>Click to continue</button>
    `;
    this.element.classList.add("screen", "screen-center");
    document.body.appendChild(this.element);
    S.Effects.play(outcome.result);

    this.element.addEventListener("click", () => {
      this.clickedContinue = true;
    });
  }

  navigate(): Menu {
    return "main_menu";
  }

  finished(): boolean {
    return this.clickedContinue;
  }

  update(): void {}

  dispose(): void {
    document.body.removeChild(this.element);
    disposeScene(this.context.scene);
  }
}

class AchievementOverlay {
  readonly element: HTMLElement;
  queue: A.AchievementState[] = [];
  timer: number | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.classList.add("achievement-overlay");
    this.element.innerText = "This is the achievement overlay";
    this.element.style.display = "none";
    document.body.appendChild(this.element);
  }

  onUnlock(achievement: A.AchievementState) {
    this.queue.push(achievement);
  }

  update(dt: number) {
    const showDuration = 3.5; // seconds
    const fadeDuration = 1; // seconds

    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= fadeDuration) {
        this.element.style.opacity = Math.max(
          0,
          this.timer / fadeDuration
        ).toString();
      }
      if (this.timer <= 0) {
        this.element.style.display = "none";
        this.timer = null;
      }
    }
    if (this.timer === null && this.queue.length > 0) {
      this.element.innerHTML = "";
      this.element.appendChild(
        AchievementsScene.createAchievementElement(this.queue.shift()!)
      );
      this.element.style.opacity = "1";
      this.element.style.display = "block";
      this.timer = showDuration;
    }
  }
}

// Top-level renderer

class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly mouse: Mouse;
  private readonly tooltip: Tooltip;
  private readonly achievementOverlay = new AchievementOverlay();
  private readonly skipTo: Menu;

  // State
  private lastTime: number | null = null;
  private scene: Scene | null = null;
  private run: R.Run | null = null;

  constructor(s: { skipTo: Menu }, canvas: HTMLCanvasElement) {
    this.skipTo = s.skipTo;
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

    AchievementTracker.get().onUnlock = (achievement) => {
      this.achievementOverlay.onUnlock(achievement);
    };

    // Ctrl+Alt+\ to force win
    document.addEventListener("keydown", (e) => {
      if (e.key === "\\" && e.altKey && e.ctrlKey && this.run !== null) {
        this.setRunPhase(this.run.forceWin(), this.renewContext());
      }
    });
    // Ctrl+Alt+s to download run logs; Ctrl+Alt+o to reset
    document.addEventListener("keydown", (event) => {
      if (event.key === "o" && event.ctrlKey && event.altKey) {
        A.RunLogs.get().reset();
        console.info("Run logs reset");
      }
      if (event.key === "s" && event.ctrlKey && event.altKey) {
        event.preventDefault();
        if (A.RunLogs.get().logs.length === 0) {
          console.info("No run logs to download yet");
        } else {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(A.RunLogs.get().logs)], {
              type: "application/json",
            })
          );
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `patternats-${new Date().toISOString()}.json`;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }
    });
  }

  private nextDestination(): Menu {
    if (this.scene) {
      return this.scene.navigate();
    }
    // First scene
    return this.skipTo || "main_menu";
  }

  private renewContext(): ViewContext {
    if (this.scene) {
      this.scene.dispose();
      this.tooltip.hide();
    }
    return {
      mouse: this.mouse,
      tooltip: this.tooltip,
      scene: new THREE.Scene(),
      camera: this.camera,
    };
  }

  private nextScene() {
    const context = this.renewContext();
    const dest = this.nextDestination();
    switch (dest) {
      case null:
        // Continue within run (WaveScene or SelectScene finished)
        this.setRunPhase(
          (this.scene as WaveScene | SelectScene).nextRunPhase(),
          context
        );
        break;

      case "main_menu":
        this.run = null;
        this.scene = new MainMenuScene(context);
        break;

      case "introduction":
        this.scene = new IntroductionScene(context);
        break;

      case "achievements":
        this.scene = new AchievementsScene(context);
        break;

      case "settings":
        this.scene = new SettingsScene(context);
        break;

      default:
        const level = R.Levels[dest.level];
        this.run = new R.Run(level.settings, level.name);
        this.setRunPhase(this.run.next(), context);
        break;
    }
  }

  private setRunPhase(
    phase: W.Wave | R.Select | R.RunOutcome,
    context: ViewContext
  ) {
    if (this.run === null) {
      throw new Error("Run is null during game phase");
    }
    if (phase.phase === "wave") {
      this.scene = new WaveScene(this.run, phase, context);
    } else if (phase.phase === "select") {
      this.scene = new SelectScene(this.run, phase, context);
    } else if (phase.phase === "outcome") {
      this.scene = new RunOutcomeScene(phase, context);
    } else {
      throw new Error(`Unknown phase: ${phase}`);
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
    const dt = Math.max(0, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.mouse.update();

    // Update scene
    this.achievementOverlay.update(dt);
    if (this.scene?.finished()) {
      this.nextScene();
    }
    this.scene?.update(dt);

    // Render
    this.mouse.postUpdate();
    if (this.scene) {
      this.renderer.render(this.scene.context.scene, this.camera);
    }
    requestAnimationFrame(this.onAnimationFrame.bind(this));
    LOG.tick();
  }
}
