import * as W from "./core/wave";
import * as V from "./core/view";
import { Items } from "./core/items";

window.onload = () => {
  const wave = new W.Wave({
    patterns: [
      Items["plus"],
      Items["square_M"],
      Items["rhode_island_Z"],
    ] as W.Pattern[],
    actions: [Items["swap"], Items["swap"], Items["swap"]] as W.Action[],
    bonuses: [Items["flat_points"]] as W.Bonus[],
    gridRows: 9,
    gridCols: 9,
    targetScore: 200,
    maxFrames: 3,
    maxRolls: 1,
  });
  V.start(wave);
};
