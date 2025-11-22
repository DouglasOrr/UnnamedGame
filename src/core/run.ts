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
  selected: number | null = null;

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
          items.reduce((c, i) => c + +(i.name === item.name), 0) <
            (item.limit ?? 1) &&
          !offers.includes(item)
      );
      if (candidates.length === 0) {
        // can't find enough candidates, return what we have
        return new Select(items, offers);
      }
      const weights = candidates.map((item) => chance[item.freq]);
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

export function standardSettings(s: {
  waves: number;
  start: Chance;
  end: Chance;
  items: string[];
  skipToFirstWave?: boolean;
}): RunSettings {
  const skipToFirstWave = s.skipToFirstWave ?? false;
  const schedule: Phase[] = [];
  if (!skipToFirstWave) {
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
    if (w > 0 || !skipToFirstWave) {
      schedule.push({
        type: "select",
        chance: {
          common: c0.common + r * (c1.common - c0.common),
          uncommon: c0.uncommon + r * (c1.uncommon - c0.uncommon),
          rare: c0.rare + r * (c1.rare - c0.rare),
        },
      });
    }
    schedule.push({ type: "wave", targetScore: (w + 1) * 100 });
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

  constructor(readonly s: RunSettings) {
    this.items = s.items.slice();
    this.items.sort((a, b) => a.priority - b.priority);
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
        if (lastPhase.selected !== null) {
          this.items.push(lastPhase.offers[lastPhase.selected]);
          this.items.sort((a, b) => a.priority - b.priority);
        }
      } else if (lastPhase.phase == "wave") {
        if (lastPhase.status === "playing") {
          console.error("Wave is still playing -- treating as a win");
        }
        if (lastPhase.status === "lose") {
          return new RunOutcome("lose");
        }
      }
    }
    // Advance to next phase
    this.phaseIndex++;
    if (this.phaseIndex >= this.s.schedule.length) {
      return new RunOutcome("win");
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
