import { Grid, Cell } from "../../src/core/grid";

test("Grid init", () => {
  const grid = Grid.random(3, 4);
  expect(grid.rows).toBe(3);
  expect(grid.cols).toBe(4);
  expect(grid.cells).toHaveLength(12);
});

test("Grid parse, get, swap", () => {
  const grid = Grid.parse("x-/--");
  expect(grid.get(0, 0)).toBe(Cell.X);
  expect(grid.get(1, 0)).toBe(Cell.O);

  const swapped = grid.swap(0, 2);
  expect(grid.get(0, 0)).toBe(Cell.X);
  expect(grid.get(1, 0)).toBe(Cell.O);
  expect(swapped.get(0, 0)).toBe(Cell.O);
  expect(swapped.get(1, 0)).toBe(Cell.X);
});

test("Grid match", () => {
  const grid = Grid.parse("xxx-/-x-x/x-x-");
  const matches = grid.match(Grid.parse("x-/-x"));
  expect(matches).toEqual([2, 5]);
});

test("Grid components", () => {
  const grid = Grid.parse("xxx-/-x-x/x-x-");
  expect(grid.components).toEqual([[0, 1, 2, 5], [7], [8], [10]]);
  expect(grid.cellToComponent).toEqual([
    0,
    0,
    0,
    null,
    null,
    0,
    null,
    1,
    2,
    null,
    3,
    null,
  ]);
});
