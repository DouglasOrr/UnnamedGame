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
  nameFreqLimit: [string, Frequency, number],
  titleDescription: [string, string],
  execute: (grid: Grid, arg: any) => Grid
): void {
  register({
    kind: "action",
    name: nameFreqLimit[0],
    // View
    title: titleDescription[0],
    description: titleDescription[1],
    icon: `action/${nameFreqLimit[0]}.png`,
    // Behaviour
    freq: nameFreqLimit[1],
    limit: nameFreqLimit[2],
    priority: nextPriority++,
    execute,
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

function bonus(
  nameFreqLimit: [string, Frequency, number],
  titleDescription: [string, string],
  args: { onScore: (score: Score) => void; icon?: string }
): void {
  register({
    kind: "bonus",
    name: nameFreqLimit[0],
    // View
    title: titleDescription[0],
    description: titleDescription[1],
    icon: args.icon ?? `bonus/${nameFreqLimit[0]}.png`,
    // Behaviour
    freq: nameFreqLimit[1],
    limit: nameFreqLimit[2],
    priority: nextPriority++,
    onScore: args.onScore,
  });
}

// Actions

action(
  ["swap", "uncommon", Infinity],
  ["Swap", "select 2 cells to swap"],
  (grid: Grid, arg: { i: number; j: number }) => {
    const cellsOut = grid.cells.slice();
    [cellsOut[arg.i], cellsOut[arg.j]] = [cellsOut[arg.j], cellsOut[arg.i]];
    return grid.replace(cellsOut);
  }
);

action(
  ["wildcard", "uncommon", Infinity],
  ["Wildcard", "add a wildcard cell, which can match O or X"],
  (grid: Grid, arg: { i: number }) => {
    const cellsOut = grid.cells.slice();
    cellsOut[arg.i] = Cell.W;
    return grid.replace(cellsOut);
  }
);

action(
  ["shift", "rare", Infinity],
  ["Shift", "shift the grid in the chosen direction, with wrap-around"],
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
  }
);

action(["flip_y", "rare", 1], ["Flip", "flip vertically"], (grid: Grid) => {
  const cellsOut = grid.cells.slice();
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      cellsOut[(grid.rows - 1 - r) * grid.cols + c] =
        grid.cells[r * grid.cols + c];
    }
  }
  return grid.replace(cellsOut);
});

action(
  ["gravity", "rare", 1],
  ["Gravity", "everything falls to the floor"],
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
  }
);

// Patterns

pattern("Square S", "xx/xx", 3, "common");
pattern("Square M", "xxx/xxx/xxx", 30, "common");
pattern("Square L", "xxxx/xxxx/xxxx/xxxx", 250, "rare");
pattern("Square XL", "xxxxx/xxxxx/xxxxx/xxxxx/xxxxx", 1000, "rare");

pattern("Line", "xxxx", 3, "uncommon");
pattern("Column", "x/x/x/x", 3, "uncommon");
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

// Bonuses::Global

function gpoints_flat(points: number, freq: Frequency): void {
  bonus(
    [`gpoints_flat_${points}`, freq, Infinity],
    [`−${points}`, `subtract ${points} nnats`],
    {
      onScore(score: Score): void {
        score.flatPoints += points;
      },
      icon: `bonus/gpoints_flat.png`,
    }
  );
}
gpoints_flat(20, "common");
gpoints_flat(40, "uncommon");
gpoints_flat(100, "rare");

function gmult_flat(multiplier: number, freq: Frequency): void {
  bonus(
    [`gmult_flat_${multiplier}`, freq, 1],
    [`−${multiplier * 100}%`, `add a global ${multiplier * 100}% multiplier`],
    {
      onScore(score: Score): void {
        score.flatMultiplier += multiplier;
      },
      icon: `bonus/gmult_flat.png`,
    }
  );
}
gmult_flat(0.05, "common");
gmult_flat(0.15, "uncommon");
gmult_flat(0.25, "rare");

bonus(
  ["gmult_group_scoring", "uncommon", 1],
  ["Group Discount", "for each scoring group, add a global 10% multiplier"],
  {
    onScore(score: Score): void {
      score.flatMultiplier +=
        0.1 * score.components.filter((c) => c.matches.length > 0).length;
    },
    icon: `bonus/gmult_group.png`,
  }
);

bonus(
  ["gmult_group_all", "rare", 1],
  [
    "Group Discount (+)",
    "for each and every group, add a global 5% multiplier",
  ],
  {
    onScore(score: Score): void {
      score.flatMultiplier += 0.05 * score.components.length;
    },
    icon: `bonus/gmult_group.png`,
  }
);
