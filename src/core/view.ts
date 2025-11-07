import * as G from "./game";

export function start(game: G.Game): void {
  new Renderer(game);
}

class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly textRoundScore: HTMLElement =
    document.getElementById("text-round-score")!;
  private readonly textFrameScore: HTMLElement =
    document.getElementById("text-frame-score")!;
  private readonly btnSubmit: HTMLButtonElement = document.getElementById(
    "btn-submit"
  )! as HTMLButtonElement;
  private readonly btnShuffle: HTMLButtonElement = document.getElementById(
    "btn-shuffle"
  )! as HTMLButtonElement;
  private readonly btnUndo: HTMLButtonElement = document.getElementById(
    "btn-undo"
  )! as HTMLButtonElement;
  private readonly btnRedo: HTMLButtonElement = document.getElementById(
    "btn-redo"
  )! as HTMLButtonElement;
  private readonly cellSize: number;
  private swapSource: number | null = null;

  constructor(private readonly game: G.Game) {
    const canvas = document.getElementById("canvas-main") as HTMLCanvasElement;
    this.ctx = canvas.getContext("2d")!;
    this.cellSize = Math.min(
      this.ctx.canvas.width / this.game.grid.cols,
      this.ctx.canvas.height / this.game.grid.rows
    );
    this.draw();
    game.onUpdate.push(() => this.draw());

    this.ctx.canvas.addEventListener("click", (event) => {
      const rect = this.ctx.canvas.getBoundingClientRect();
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

    this.btnSubmit.addEventListener("click", () => {
      this.game.submit();
    });
    this.btnShuffle.addEventListener("click", () => {
      game.newGrid();
    });
    this.btnUndo.addEventListener("click", () => {
      game.undo();
    });
    this.btnRedo.addEventListener("click", () => {
      game.redo();
    });
  }

  draw() {
    const pad = this.cellSize / 10;
    const grid = this.game.grid;

    // Round score
    this.textRoundScore.innerText =
      `[${this.game.frame + 1}/${this.game.maxFrames}]` +
      ` ${Math.max(0, this.game.targetScore - this.game.roundScore)} nnats (${
        this.game.roundScore
      })`;
    this.textRoundScore.dataset.status = this.game.status();

    // Frame score
    const sortedScores = this.game.score.components
      .map((comp) => comp.score)
      .filter((score) => score > 0)
      .sort((a, b) => b - a);
    const totalScore = sortedScores.reduce((sum, score) => sum + score, 0);
    this.textFrameScore.innerText =
      sortedScores.length >= 2
        ? `${totalScore} nnats\n= ${sortedScores.join(" + ")}`
        : `${totalScore} nnats`;

    // Buttons
    this.btnUndo.disabled = this.game.stateIndex === 0;
    this.btnRedo.disabled = this.game.stateIndex === this.game.state.length - 1;

    // Overlay
    const overlay = new Array(grid.cells.length).fill(false);
    for (const component of this.game.score.components) {
      for (const i in component.patterns) {
        const pattern = this.game.patterns[component.patterns[i]];
        const pos = component.patternPositions[i];
        for (let j = 0; j < pattern.grid.rows * pattern.grid.cols; j++) {
          overlay[
            pos +
              Math.floor(j / pattern.grid.cols) * grid.cols +
              (j % pattern.grid.cols)
          ] = true;
        }
      }
    }

    // Background
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(
      0,
      0,
      grid.cols * this.cellSize,
      grid.rows * this.cellSize
    );

    // Cells
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
