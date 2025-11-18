import * as G from "../../src/core/wave";

test("Grid init", () => {
  const grid = G.Grid.random(3, 4);
  expect(grid.rows).toBe(3);
  expect(grid.cols).toBe(4);
  expect(grid.cells).toHaveLength(12);
});

test("Grid parse, get", () => {
  const grid = G.Grid.parse("x-/--");
  expect(grid.get(0, 0)).toBe(G.Cell.X);
  expect(grid.get(1, 0)).toBe(G.Cell.O);
});

test("Grid getComponents", () => {
  const grid = G.Grid.parse("xxx-/-x-x/x-x-");
  const c = grid.getComponents();
  expect(c.components).toEqual([[0, 1, 2, 5], [7], [8], [10]]);
  /* prettier-ignore */
  expect(c.cellToComponent).toEqual([
    0, 0, 0, null, null, 0, null, 1, 2, null, 3, null
  ]);
});

test("Pattern find", () => {
  const grid = G.Grid.parse("xxx-/-x-x/x-x-");
  const pattern = {
    kind: "pattern" as const,
    grid: G.Grid.parse("x-/-x"),
    name: "test",
    title: "Test",
    points: 0,
    priority: 0,
  };
  const matches = G.findMatches(pattern, grid);
  expect(matches).toEqual([2, 5]);
});
