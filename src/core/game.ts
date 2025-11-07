/**
 * Single cell type: empty, filled or wildcard.
 */
export enum Cell {
  O = 0,
  X = 1,
  W = 2,
}

/**
 * A rectangular grid of cells.
 *   rows: major
 *   cols: minor
 */
export class Grid {
  // Creation
  constructor(
    readonly rows: number,
    readonly cols: number,
    readonly cells: Cell[]
  ) {}

  static random(rows: number, cols: number): Grid {
    return new Grid(
      rows,
      cols,
      Array.from({ length: rows * cols }, () =>
        Math.random() < 0.5 ? Cell.X : Cell.O
      )
    );
  }

  static parse(s: string): Grid {
    const lines = s.trim().split("/");
    const rows = lines.length;
    const cols = lines[0].length;
    const cells: Cell[] = [];
    for (const line of lines) {
      if (line.length !== cols) {
        throw new Error("Grid.parse: Inconsistent row lengths");
      }
      for (const ch of line) {
        if (ch === "x") {
          cells.push(Cell.X);
        } else if (ch === "-") {
          cells.push(Cell.O);
        } else if (ch === "#") {
          cells.push(Cell.W);
        } else {
          throw new Error(`Grid.parse: Invalid character: ${ch}`);
        }
      }
    }
    return new Grid(rows, cols, cells);
  }

  // Utility

  index(r: number, c: number): number {
    if (r < 0 || r >= this.rows) {
      throw new Error("Invalid row index");
    }
    if (c < 0 || c >= this.cols) {
      throw new Error("Invalid column index");
    }
    return r * this.cols + c;
  }

  get(r: number, c: number): Cell {
    return this.cells[this.index(r, c)];
  }

  dump(): string {
    let result = "+";
    for (let c = 0; c < this.cols; c++) {
      result += "-";
    }
    result += "+\n";
    for (let r = 0; r < this.rows; r++) {
      result += "|";
      for (let c = 0; c < this.cols; c++) {
        switch (this.cells[r * this.cols + c]) {
          case Cell.X:
            result += "x";
            break;
          case Cell.O:
            result += " ";
            break;
          case Cell.W:
            result += "#";
            break;
        }
      }
      result += "|\n";
    }
    result += "+";
    for (let c = 0; c < this.cols; c++) {
      result += "-";
    }
    result += "+\n";
    return result;
  }

  // Core

  swap(i: number, j: number): Grid {
    const cellsOut = this.cells.slice();
    [cellsOut[i], cellsOut[j]] = [cellsOut[j], cellsOut[i]];
    return new Grid(this.rows, this.cols, cellsOut);
  }

  find(pattern: Grid): number[] {
    const matches: number[] = [];
    for (let i = 0; i < this.rows * this.cols; i++) {
      if (
        Math.floor(i / this.cols) + pattern.rows <= this.rows &&
        (i % this.cols) + pattern.cols <= this.cols
      ) {
        let isMatch = true;
        for (let j = 0; j < pattern.rows * pattern.cols && isMatch; j++) {
          const pr = Math.floor(j / pattern.cols);
          const pc = j % pattern.cols;
          const p = pattern.cells[j];
          const c = this.cells[i + pr * this.cols + pc];
          isMatch &&= !(p !== c && p !== Cell.W && c !== Cell.W);
        }
        if (isMatch) {
          matches.push(i);
        }
      }
    }
    return matches;
  }

  /** Depth first search to find connected components of X|W cells */
  getComponents(): {
    components: number[][];
    cellToComponent: (number | null)[];
  } {
    const components: number[][] = [];
    const cellToComponent = new Array(this.rows * this.cols).fill(null);
    for (let i = 0; i < this.rows * this.cols; i++) {
      if (this.cells[i] !== Cell.O && cellToComponent[i] === null) {
        const component = components.length;
        components.push([]);
        const visit = (idx: number) => {
          if (this.cells[idx] !== Cell.O && cellToComponent[idx] === null) {
            components[component].push(idx);
            cellToComponent[idx] = component;
            const r = Math.floor(idx / this.cols);
            const c = idx % this.cols;
            if (c >= 1) {
              visit(idx - 1);
            }
            if (c <= this.cols - 2) {
              visit(idx + 1);
            }
            if (r >= 1) {
              visit(idx - this.cols);
            }
            if (r <= this.rows - 2) {
              visit(idx + this.cols);
            }
          }
        };
        visit(i);
      }
    }
    return { components, cellToComponent };
  }
}

export type Listener = () => void;

export interface Pattern {
  grid: Grid;
  points: number;
}

export interface Component {
  indices: number[];
  patterns: number[];
  patternPositions: number[];
  score: number;
}

export interface Score {
  components: Component[];
  cellToComponent: (number | null)[];
}

export function score(grid: Grid, patterns: Pattern[]): Score {
  // Find components
  const gridC = grid.getComponents();
  const components: Component[] = gridC.components.map((indices) => ({
    indices,
    patterns: [],
    patternPositions: [],
    score: 0,
  }));

  // Add patterns to components
  for (const [pIdx, pattern] of patterns.entries()) {
    const matches = grid.find(pattern.grid);
    for (const match of matches) {
      const pComponents = new Set<number | null>();
      for (let j = 0; j < pattern.grid.rows * pattern.grid.cols; j++) {
        const r = Math.floor(j / pattern.grid.cols);
        const c = j % pattern.grid.cols;
        const cellIdx = match + r * grid.cols + c;
        pComponents.add(gridC.cellToComponent[cellIdx]);
      }
      for (const component of pComponents) {
        if (component !== null) {
          components[component].patterns.push(pIdx);
          components[component].patternPositions.push(match);
        }
      }
    }
  }

  // Compute scores
  for (const component of components) {
    let score = 0;
    for (const pIdx of component.patterns) {
      score += patterns[pIdx].points;
    }
    if (component.patterns.length >= 1) {
      score += component.indices.length;
    }
    component.score = score;
  }

  return { components, cellToComponent: gridC.cellToComponent };
}

export interface GameState {
  grid: Grid;
  score: Score;
  // TODO: action
}

export class Game {
  readonly patterns: Pattern[];
  readonly onUpdate: Listener[] = [];
  readonly state: GameState[];
  readonly maxFrames: number = 3;
  readonly targetScore: number;
  stateIndex: number = 0;
  frame: number = 0;
  roundScore: number = 0;

  constructor(
    rows: number,
    cols: number,
    patterns: Pattern[],
    targetScore: number
  ) {
    this.patterns = patterns;
    const grid = Grid.random(rows, cols);
    this.state = [{ grid, score: score(grid, patterns) }];
    this.targetScore = targetScore;
  }

  get grid(): Grid {
    return this.state[this.stateIndex].grid;
  }

  get score(): Score {
    return this.state[this.stateIndex].score;
  }

  status(): "playing" | "win" | "lose" {
    if (this.frame >= this.maxFrames || this.roundScore >= this.targetScore) {
      return this.roundScore >= this.targetScore ? "win" : "lose";
    }
    return "playing";
  }

  private push(grid: Grid): void {
    this.state.splice(this.stateIndex + 1);
    this.state.push({ grid, score: score(grid, this.patterns) });
    this.stateIndex++;
    this.update();
  }

  // Actions

  undo(): void {
    if (this.stateIndex > 0) {
      this.stateIndex--;
      this.update();
    }
  }

  redo(): void {
    if (this.stateIndex < this.state.length - 1) {
      this.stateIndex++;
      this.update();
    }
  }

  submit(): void {
    const frameScore = this.score.components.reduce(
      (sum, comp) => sum + comp.score,
      0
    );
    this.roundScore += frameScore;
    this.frame++;
    if (this.frame < this.maxFrames && this.roundScore < this.targetScore) {
      this.newGrid();
    } else {
      setTimeout(() => {
        this.frame = 0;
        this.roundScore = 0;
        this.newGrid();
      }, 1000);
      this.update();
    }
  }

  newGrid(): void {
    const grid = Grid.random(this.grid.rows, this.grid.cols);
    this.stateIndex = -1; // never undo-able
    this.push(grid);
  }

  swap(i: number, j: number): void {
    this.push(this.grid.swap(i, j));
  }

  update(): void {
    for (const listener of this.onUpdate) {
      listener();
    }
  }
}
