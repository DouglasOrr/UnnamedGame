import { Items } from "./core/items";
import * as R from "./core/run";
import * as V from "./core/view";
import * as W from "./core/wave";

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

  // Temporary hard-coded
  let phase = run.next();
  let outcome = { select: (phase as { select: R.Select }).select.offers[0] };
  phase = run.next(outcome);
  outcome = { select: (phase as { select: R.Select }).select.offers[0] };
  const wave = (run.next(outcome) as { wave: W.Wave }).wave;

  V.start(wave);
};
