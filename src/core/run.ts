import * as W from "./wave.js";

export type Phase =
  | { type: "wave"; targetScore: number }
  | { type: "item"; kind?: "pattern" | "action" | "bonus" };

export interface RunSettings {
  maxFrames: number;
  maxRolls: number;
  gridRows: number;
  gridCols: number;
  schedule: Phase[];
}

export class Run {
  readonly items: W.Item[] = [];

  constructor(readonly s: RunSettings) {}
}
