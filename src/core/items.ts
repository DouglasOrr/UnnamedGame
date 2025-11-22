import { Frequency, Grid, Item, Score, Cell } from "./wave";

export const Items = {} as { [name: string]: Item };

// Helpers

function register(item: Item): void {
  if (Items[item.name]) {
    throw new Error(`Item with name "${item.name}" is already registered.`);
  }
  Items[item.name] = item;
}

let nextPriority = 0;

function action(
  name: string,
  titleDescription: [string, string],
  freq: Frequency,
  execute: (grid: Grid, arg: any) => Grid,
  args: { limit?: number } = {}
): void {
  register({
    kind: "action",
    name,
    title: titleDescription[0],
    description: titleDescription[1],
    freq,
    limit: args.limit,
    priority: nextPriority++,
    execute,
  });
}

function bonus(
  name: string,
  titleDescription: [string, string],
  freq: Frequency,
  args: { onScore: (score: Score) => void; limit?: number }
): void {
  register({
    kind: "bonus",
    name,
    title: titleDescription[0],
    description: titleDescription[1],
    freq,
    limit: args.limit ?? Infinity,
    priority: nextPriority++,
    onScore: args.onScore,
  });
}

function pattern(
  title: string,
  gridStr: string,
  points: number,
  freq: Frequency,
  args: { limit?: number } = {}
): void {
  const name = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  register({
    kind: "pattern",
    name,
    title,
    grid: Grid.parse(gridStr),
    points,
    freq,
    limit: args.limit ?? Infinity,
    priority: nextPriority++,
  });
}

// Actions

action(
  "swap",
  ["Swap", "select 2 cells to swap"],
  "uncommon",
  (grid: Grid, arg: { i: number; j: number }) => {
    const cellsOut = grid.cells.slice();
    [cellsOut[arg.i], cellsOut[arg.j]] = [cellsOut[arg.j], cellsOut[arg.i]];
    return grid.replace(cellsOut);
  },
  { limit: Infinity }
);

action(
  "wildcard",
  ["Wildcard", "add a wildcard cell, which can match O or X"],
  "uncommon",
  (grid: Grid, arg: { i: number }) => {
    const cellsOut = grid.cells.slice();
    cellsOut[arg.i] = Cell.W;
    return grid.replace(cellsOut);
  },
  { limit: Infinity }
);

action(
  "shift",
  ["Shift", "shift the grid in the chosen direction, with wrap-around"],
  "rare",
  (
    grid: Grid,
    arg: { index: number; direction: "up" | "down" | "left" | "right" }
  ) => {
    const cellsOut = grid.cells.slice();
    let i0: number, delta: number, stride: number, count: number;
    if (arg.direction === "up" || arg.direction === "down") {
      i0 = arg.index;
      delta = arg.direction === "up" ? 1 : -1;
      stride = grid.cols;
      count = grid.rows;
    } else {
      // left || right
      i0 = grid.cols * arg.index;
      delta = arg.direction === "left" ? 1 : -1;
      stride = 1;
      count = grid.cols;
    }
    for (let n = 0; n < count; n++) {
      const i = i0 + stride * n;
      const j = i0 + stride * ((n + delta + count) % count);
      cellsOut[i] = grid.cells[j];
    }
    return grid.replace(cellsOut);
  },
  { limit: Infinity }
);

action(
  "flip_y",
  ["Flip", "flip vertically"],
  "rare",
  (grid: Grid) => {
    const cellsOut = grid.cells.slice();
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        cellsOut[(grid.rows - 1 - r) * grid.cols + c] =
          grid.cells[r * grid.cols + c];
      }
    }
    return grid.replace(cellsOut);
  },
  { limit: 1 }
);

action(
  "gravity",
  ["Gravity", "everything falls to the floor"],
  "rare",
  (grid: Grid) => {
    const cellsOut = grid.cells.slice();
    for (let col = 0; col < grid.cols; col++) {
      let writeR = grid.rows - 1;
      for (let r = grid.rows - 1; r >= 0; r--) {
        const cell = grid.cells[r * grid.cols + col];
        if (cell !== Cell.O) {
          cellsOut[writeR * grid.cols + col] = cell;
          writeR--;
        }
      }
      for (; writeR >= 0; writeR--) {
        cellsOut[writeR * grid.cols + col] = Cell.O;
      }
    }
    return grid.replace(cellsOut);
  },
  { limit: 1 }
);

// Patterns

pattern("Square S", "xx/xx", 1, "common");
pattern("Square M", "xxx/xxx/xxx", 30, "common");
pattern("Square L", "xxxx/xxxx/xxxx/xxxx", 250, "rare");
pattern("Square XL", "xxxxx/xxxxx/xxxxx/xxxxx/xxxxx", 1000, "rare");

pattern("Line", "xxxx", 2, "uncommon");
pattern("Column", "x/x/x/x", 2, "uncommon");
pattern("Line L", "xxxxxx", 10, "uncommon");
pattern("Column L", "x/x/x/x/x/x", 10, "uncommon");

pattern("Plus", "-x-/xxx/-x-", 50, "common");
pattern("Box", "xxx/x-x/xxx", 50, "common");
pattern("Heli Pad", "x-x/xxx/x-x", 50, "common");
pattern("Four", "x-x/xxx/--x", 50, "uncommon");
pattern("T", "xxx/-x-/-x-", 50, "uncommon");
pattern("B2", "xxx/-xx/--x", 75, "rare");
pattern("R pentomino", "-xx/xx-/-x-", 75, "rare");

pattern("Big I", "xxx/-x-/-x-/xxx", 100, "uncommon");
pattern("Big G", "xxx/x--/x-x/xxx", 100, "uncommon");
pattern("Big S", "xx/x-/xx/-x/xx", 140, "rare");
pattern("Big E", "xx/x-/xx/x-/xx", 140, "rare");

pattern("Pyramid", "--x--/-xxx-/xxxxx", 225, "uncommon");
pattern("Pinwheel", "--x-/xxx-/-xxx/-x--", 350, "rare");
pattern("Big Box", "xxxx/x--x/x--x/xxxx", 350, "rare");
pattern("Noughts & Crosses", "-x-x-/xxxxx/-x-x-/xxxxx/-x-x-", 1500, "rare");

pattern("Rhode Island Z", "-xx/xx-", 12, "common");
pattern("Cleveland Z", "xx-/-xx", 12, "common");
pattern("C", "xx/x-/xx", 12, "uncommon");
pattern("L", "x-/x-/xx", 12, "common");

// Bonuses

bonus("flat_points", ["-20", "subtract 20 nnats"], "common", {
  onScore(score: Score): void {
    score.flatPoints += 20;
  },
  limit: Infinity,
});
