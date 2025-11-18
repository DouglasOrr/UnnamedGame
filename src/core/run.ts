import { Items } from "./items";
import * as W from "./wave";

// Select & RunOutcome

export class Select {
  phase: "select" = "select";
  selected: number | null = null;
  constructor(readonly items: W.Item[], readonly offers: W.Item[]) {}
}

export class RunOutcome {
  phase: "outcome" = "outcome";
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
          (phase.kind === undefined || item.kind === phase.kind) &&
          this.items.reduce((c, i) => c + +(i.name === item.name), 0) <
            (item.limit ?? 1) &&
          !offers.includes(item)
      );
      if (candidates.length === 0) {
        // can't find enough candidates, return what we have
        return new Select(this.items, offers);
      }
      offers.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    return new Select(this.items, offers);
  }

  private wave(phase: WavePhase): W.Wave {
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

  next(lastPhase?: W.Wave | Select | RunOutcome): W.Wave | Select | RunOutcome {
    // Handle outcome of previous phase
    if (this.phaseIndex >= 0) {
      if (lastPhase === undefined) {
        throw new Error("Must return a trigger, unless it's the first phase");
      }
      const phase = this.s.schedule[this.phaseIndex];
      if (phase.type === "select" && lastPhase.phase == "select") {
        if (lastPhase.selected !== null) {
          this.items.push(lastPhase.offers[lastPhase.selected]);
          this.items.sort((a, b) => a.priority - b.priority);
        }
      } else if (phase.type === "wave" && lastPhase.phase == "wave") {
        if (lastPhase.status === "playing") {
          console.error(
            "next() while Wave is still playing -- treating as a win"
          );
        }
        if (lastPhase.status === "lose") {
          return new RunOutcome("lose");
        }
        this.phaseIndex++;
      } else {
        throw new Error("Trigger does not match current phase");
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
      return this.select(phase);
    } else if (phase.type === "wave") {
      return this.wave(phase);
    }
    throw new Error(`Unexpected phase ${JSON.stringify(phase)}`);
  }
}
