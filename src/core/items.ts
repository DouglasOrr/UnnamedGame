import { Frequency, Grid, Item, Score, Cell } from "./wave";
import * as W from "./wave";

export const Items = {} as Record<string, W.Item>;

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
    freqMultiplier: 2,
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
    freqMultiplier: 1,
    limit: args.limit ?? Infinity,
    priority: nextPriority++,
  });
}

function bonus(
  nameFreqLimit: [string, Frequency, number],
  titleDescription: [string, string],
  args: { onScore: (score: Score, grid: Grid) => void; icon?: string }
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
    freqMultiplier: 1,
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

// Squares
pattern("Square S", "xx/xx", 3, "common");
pattern("Square M", "xxx/xxx/xxx", 30, "common");
pattern("Square L", "xxxx/xxxx/xxxx/xxxx", 300, "rare");
pattern("Square XL", "xxxxx/xxxxx/xxxxx/xxxxx/xxxxx", 1200, "rare");

// Lines
pattern("Line", "xxxx", 3, "uncommon");
pattern("Line L", "xxxxxx", 10, "uncommon");
pattern("Line XXL", "xxxxxxxxx", 230, "rare");
pattern("Column", "x/x/x/x", 3, "uncommon");
pattern("Column L", "x/x/x/x/x/x", 10, "uncommon");
pattern("Column XXL", "x/x/x/x/x/x/x/x/x", 230, "rare");

// 2x3 | 3x2
pattern("Rhode Island Z", "-xx/xx-", 14, "common");
pattern("Cleveland Z", "xx-/-xx", 14, "common");
pattern("Letter L", "x-/x-/xx", 14, "common");
pattern("Letter C", "xx/x-/xx", 14, "uncommon");
pattern("Thumbs Up", "-x/xx/xx", 14, "uncommon");

// 3x3
pattern("Plus", "-x-/xxx/-x-", 50, "common");
pattern("Box", "xxx/x-x/xxx", 50, "common");
pattern("Heli Pad", "x-x/xxx/x-x", 50, "common");
pattern("T", "xxx/-x-/-x-", 70, "uncommon");
pattern("Four", "x-x/xxx/--x", 70, "uncommon");
pattern("B2", "xxx/-xx/--x", 90, "rare");
pattern("R pentomino", "-xx/xx-/-x-", 90, "rare");

// Large
pattern("Big I", "xxx/-x-/-x-/xxx", 400, "uncommon");
pattern("Big G", "xxx/x--/x-x/xxx", 400, "uncommon");
pattern("Big S", "xx/x-/xx/-x/xx", 170, "rare");
pattern("Big E", "xx/x-/xx/x-/xx", 170, "rare");

// Huge
pattern("Pyramid", "--x--/-xxx-/xxxxx", 225, "uncommon");
pattern("Pinwheel", "--x-/xxx-/-xxx/-x--", 1500, "uncommon");

// Bonuses

// Bonuses::Pattern

function ppoints_flat(points: number, freq: Frequency): void {
  bonus(
    [`ppoints_flat_${freq}`, freq, Infinity],
    [
      `−${points} nnats/pattern`,
      `subtract an additional ${points} nnats from every pattern`,
    ],
    {
      onScore(score: Score): void {
        for (const component of score.components) {
          for (const match of component.matches) {
            match.points += points;
          }
        }
      },
      icon: `bonus/ppoints_flat.png`,
    }
  );
}
ppoints_flat(3, "common");
ppoints_flat(7, "uncommon");
// ppoints_flat(12, "rare");

bonus(
  ["pmult_symmetric", "uncommon", 1],
  ["Symmetry", "add 50% pattern multiplier per reflective symmetry"],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        for (const match of component.matches) {
          const symmetries = W.countReflectiveSymmetries(match.pattern.grid);
          match.points += match.points * 0.5 * symmetries;
        }
      }
    },
  }
);

bonus(
  ["pmult_asymmetric", "uncommon", 1],
  [
    "Asymmetry",
    "add 100% multiplier to patterns with no reflective symmetries",
  ],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        for (const match of component.matches) {
          const symmetries = W.countReflectiveSymmetries(match.pattern.grid);
          match.points += match.points * 1.0 * +(symmetries === 0);
        }
      }
    },
  }
);

bonus(
  ["pmult_size", "uncommon", 1],
  ["Heavy Hitter", "multiply pattern nnats by ×1.1 per cell in the pattern"],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        for (const match of component.matches) {
          match.points *= Math.pow(1.1, match.pattern.grid.cells.length);
        }
      }
    },
  }
);

// Bonuses::Group

function mult_flat(multiplier: number, freq: Frequency): void {
  bonus(
    [`mult_flat_${freq}`, freq, 1],
    [
      `${multiplier * 100}% Bonus`,
      `add a ${multiplier * 100}% multiplier to each group`,
    ],
    {
      onScore(score: Score): void {
        for (const component of score.components) {
          component.multiplier += multiplier;
        }
      },
      icon: `bonus/mult_flat.png`,
    }
  );
}
mult_flat(0.15, "common");
mult_flat(0.2, "uncommon");
// mult_flat(0.25, "rare");

bonus(
  ["mult_per_cell", "uncommon", 1],
  ["Cell Bonus", "add 1% multiplier per cell to each group"],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        component.multiplier += 0.01 * component.cellIndices.length;
      }
    },
  }
);

bonus(
  ["mult_per_pattern", "uncommon", 1],
  ["Pattern Bonus", "add 5% multiplier per pattern to each group"],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        component.multiplier += 0.05 * component.matches.length;
      }
    },
  }
);

function countEdges(cells: number[], grid: Grid): number {
  let top = false,
    bottom = false,
    left = false,
    right = false;
  for (const idx of cells) {
    const r = Math.floor(idx / grid.cols);
    const c = idx % grid.cols;
    if (r === 0) top = true;
    if (r === grid.rows - 1) bottom = true;
    if (c === 0) left = true;
    if (c === grid.cols - 1) right = true;
  }
  return +top + +bottom + +left + +right;
}

bonus(
  ["mult_per_edge", "common", 1],
  ["Edge Bonus", "add 10% group multiplier per touching grid edge"],
  {
    onScore(score: Score, grid: Grid): void {
      for (const component of score.components) {
        component.multiplier += 0.1 * countEdges(component.cellIndices, grid);
      }
    },
  }
);

bonus(
  ["mult2_unique", "rare", 1],
  [
    "Unique Pattern Bonus",
    "multiply the group multiplier ×1.1 for each unique pattern in the group",
  ],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        const uniquePatterns = new Set<string>();
        for (const match of component.matches) {
          uniquePatterns.add(match.pattern.name);
        }
        component.multiplier *= Math.pow(1.1, uniquePatterns.size);
      }
    },
  }
);

bonus(
  ["mult_no_edges", "common", 1],
  [
    "Floating Bonus",
    "multiply the group multiplier ×3 if not touching any grid edge",
  ],
  {
    onScore(score: Score, grid: Grid): void {
      for (const component of score.components) {
        if (countEdges(component.cellIndices, grid) === 0) {
          component.multiplier *= 3.0;
        }
      }
    },
  }
);

bonus(
  ["points_per_cell", "common", Infinity],
  ["Better Cells", "subtract 1 extra nnat per cell in a scoring group"],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        component.cellPoints += 1;
      }
    },
  }
);

bonus(
  ["score_every_group", "common", 1],
  ["Everyone's A Winner", "every group scores, even with no matching patterns"],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        component.alwaysScoring = true;
      }
    },
  }
);

bonus(
  ["group_score_best_pattern", "rare", 1],
  [
    "Follow The Leader",
    "each pattern scores as the highest-scoring pattern in its group",
  ],
  {
    onScore(score: Score): void {
      for (const component of score.components) {
        let bestPatternPoints = 0;
        for (const match of component.matches) {
          if (match.points > bestPatternPoints) {
            bestPatternPoints = match.points;
          }
        }
        for (const match of component.matches) {
          match.points = bestPatternPoints;
        }
      }
    },
  }
);

// Bonuses::Global

function gpoints_flat(points: number, freq: Frequency): void {
  bonus(
    [`gpoints_flat_${freq}`, freq, Infinity],
    [`−${points}`, `subtract ${points} nnats`],
    {
      onScore(score: Score): void {
        score.flatPoints += points;
      },
      icon: `bonus/gpoints_flat.png`,
    }
  );
}
gpoints_flat(50, "common");
gpoints_flat(75, "uncommon");
// gpoints_flat(100, "rare");

function gmult_flat(multiplier: number, freq: Frequency): void {
  bonus(
    [`gmult_flat_${freq}`, freq, 1],
    [
      `${multiplier * 100}% Discount`,
      `add a global ${multiplier * 100}% multiplier`,
    ],
    {
      onScore(score: Score): void {
        score.multiplier += multiplier;
      },
      icon: `bonus/gmult_flat.png`,
    }
  );
}
gmult_flat(0.15, "common");
gmult_flat(0.2, "uncommon");
// gmult_flat(0.25, "rare");

bonus(
  ["gmult_cell", "rare", 1],
  [
    "Matched Cell Discount",
    "for each matched pattern cell, add a global 1% multiplier",
  ],
  {
    onScore(score: Score): void {
      const matchedCells = score.components.reduce(
        (c, n) =>
          c + n.matches.reduce((cc, m) => cc + m.pattern.grid.cells.length, 0),
        0
      );
      score.multiplier += 0.01 * matchedCells;
    },
  }
);

bonus(
  ["gmult_pattern", "rare", 1],
  ["Pattern Discount", "for each pattern match, add a global 5% multiplier"],
  {
    onScore(score: Score): void {
      score.multiplier +=
        0.05 * score.components.reduce((c, n) => c + n.matches.length, 0);
    },
  }
);

bonus(
  ["gmult_group_scoring", "uncommon", 1],
  ["Group Discount", "for each scoring group, add a global 15% multiplier"],
  {
    onScore(score: Score): void {
      score.multiplier +=
        0.15 * score.components.filter((c) => c.matches.length > 0).length;
    },
    icon: `bonus/gmult_group.png`,
  }
);

bonus(
  ["gmult_group_all", "rare", 1],
  [
    "All Groups Discount",
    "for every group, scoring or not, add a global 5% multiplier",
  ],
  {
    onScore(score: Score): void {
      score.multiplier += 0.05 * score.components.length;
    },
    icon: `bonus/gmult_group.png`,
  }
);

bonus(
  ["gmult_pattern_unique", "uncommon", 1],
  [
    "Unique Pattern Discount",
    "for each unique pattern, multiply the global multiplier ×1.1",
  ],
  {
    onScore(score: Score): void {
      const uniquePatterns = new Set<string>();
      for (const component of score.components) {
        for (const match of component.matches) {
          uniquePatterns.add(match.pattern.name);
        }
      }
      score.multiplier *= Math.pow(1.1, uniquePatterns.size);
    },
  }
);
