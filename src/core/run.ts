import { AchievementTracker } from "./achievements";
import { Items } from "./items";
import * as W from "./wave";

// Select

function sampleWeighted<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    if (r < weights[i]) {
      return items[i];
    }
    r -= weights[i];
  }
  return items[items.length - 1];
}

export type Chance = { common: number; uncommon: number; rare: number };

export class Select {
  phase: "select" = "select";
  selected: number | "skip" | null = null;

  constructor(readonly items: W.Item[], readonly offers: W.Item[]) {}

  static sample(
    items: W.Item[],
    count: number,
    chance: Chance,
    only?: "pattern" | "action" | "bonus"
  ): Select {
    const offers: W.Item[] = [];
    for (let n = 0; n < count; n++) {
      const candidates = Object.values(Items).filter(
        (item) =>
          (only === undefined || item.kind === only) &&
          items.reduce((c, i) => c + +(i.name === item.name), 0) < item.limit &&
          !offers.includes(item)
      );
      if (candidates.length === 0) {
        // can't find enough candidates, return what we have
        return new Select(items, offers);
      }
      const weights = candidates.map(
        (item) => chance[item.freq] * item.freqMultiplier
      );
      offers.push(sampleWeighted(candidates, weights));
    }
    return new Select(items, offers);
  }
}

// Run outcome

export class RunOutcome {
  phase: "outcome" = "outcome";
  constructor(readonly result: "win" | "lose") {}
}

// Run config

export interface WavePhase {
  type: "wave";
  targetScore: number;
}
export interface SelectPhase {
  type: "select";
  chance: Chance;
  only?: "pattern" | "action" | "bonus";
}
export type Phase = WavePhase | SelectPhase;

export interface RunSettings {
  items: W.Item[];
  schedule: Phase[];
  // Wave
  maxFrames: number;
  maxRolls: number;
  gridRows: number;
  gridCols: number;
  // Select
  offers: number;
}

export interface ScoreProgression {
  start: number;
  r_exp: number;
  rate: number;
  r_linear: number;
}

function targetScore(s: ScoreProgression, wave: number): number {
  return Math.floor(
    s.start *
      (1 - s.r_exp + s.r_exp * Math.pow(s.rate, wave) + s.r_linear * wave)
  );
}

export function standardSettings(s: {
  waves: number;
  start: Chance;
  end: Chance;
  items: string[];
  score: ScoreProgression;
  startWithSelect?: boolean;
}): RunSettings {
  const schedule: Phase[] = [];
  const startWithSelect = s.startWithSelect ?? true;
  if (startWithSelect) {
    schedule.push({
      type: "select",
      only: "pattern",
      chance: s.start,
    });
  }
  for (let w = 0; w < s.waves; w++) {
    const c0 = s.start;
    const c1 = s.end;
    const r = w / (s.waves - 1);
    if (w > 0 || (w === 0 && startWithSelect)) {
      schedule.push({
        type: "select",
        chance: {
          common: c0.common + r * (c1.common - c0.common),
          uncommon: c0.uncommon + r * (c1.uncommon - c0.uncommon),
          rare: c0.rare + r * (c1.rare - c0.rare),
        },
      });
    }
    schedule.push({ type: "wave", targetScore: targetScore(s.score, w) });
  }

  return {
    items: s.items.map((name) => Items[name]),
    schedule: schedule,
    maxFrames: 3,
    maxRolls: 1,
    gridRows: 9,
    gridCols: 9,
    offers: 3,
  };
}

// Run

export class Run {
  readonly items: W.Item[];
  private phaseIndex = -1;

  constructor(readonly s: RunSettings, readonly level: string) {
    this.items = s.items.slice();
    this.items.sort((a, b) => a.priority - b.priority);
    AchievementTracker.get().onRunStart(this);
  }

  totalWaves(): number {
    return this.s.schedule.reduce(
      (acc, phase) => acc + +(phase.type === "wave"),
      0
    );
  }

  waveCount(): number {
    let count = 0;
    for (let i = 0; i <= this.phaseIndex; i++) {
      if (this.s.schedule[i].type === "wave") {
        count++;
      }
    }
    return count;
  }

  forceWin(): RunOutcome {
    const outcome = new RunOutcome("win");
    AchievementTracker.get().onRunEnd(this, outcome);
    return outcome;
  }

  next(lastPhase?: W.Wave | Select | RunOutcome): W.Wave | Select | RunOutcome {
    // Handle outcome of previous phase
    if (this.phaseIndex >= 0) {
      if (lastPhase === undefined) {
        throw new Error("Must provide lastPhase, unless it's the first phase");
      }
      if (lastPhase.phase !== this.s.schedule[this.phaseIndex].type) {
        console.error("lastPhase does not match expected phase type");
      }
      if (lastPhase.phase == "select") {
        if (lastPhase.selected !== null && lastPhase.selected !== "skip") {
          const selectedItem = lastPhase.offers[lastPhase.selected];
          this.items.push(selectedItem);
          this.items.sort((a, b) => a.priority - b.priority);
          AchievementTracker.get().onItemCollected(selectedItem);
        }
      } else if (lastPhase.phase == "wave") {
        AchievementTracker.get().onWaveComplete(lastPhase);
        if (lastPhase.status === "playing") {
          console.error("Wave is still playing -- treating as a win");
        }
        if (lastPhase.status === "lose") {
          const outcome = new RunOutcome("lose");
          AchievementTracker.get().onRunEnd(this, outcome);
          return outcome;
        }
      }
    }
    // Advance to next phase
    this.phaseIndex++;
    if (this.phaseIndex >= this.s.schedule.length) {
      const outcome = new RunOutcome("win");
      AchievementTracker.get().onRunEnd(this, outcome);
      return outcome;
    }
    // Return next phase
    const phase = this.s.schedule[this.phaseIndex];
    if (phase.type === "select") {
      return Select.sample(this.items, this.s.offers, phase.chance, phase.only);
    } else if (phase.type === "wave") {
      return new W.Wave({
        patterns: this.items.filter((item) => item.kind === "pattern"),
        actions: this.items.filter((item) => item.kind === "action"),
        bonuses: this.items.filter((item) => item.kind === "bonus"),
        gridRows: this.s.gridRows,
        gridCols: this.s.gridCols,
        targetScore: phase.targetScore,
        maxFrames: this.s.maxFrames,
        maxRolls: this.s.maxRolls,
      });
    }
    throw new Error(`Unexpected phase ${JSON.stringify(phase)}`);
  }
}

// Levels

export interface Level {
  name: string;
  title: string;
  unlockedBy: string | null;
  settings: RunSettings;
}

export const Levels: Record<string, Level> = {};

function registerLevel(level: Level): void {
  Levels[level.name] = level;
}
const likelihoodStart = { common: 4, uncommon: 1, rare: 0 };
const likelihoodEnd = { common: 1, uncommon: 2, rare: 2 };
registerLevel({
  name: "level_0",
  unlockedBy: null,
  title: "Level 1",
  settings: standardSettings({
    waves: 20,
    start: likelihoodStart,
    end: likelihoodEnd,
    items: ["swap", "swap", "square_m", "letter_l"],
    score: { start: 150, r_exp: 0.3, rate: 1.2, r_linear: 0.25 },
    startWithSelect: false,
  }),
});
registerLevel({
  name: "level_1",
  unlockedBy: "level_0",
  title: "Level 2",
  settings: standardSettings({
    waves: 20,
    start: likelihoodStart,
    end: likelihoodEnd,
    items: ["swap", "swap"],
    score: { start: 200, r_exp: 0.3, rate: 1.25, r_linear: 0.25 },
  }),
});
registerLevel({
  name: "level_2",
  unlockedBy: "level_1",
  title: "Level 3",
  settings: standardSettings({
    waves: 20,
    start: likelihoodStart,
    end: likelihoodEnd,
    items: ["swap", "swap"],
    score: { start: 225, r_exp: 0.3, rate: 1.3, r_linear: 0.3 },
  }),
});
registerLevel({
  name: "level_shift",
  unlockedBy: "level_1",
  title: "Shift & Flip (Challenge)",
  settings: standardSettings({
    waves: 10,
    start: likelihoodStart,
    end: likelihoodEnd,
    items: ["shift", "shift", "shift", "flip_y"],
    score: { start: 150, r_exp: 0.3, rate: 1.2, r_linear: 0.25 },
  }),
});
