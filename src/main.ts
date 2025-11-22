import * as R from "./core/run";
import * as V from "./core/view";
import { Items } from "./core/items";

window.onload = () => {
  const run = new R.Run(
    R.standardSettings({
      waves: 20,
      start: { common: 4, uncommon: 2, rare: 1 },
      end: { common: 1, uncommon: 2, rare: 2 },
      items: [
        "swap",
        "swap",
        "wildcard",
        "shift",
        "gravity",
        "flip_y",
        "square_s",
      ],
      skipToFirstWave: true,
    })
  );
  V.start(run);
};
