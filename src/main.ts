import * as G from "./core/grid";

type Listener = () => void;

class Game {
  grid: G.Grid;
  patterns: G.Grid[];
  matches: number[][];
  onUpdate: Listener[] = [];

  constructor(rows: number, cols: number, patterns: G.Grid[]) {
    this.grid = G.Grid.random(rows, cols);
    this.patterns = patterns;
    this.matches = this.getMatches();
  }

  private getMatches(): number[][] {
    return this.patterns.map((pattern) => this.grid.match(pattern));
  }

  newGrid(): void {
    this.grid = G.Grid.random(this.grid.rows, this.grid.cols);
    this.update();
  }

  swap(i: number, j: number): void {
    this.grid = this.grid.swap(i, j);
    this.update();
  }

  update(): void {
    this.matches = this.getMatches();
    for (const listener of this.onUpdate) {
      listener();
    }
  }
}

class Renderer {
  private readonly cellSize: number;
  private swapSource: number | null = null;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly game: Game
  ) {
    this.cellSize = Math.min(
      this.ctx.canvas.width / this.game.grid.cols,
      this.ctx.canvas.height / this.game.grid.rows
    );
    this.draw();
    game.onUpdate.push(() => this.draw());

    ctx.canvas.addEventListener("click", (event) => {
      const rect = ctx.canvas.getBoundingClientRect();
      const idx = this.game.grid.index(
        Math.floor((event.clientY - rect.top) / this.cellSize),
        Math.floor((event.clientX - rect.left) / this.cellSize)
      );
      if (this.swapSource === null) {
        this.swapSource = idx;
      } else if (this.swapSource === idx) {
        this.swapSource = null;
      } else {
        this.game.swap(this.swapSource, idx);
        this.swapSource = null;
      }
      this.draw();
    });
  }

  draw() {
    const pad = this.cellSize / 10;
    this.ctx.fillStyle = "black";
    const grid = this.game.grid;
    this.ctx.fillRect(
      0,
      0,
      grid.cols * this.cellSize,
      grid.rows * this.cellSize
    );

    const overlay = new Array(grid.cells.length).fill(false);
    for (const [n, pattern] of this.game.patterns.entries()) {
      for (const i of this.game.matches[n]) {
        for (let j = 0; j < pattern.rows * pattern.cols; j++) {
          overlay[
            i + Math.floor(j / pattern.cols) * grid.cols + (j % pattern.cols)
          ] = true;
        }
      }
    }

    for (let i = 0; i < grid.cells.length; i++) {
      const r = Math.floor(i / grid.cols);
      const c = i % grid.cols;
      if (grid.cells[i] !== null) {
        this.ctx.fillStyle = !grid.cells[i]
          ? "blue"
          : overlay[i]
          ? "yellow"
          : "red";
        this.ctx.fillRect(
          c * this.cellSize + pad,
          r * this.cellSize + pad,
          this.cellSize - pad * 2,
          this.cellSize - pad * 2
        );
        if (this.swapSource === i) {
          this.ctx.strokeStyle = "#ff00ff";
          this.ctx.lineWidth = 3;
          this.ctx.strokeRect(
            c * this.cellSize + pad,
            r * this.cellSize + pad,
            this.cellSize - pad * 2,
            this.cellSize - pad * 2
          );
        }
      }
    }
  }
}

window.onload = () => {
  const game = new Game(7, 7, [
    G.Grid.parse("-x-/xxx/-x-"),
    G.Grid.parse("xx/xx"),
  ]);
  const canvas = document.getElementById("canvas-main") as HTMLCanvasElement;
  new Renderer(canvas.getContext("2d")!, game);

  document.getElementById("btn-new")!.addEventListener("click", () => {
    game.newGrid();
  });
};
