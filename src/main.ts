import * as R from "./core/run";
import * as V from "./core/view";
import * as S from "./core/sound";

window.onload = () => {
  const player = new S.Player();
  function onClick() {
    player.play();
    document.removeEventListener("click", onClick);
  }
  document.addEventListener("click", onClick);
  const run = new R.Run(
    R.standardSettings({
      waves: 20,
      start: { common: 4, uncommon: 2, rare: 1 },
      end: { common: 1, uncommon: 2, rare: 2 },
      items: [
        // Actions
        "swap",
        "swap",
        // Patterns
        // Bonuses
      ],
      // skipToFirstWave: true,
    })
  );
  V.start(run);
};
