import { Items } from "./core/items";
import * as R from "./core/run";
import * as V from "./core/view";

window.onload = () => {
  const run = new R.Run({
    items: [Items["swap"], Items["swap"]],
    schedule: [
      { type: "select", kind: "pattern" },
      { type: "select" },
      { type: "wave", targetScore: 100 },
    ],
    maxFrames: 3,
    maxRolls: 1,
    gridRows: 9,
    gridCols: 9,
    offers: 3,
  });
  V.start(run);
};
