import { Item, Grid, Score } from "./game";

export const Items = {} as { [name: string]: Item };

function r<T extends Item>(item: T): void {
  if (Items[item.name]) {
    throw new Error(`Item with name "${item.name}" is already registered.`);
  }
  Items[item.name] = item;
}

// Actions

r({
  name: "swap",
  title: "Swap",
  description: "select 2 cells to swap",
  priority: 1,
  execute(grid: Grid, arg: { i: number; j: number }): Grid {
    const cellsOut = grid.cells.slice();
    [cellsOut[arg.i], cellsOut[arg.j]] = [cellsOut[arg.j], cellsOut[arg.i]];
    return grid.replace(cellsOut);
  },
});

// Patterns

r({
  name: "square_S",
  title: "Square S",
  grid: Grid.parse("xx/xx"),
  points: 4,
});

r({
  name: "square_M",
  title: "Square M",
  grid: Grid.parse("xxx/xxx/xxx"),
  points: 20,
});

r({
  name: "square_L",
  title: "Square L",
  grid: Grid.parse("xxxx/xxxx/xxxx/xxxx"),
  points: 150,
});

r({
  name: "plus",
  title: "Plus",
  grid: Grid.parse("-x-/xxx/-x-"),
  points: 25,
});

r({
  name: "rhode_island_Z",
  title: "Rhode Island Z",
  grid: Grid.parse("-xx/xx-"),
  points: 12,
});

// Bonuses

r({
  name: "flat_points",
  title: "-20",
  description: "subtract 20 nnats",
  priority: 100,
  onScore(score: Score): void {
    score.flatPoints += 20;
  },
});
