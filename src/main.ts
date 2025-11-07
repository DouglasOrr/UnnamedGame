import * as G from "./core/game";
import * as V from "./core/view";

window.onload = () => {
  const game = new G.Game(
    9,
    9,
    [
      { grid: G.Grid.parse("-x-/xxx/-x-"), points: 25 },
      { grid: G.Grid.parse("xx/xx"), points: 2 },
    ],
    /*targetScore=*/ 100
  );
  V.start(game);
};
