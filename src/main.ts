import * as R from "./core/run";
import * as V from "./core/view";
import { Items } from "./core/items";

window.onload = () => {
  const run = new R.Run(
    R.standardSettings(
      /*waves*/ 3,
      { common: 4, uncommon: 2, rare: 1 },
      { common: 1, uncommon: 2, rare: 2 },
      [
        Items["swap"],
        Items["swap"],
        Items["gravity"],
        Items["wildcard"],
        Items["flip_y"],
      ]
    )
  );
  V.start(run);
};
