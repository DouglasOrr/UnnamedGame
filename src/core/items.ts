import { Grid, Item, Score } from "./wave";

export const Items = {} as { [name: string]: Item };

function r<T extends Item>(item: T): void {
  if (Items[item.name]) {
    throw new Error(`Item with name "${item.name}" is already registered.`);
  }
  Items[item.name] = item;
}
let p = 0;

// Actions

r({
  kind: "action",
  name: "swap",
  title: "Swap",
  description: "select 2 cells to swap",
  execute(grid: Grid, arg: { i: number; j: number }): Grid {
    const cellsOut = grid.cells.slice();
    [cellsOut[arg.i], cellsOut[arg.j]] = [cellsOut[arg.j], cellsOut[arg.i]];
    return grid.replace(cellsOut);
  },
  limit: Infinity,
  priority: p++,
});

// Patterns

r({
  kind: "pattern",
  name: "square_S",
  title: "Square S",
  grid: Grid.parse("xx/xx"),
  points: 4,
  priority: p++,
});

r({
  kind: "pattern",
  name: "square_M",
  title: "Square M",
  grid: Grid.parse("xxx/xxx/xxx"),
  points: 20,
  priority: p++,
});

r({
  kind: "pattern",
  name: "square_L",
  title: "Square L",
  grid: Grid.parse("xxxx/xxxx/xxxx/xxxx"),
  points: 150,
  priority: p++,
});

r({
  kind: "pattern",
  name: "plus",
  title: "Plus",
  grid: Grid.parse("-x-/xxx/-x-"),
  points: 25,
  priority: p++,
});

r({
  kind: "pattern",
  name: "rhode_island_Z",
  title: "Rhode Island Z",
  grid: Grid.parse("-xx/xx-"),
  points: 12,
  limit: Infinity,
  priority: p++,
});

// Bonuses

r({
  kind: "bonus",
  name: "flat_points",
  title: "-20",
  description: "subtract 20 nnats",
  onScore(score: Score): void {
    score.flatPoints += 20;
  },
  limit: Infinity,
  priority: p++,
});
