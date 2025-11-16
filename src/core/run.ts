import * as W from "./wave";
import { Items } from "./items";

// Select & Outcome

export class Select {
  constructor(readonly offers: W.Item[]) {}
}

export class Outcome {
  constructor(readonly result: "win" | "lose") {}
}

// Run

export interface WavePhase {
  type: "wave";
  targetScore: number;
}
export interface SelectPhase {
  type: "select";
  kind?: "pattern" | "action" | "bonus";
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

export class Run {
  readonly items: W.Item[];
  private phaseIndex = -1;

  constructor(readonly s: RunSettings) {
    this.items = s.items.slice();
    this.items.sort((a, b) => a.priority - b.priority);
  }

  private select(phase: SelectPhase): Select {
    const offers: W.Item[] = [];
    for (let n = 0; n < this.s.offers; n++) {
      const candidates = Object.values(Items).filter(
        (item) =>
          (phase.kind === undefined || W.kind(item) === phase.kind) &&
          this.items.reduce((c, i) => c + +(i.name === item.name), 0) <
            (item.limit ?? 1) &&
          !offers.includes(item)
      );
      if (candidates.length === 0) {
        // can't find enough candidates, return what we have
        return new Select(offers);
      }
      offers.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    return new Select(offers);
  }

  private wave(phase: WavePhase): W.Wave {
    return new W.Wave({
      patterns: this.items.filter(
        (item): item is W.Pattern => W.kind(item) === "pattern"
      ),
      actions: this.items.filter(
        (item): item is W.Action => W.kind(item) === "action"
      ),
      bonuses: this.items.filter(
        (item): item is W.Bonus => W.kind(item) === "bonus"
      ),
      gridRows: this.s.gridRows,
      gridCols: this.s.gridCols,
      targetScore: phase.targetScore,
      maxFrames: this.s.maxFrames,
      maxRolls: this.s.maxRolls,
    });
  }

  next(
    phaseOutcome?: { select: W.Item } | { wave: "win" | "lose" }
  ): { select: Select } | { wave: W.Wave } | { outcome: Outcome } {
    // Handle outcome of previous phase
    if (this.phaseIndex >= 0) {
      if (phaseOutcome === undefined) {
        throw new Error("Must return a trigger, unless it's the first phase");
      }
      const phase = this.s.schedule[this.phaseIndex];
      if (phase.type === "select" && "select" in phaseOutcome) {
        this.items.push(phaseOutcome.select);
        this.items.sort((a, b) => a.priority - b.priority);
      } else if (phase.type === "wave" && "wave" in phaseOutcome) {
        if (phaseOutcome.wave === "lose") {
          return { outcome: new Outcome("lose") };
        }
        this.phaseIndex++;
      } else {
        throw new Error("Trigger does not match current phase");
      }
    }
    // Advance to next phase
    this.phaseIndex++;
    if (this.phaseIndex >= this.s.schedule.length) {
      return { outcome: new Outcome("win") };
    }
    // Return next phase
    const phase = this.s.schedule[this.phaseIndex];
    if (phase.type === "select") {
      return { select: this.select(phase) };
    } else if (phase.type === "wave") {
      return { wave: this.wave(phase) };
    }
    throw new Error(`Unexpected phase ${JSON.stringify(phase)}`);
  }
}
