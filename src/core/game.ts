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

  replace(cells: Cell[]): Grid {
    if (cells.length !== this.cells.length) {
      throw new Error("Grid.replace: Invalid cells length");
    }
    return new Grid(this.rows, this.cols, cells);
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

// Actions

export interface Action {
  name: string;
  execute(grid: Grid, arg: any): Grid;
}

export class SwapAction implements Action {
  name = "swap";
  execute(grid: Grid, arg: { i: number; j: number }): Grid {
    const cellsOut = grid.cells.slice();
    [cellsOut[arg.i], cellsOut[arg.j]] = [cellsOut[arg.j], cellsOut[arg.i]];
    return grid.replace(cellsOut);
  }
}

// Pattern and scoring

export class Pattern {
  constructor(readonly grid: Grid, readonly points: number) {}

  find(grid: Grid): number[] {
    const matches: number[] = [];
    const pattern = this.grid;
    for (let i = 0; i < grid.rows * grid.cols; i++) {
      if (
        Math.floor(i / grid.cols) + pattern.rows <= grid.rows &&
        (i % grid.cols) + pattern.cols <= grid.cols
      ) {
        let isMatch = true;
        for (let j = 0; j < pattern.rows * pattern.cols && isMatch; j++) {
          const pr = Math.floor(j / pattern.cols);
          const pc = j % pattern.cols;
          const p = pattern.cells[j];
          const c = grid.cells[i + pr * grid.cols + pc];
          isMatch &&= !(p !== c && p !== Cell.W && c !== Cell.W);
        }
        if (isMatch) {
          matches.push(i);
        }
      }
    }
    return matches;
  }
}

export interface Component {
  indices: number[];
  patterns: number[];
  patternPositions: number[];
  score: number;
}

export interface Score {
  total: number;
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
    const matches = pattern.find(grid);
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

  const total = components.reduce((sum, comp) => sum + comp.score, 0);

  return { total, components, cellToComponent: gridC.cellToComponent };
}

// Game state

export interface GameState {
  grid: Grid;
  score: Score;
  action: number | null;
}

export type Listener = () => void;

export class Game {
  readonly patterns: Pattern[];
  readonly actions: Action[];
  readonly onUpdate: Listener[] = [];
  readonly maxFrames: number = 3;
  readonly maxRolls: number = 2;
  readonly targetScore: number;
  state: GameState[];
  stateIndex: number = 0;
  frame: number = 0;
  roundScore: number = 0;
  roll: number = 1;

  constructor(
    patterns: Pattern[],
    actions: Action[],
    rows: number,
    cols: number,
    targetScore: number
  ) {
    this.patterns = patterns;
    this.actions = actions;
    const grid = Grid.random(rows, cols);
    this.state = [{ grid, score: score(grid, patterns), action: null }];
    this.targetScore = targetScore;
    this.update();
  }

  get grid(): Grid {
    return this.state[this.stateIndex].grid;
  }

  get score(): Score {
    return this.state[this.stateIndex].score;
  }

  get availableActions(): [Action, number][] {
    return this.actions
      .map((action, idx) => [action, idx] as [Action, number])
      .filter(([, idx]) => {
        for (let i = 0; i <= this.stateIndex; i++) {
          if (this.state[i].action === idx) {
            return false;
          }
        }
        return true;
      });
  }

  get status(): "playing" | "win" | "lose" {
    if (this.frame >= this.maxFrames || this.roundScore >= this.targetScore) {
      return this.roundScore >= this.targetScore ? "win" : "lose";
    }
    return "playing";
  }

  update(): void {
    console.log(
      `Frame ${this.frame + 1}/${this.maxFrames}`,
      `Score ${this.score.total}`,
      `Round Score ${this.roundScore}/${this.targetScore}`
    );
    for (const listener of this.onUpdate) {
      listener();
    }
  }

  // Actions

  execute(action: number, arg: any): void {
    for (let i = 0; i <= this.stateIndex; i++) {
      if (this.state[i].action === action) {
        throw new Error("Cannot execute action that has already been used");
      }
    }
    const grid = this.actions[action].execute(this.grid, arg);
    this.state.splice(++this.stateIndex);
    this.state.push({ grid, score: score(grid, this.patterns), action });
    this.update();
  }

  hasAction(action: number): boolean {
    for (let i = 0; i <= this.stateIndex; i++) {
      if (this.state[i].action === action) {
        return false;
      }
    }
    return true;
  }

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

  // Irreversible actions

  submit(): void {
    this.roundScore += this.score.total;
    this.frame++;
    if (this.frame < this.maxFrames && this.roundScore < this.targetScore) {
      this.roll = 0;
      this.newGrid();
    } else {
      setTimeout(() => {
        this.frame = 0;
        this.roundScore = 0;
        this.roll = 0;
        this.newGrid();
      }, 1000);
      this.update();
    }
  }

  newGrid(): void {
    // Not undo-able, but (implicitly) refunds actions
    if (this.roll < this.maxRolls) {
      this.roll++;
      const grid = Grid.random(this.grid.rows, this.grid.cols);
      this.stateIndex = 0;
      this.state = [{ grid, score: score(grid, this.patterns), action: null }];
      this.update();
    }
  }
}
