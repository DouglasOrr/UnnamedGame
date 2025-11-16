import * as G from "../../src/core/game";
import { Items } from "../../src/core/items";

test("Action swap", () => {
  const grid = G.Grid.parse("x-/--");
  const swapped = (Items["swap"] as G.Action).execute(grid, { i: 0, j: 2 });
  expect(grid.get(0, 0)).toBe(G.Cell.X);
  expect(grid.get(1, 0)).toBe(G.Cell.O);
  expect(swapped.get(0, 0)).toBe(G.Cell.O);
  expect(swapped.get(1, 0)).toBe(G.Cell.X);
});

test("all patterns have one connected component", () => {
  for (const itemName in Items) {
    const item = Items[itemName];
    if (G.kind(item) === "pattern") {
      const c = (item as G.Pattern).grid.getComponents();
      expect(c.components.length).toBe(1);
    }
  }
});
