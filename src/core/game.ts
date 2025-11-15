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

  get elements(): number {
    return this.rows * this.cols;
  }

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

// Items

export interface Item {
  name: string;
  title: string;
}

// Actions

export interface Action extends Item {
  description: string;
  priority: number;
  execute(grid: Grid, arg: any): Grid;
}

export const SwapAction: Action = {
  name: "swap",
  title: "Swap",
  description: "select 2 cells to swap",
  priority: 1,
  execute(grid: Grid, arg: { i: number; j: number }): Grid {
    const cellsOut = grid.cells.slice();
    [cellsOut[arg.i], cellsOut[arg.j]] = [cellsOut[arg.j], cellsOut[arg.i]];
    return grid.replace(cellsOut);
  },
};

// Bonuses

export interface Bonus extends Item {
  description: string;
  priority: number;
  onScore?(score: Score): void;
}

export const FlatPointsBonus: Bonus = {
  name: "flat_points",
  title: "-20",
  description: "subtract 20 nats",
  priority: 100,
  onScore(score: Score): void {
    score.flatPoints += 20;
  },
};

// Patterns

export interface Pattern extends Item {
  grid: Grid;
  points: number;
}

export const PlusPattern: Pattern = {
  name: "plus",
  title: "Plus",
  grid: Grid.parse("-x-/xxx/-x-"),
  points: 25,
};

export const SquarePattern: Pattern = {
  name: "square",
  title: "Square",
  grid: Grid.parse("xx/xx"),
  points: 4,
};

// Scoring

export function findMatches(pattern: Pattern, grid: Grid): number[] {
  const matches: number[] = [];
  const pgrid = pattern.grid;
  for (let i = 0; i < grid.rows * grid.cols; i++) {
    if (
      Math.floor(i / grid.cols) + pgrid.rows <= grid.rows &&
      (i % grid.cols) + pgrid.cols <= grid.cols
    ) {
      let isMatch = true;
      for (let j = 0; j < pgrid.rows * pgrid.cols && isMatch; j++) {
        const pr = Math.floor(j / pgrid.cols);
        const pc = j % pgrid.cols;
        const p = pgrid.cells[j];
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

export class ComponentScore {
  readonly matches: {
    pattern: Pattern;
    patternIndex: number;
    position: number;
  }[] = [];
  constructor(readonly cellIndices: number[]) {}

  addMatch(pattern: Pattern, patternIndex: number, position: number): void {
    this.matches.push({ pattern, patternIndex, position });
  }

  get score(): number {
    let total = 0;
    for (const p of this.matches) {
      total += p.pattern.points;
    }
    if (this.matches.length >= 1) {
      total += this.cellIndices.length;
    }
    return total;
  }

  get scoreExplanation(): { name: string; points: number; count: number }[] {
    const explanation: { name: string; points: number; count: number }[] = [];
    for (const p of this.matches) {
      const existing = explanation.find(
        (e) => e.name === p.pattern.name && e.points === p.pattern.points
      );
      if (existing) {
        existing.count++;
      } else {
        explanation.push({
          name: p.pattern.name,
          points: p.pattern.points,
          count: 1,
        });
      }
    }
    explanation.push({
      name: "",
      points: 1,
      count: this.cellIndices.length,
    });
    return explanation;
  }
}

export class Score {
  flatPoints: number = 0;
  constructor(
    readonly components: ComponentScore[],
    readonly cellToComponent: (number | null)[]
  ) {}

  get total(): number {
    return (
      this.components.reduce((sum, comp) => sum + comp.score, 0) +
      this.flatPoints
    );
  }
}

export function getScore(grid: Grid, patterns: Pattern[]): Score {
  // Find components
  const gridC = grid.getComponents();
  const components: ComponentScore[] = gridC.components.map(
    (idx) => new ComponentScore(idx)
  );

  // Add pattern matches to components
  for (const [pIdx, pattern] of patterns.entries()) {
    for (const match of findMatches(pattern, grid)) {
      const pComponents = new Set<number | null>();
      for (let j = 0; j < pattern.grid.rows * pattern.grid.cols; j++) {
        const r = Math.floor(j / pattern.grid.cols);
        const c = j % pattern.grid.cols;
        const cellIdx = match + r * grid.cols + c;
        pComponents.add(gridC.cellToComponent[cellIdx]);
      }
      for (const component of pComponents) {
        if (component !== null) {
          components[component].addMatch(pattern, pIdx, match);
        }
      }
    }
  }
  return new Score(components, gridC.cellToComponent);
}

// Game state

export interface GameState {
  grid: Grid;
  score: Score;
  action: number | null;
}

export type Listener = () => void;

export class Game {
  // Round settings
  readonly maxFrames: number = 3;
  readonly maxRolls: number = 1;
  readonly targetScore: number;
  // State
  state: GameState[] = [];
  stateIndex: number = 0;
  roundScore: number = 0;
  frame: number = 0;
  roll: number = 0;

  constructor(
    // Items
    readonly patterns: Pattern[],
    readonly actions: Action[],
    readonly bonuses: Bonus[],
    // Other settings
    rows: number,
    cols: number,
    targetScore: number
  ) {
    const grid = Grid.random(rows, cols);
    this.targetScore = targetScore;
    this.push(grid, null);
  }

  // Internal

  private update(): void {
    console.log(
      `Frame ${this.frame + 1}/${this.maxFrames}`,
      `Score ${this.score.total}`,
      `Round Score ${this.roundScore}/${this.targetScore}`
    );
  }

  private push(grid: Grid, action: number | null): void {
    const score = getScore(grid, this.patterns);
    for (const bonus of this.bonuses) {
      if (bonus.onScore) {
        bonus.onScore(score);
      }
    }
    this.state.push({ grid, score, action });
    this.stateIndex = this.state.length - 1;
    this.update();
  }

  // Properties

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

  get framesRemaining(): number {
    return this.maxFrames - this.frame;
  }

  get rollsRemaining(): number {
    return this.maxRolls - this.roll;
  }

  // Actions

  execute(action: number, arg: any): void {
    for (let i = 0; i <= this.stateIndex; i++) {
      if (this.state[i].action === action) {
        console.error(
          `Cannot execute action ${action} that has already been used`
        );
      }
    }
    const grid = this.actions[action].execute(this.grid, arg);
    this.state.splice(this.stateIndex + 1);
    this.push(grid, action);
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
      this.roll = -1;
      this.reroll();
    } else {
      setTimeout(() => {
        this.frame = 0;
        this.roundScore = 0;
        this.roll = -1;
        this.reroll();
      }, 1000);
      this.update();
    }
  }

  reroll(): void {
    // Not undo-able, but (implicitly) refunds actions
    if (this.roll < this.maxRolls) {
      this.roll++;
      const grid = Grid.random(this.grid.rows, this.grid.cols);
      this.state.splice(0);
      this.push(grid, null);
      this.update();
    }
  }
}
