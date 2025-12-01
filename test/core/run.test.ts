import * as R from "../../src/core/run";

test("Run score progression", () => {
  for (const level of Object.values(R.Levels)) {
    const targets = level.settings.schedule
      .filter((e) => e.type === "wave")
      .map((e) => e.targetScore);
    console.log(
      `Level: ${level.title}, Targets: ${targets
        .map((t) => t.toFixed(0))
        .join(", ")}`
    );
  }
});
