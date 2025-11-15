import * as G from "./core/game";
import * as V from "./core/view";

window.onload = () => {
  const game = new G.Game(
    [G.PlusPattern, G.SquareMPattern, G.RhodeIslandZ],
    [
      G.SwapAction,
      G.SwapAction,
      G.SwapAction,
      G.SwapAction,
      G.SwapAction,
      G.SwapAction,
      G.SwapAction,
    ],
    [G.FlatPointsBonus],
    9,
    9,
    /*targetScore=*/ 200
  );
  V.start(game);
};
