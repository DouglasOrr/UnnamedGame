import * as R from "./core/run";
import * as V from "./core/view";

window.onload = () => {
  const run = new R.Run(
    R.standardSettings({
      waves: 20,
      start: { common: 4, uncommon: 2, rare: 1 },
      end: { common: 1, uncommon: 2, rare: 2 },
      items: [
        // Actions
        "swap",
        "swap",
        "wildcard",
        "shift",
        "gravity",
        "flip_y",
        // Patterns
        "square_s",
        "line",
        // Bonuses
        "flat_multiplier_0.05",
        "flat_points_20",
      ],
      skipToFirstWave: true,
    })
  );
  V.start(run);
};
