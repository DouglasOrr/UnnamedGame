import { AchievementTracker } from "./achievements";

let DEV_MODE = false;

export function setDevMode(enabled: boolean): void {
  DEV_MODE = enabled;
}

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

export function countReflectiveSymmetries(grid: Grid): number {
  let count = 0;
  const check = (transform: (r: number, c: number) => [number, number]) => {
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const [r2, c2] = transform(r, c);
        if (grid.get(r, c) !== grid.get(r2, c2)) {
          return;
        }
      }
    }
    count++;
  };
  check((r, c) => [r, grid.cols - 1 - c]); // flip x
  check((r, c) => [grid.rows - 1 - r, c]); // flip y
  return count;
}

// Items

export type Frequency = "common" | "uncommon" | "rare";

export interface ItemBase {
  name: string;
  title: string;
  freq: Frequency;
  freqMultiplier: number;
  priority: number;
  limit: number;
}

export interface Action extends ItemBase {
  kind: "action";
  description: string;
  icon: string;
  execute(grid: Grid, arg: any): Grid;
}

export interface Pattern extends ItemBase {
  kind: "pattern";
  grid: Grid;
  points: number;
}

export interface Bonus extends ItemBase {
  kind: "bonus";
  description: string;
  icon: string;
  onScore?(score: Score, grid: Grid): void;
}

export type Item = Action | Pattern | Bonus;

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
  multiplier: number = 1;
  cellPoints: number = 1;
  alwaysScoring: boolean = false;
  readonly matches: {
    pattern: Pattern;
    patternIndex: number;
    position: number;
    points: number;
  }[] = [];
  constructor(readonly cellIndices: number[]) {}

  addMatch(pattern: Pattern, patternIndex: number, position: number): void {
    this.matches.push({
      pattern,
      patternIndex,
      position,
      points: pattern.points,
    });
  }

  get score(): number {
    let total = 0;
    for (const p of this.matches) {
      total += p.points;
    }
    if (this.matches.length >= 1 || this.alwaysScoring) {
      total += this.cellIndices.length * this.cellPoints;
    }
    return Math.ceil(this.multiplier * total);
  }

  get scoreExplanation(): {
    multiplier: number;
    matches: {
      pattern: Pattern | null;
      points: number;
      count: number;
    }[];
  } {
    const matches: {
      pattern: Pattern | null;
      points: number;
      count: number;
    }[] = [];
    for (const p of this.matches) {
      const existing = matches.find((e) => e.pattern?.name === p.pattern.name);
      if (existing) {
        existing.count++;
      } else {
        matches.push({
          pattern: p.pattern,
          points: p.points,
          count: 1,
        });
      }
    }
    matches.sort((a, b) => b.count * b.points - a.count * a.points);
    matches.push({
      pattern: null,
      points: this.cellPoints,
      count: this.cellIndices.length,
    });
    return { matches, multiplier: this.multiplier };
  }
}

export class Score {
  flatPoints: number = 0;
  multiplier: number = 1;
  constructor(
    readonly components: ComponentScore[],
    readonly cellToComponent: (number | null)[]
  ) {}

  get total(): number {
    return Math.ceil(
      this.multiplier *
        (this.components.reduce((sum, comp) => sum + comp.score, 0) +
          this.flatPoints)
    );
  }

  get explanation(): {
    multiplier: number;
    components: number[];
    addPoints: number;
  } {
    return {
      multiplier: this.multiplier,
      components: this.components
        .map((c) => c.score)
        .filter((score) => score > 0)
        .sort((a, b) => b - a),
      addPoints: this.flatPoints,
    };
  }

  static create(grid: Grid, patterns: Pattern[]): Score {
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
}

// Wave

export interface WaveSettings {
  // Settings
  targetScore: number;
  maxFrames: number;
  maxRolls: number;
  gridRows: number;
  gridCols: number;
  // Items
  patterns: Pattern[];
  actions: Action[];
  bonuses: Bonus[];
}

export class Wave {
  phase: "wave" = "wave";
  private state: {
    grid: Grid;
    score: Score;
    action: number | null;
  }[] = [];
  private stateIndex: number = 0;

  totalScore: number = 0;
  frame: number = 0;
  roll: number = 0;

  constructor(readonly s: WaveSettings) {
    this.push(Grid.random(s.gridRows, s.gridCols), null);
  }

  // Internal

  private push(grid: Grid, action: number | null): void {
    const score = Score.create(grid, this.s.patterns);
    for (const bonus of this.s.bonuses) {
      if (bonus.onScore) {
        bonus.onScore(score, grid);
      }
    }
    this.state.push({ grid, score, action });
    this.stateIndex = this.state.length - 1;
  }

  // Properties

  get grid(): Grid {
    return this.state[this.stateIndex].grid;
  }

  get score(): Score {
    return this.state[this.stateIndex].score;
  }

  get availableActions(): [Action, number][] {
    return this.s.actions
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

  get usedActions(): Action[] {
    return this.state
      .map((st) => st.action)
      .filter((a): a is number => a !== null)
      .map((idx) => this.s.actions[idx]);
  }

  get status(): "playing" | "win" | "lose" {
    if (DEV_MODE) {
      return this.frame < this.s.maxFrames ? "playing" : "win";
    }
    if (
      this.frame >= this.s.maxFrames ||
      this.totalScore >= this.s.targetScore
    ) {
      return this.totalScore >= this.s.targetScore ? "win" : "lose";
    }
    return "playing";
  }

  get framesRemaining(): number {
    return this.s.maxFrames - this.frame;
  }

  get rollsRemaining(): number {
    return this.s.maxRolls - this.roll;
  }

  get canUndo(): boolean {
    return this.stateIndex > 0;
  }

  get canRedo(): boolean {
    return this.stateIndex < this.state.length - 1;
  }

  // Actions

  execute(action: number, arg?: any): void {
    for (let i = 0; i <= this.stateIndex; i++) {
      if (this.state[i].action === action) {
        console.error(
          `Cannot execute action ${action} that has already been used`
        );
      }
    }
    const grid = this.s.actions[action].execute(this.grid, arg);
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
    }
  }

  redo(): void {
    if (this.stateIndex < this.state.length - 1) {
      this.stateIndex++;
    }
  }

  // Irreversible actions

  submit(): void {
    if (this.status !== "playing") {
      console.error("Submit after wave is over");
      return;
    }
    this.totalScore += this.score.total;
    AchievementTracker.get().onGridScored(this, this.score);
    this.frame++;
    if (
      this.frame < this.s.maxFrames &&
      (DEV_MODE || this.totalScore < this.s.targetScore)
    ) {
      this.roll = -1;
      this.reroll();
    }
  }

  reroll(): void {
    // Not undo-able, but (implicitly) refunds actions
    if (this.roll < this.s.maxRolls) {
      this.roll++;
      const grid = Grid.random(this.grid.rows, this.grid.cols);
      this.state.splice(0);
      this.push(grid, null);
    }
  }
}
