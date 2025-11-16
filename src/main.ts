import * as G from "./core/game";
import * as V from "./core/view";
import { Items } from "./core/items.js";

window.onload = () => {
  const wave = new G.Wave({
    patterns: [
      Items["plus"],
      Items["square_M"],
      Items["rhode_island_Z"],
    ] as G.Pattern[],
    actions: [Items["swap"], Items["swap"], Items["swap"]] as G.Action[],
    bonuses: [Items["flat_points"]] as G.Bonus[],
    gridRows: 9,
    gridCols: 9,
    targetScore: 200,
    maxFrames: 3,
    maxRolls: 1,
  });
  V.start(wave);
};
