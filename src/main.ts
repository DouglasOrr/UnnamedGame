import * as G from "./core/game";
import * as V from "./core/view";
import { Items } from "./core/items.js";

window.onload = () => {
  const game = new G.Game(
    [Items["plus"], Items["square_M"], Items["rhode_island_Z"]] as G.Pattern[],
    [Items["swap"], Items["swap"], Items["swap"]] as G.Action[],
    [Items["flat_points"]] as G.Bonus[],
    9,
    9,
    /*targetScore=*/ 200
  );
  V.start(game);
};
