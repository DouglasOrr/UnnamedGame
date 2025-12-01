import type * as R from "./run";
import type * as W from "./wave";

const Items = {} as Record<string, W.Item>;
const Levels = {} as Record<string, R.Level>;

// Run Logs

type RunLogEvent = { select: string } | { score: number[] };

class RunLog {
  readonly time: string = new Date().toISOString();
  readonly log: RunLogEvent[] = [];
  currentWave: W.Wave | null = null;

  constructor(readonly level: string) {}

  select(name: string): void {
    this.log.push({ select: name });
    this.currentWave = null;
  }

  score(wave: W.Wave, total: number): void {
    if (this.currentWave === wave) {
      const back = this.log[this.log.length - 1];
      if ("score" in back) {
        back.score.push(total);
        return;
      }
    }
    this.log.push({ score: [total] });
    this.currentWave = wave;
  }

  get record(): object {
    return {
      time: this.time,
      level: this.level,
      log: this.log,
    };
  }
}

const RUN_LOGS_KEY = "run_logs";

export class RunLogs {
  logs: object[] = [];

  constructor() {
    this.logs = RunLogs.load();
  }

  static load(): RunLog[] {
    const raw = localStorage.getItem(RUN_LOGS_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.warn("Failed to parse run logs", err);
    }
    return [];
  }

  save(): void {
    localStorage.setItem(RUN_LOGS_KEY, JSON.stringify(this.logs));
  }

  reset(): void {
    this.logs = [];
    this.save();
  }

  add(log: RunLog): void {
    this.logs.push(log.record);
    this.save();
  }

  // Singleton Access

  static impl: RunLogs | null = null;

  static get(): RunLogs {
    if (RunLogs.impl === null) {
      RunLogs.impl = new RunLogs();
    }
    return RunLogs.impl;
  }
}

// Achievements

export interface Achievement {
  name: string;
  title: string;
  description: string;
  check(player: PlayerStats, run: RunStats | null): boolean;
  checkOnGridScored?(wave: W.Wave, score: W.Score): boolean;
  checkOnRunEnd?(run: R.Run, outcome: R.RunOutcome): boolean;
  // Metadata
  progress?(player: PlayerStats): number; // 0-1 for progressive achievements
  todo?(player: PlayerStats): string[];
  priority?: number;
}

class RunStats {
  wavesCompleted: number = 0;
  totalScore: number = 0;
}

class PlayerStats {
  // Lifetime stats
  runsStarted: number = 0;
  runsWon: number = 0;
  runsLost: number = 0;
  wavesCompleted: number = 0;
  totalScore: number = 0;
  highestGridScore: number = 0;
  highestRunScore: number = 0;
  wavesWithFramesRemaining: number = 0;

  // Levels
  levelsWon: Record<string, number> = {};

  // Item stats
  itemsCollected: Record<string, number> = {};
  actionsUsed: Record<string, number> = {};
  patternsMatched: Record<string, number> = {};

  countItems(): number {
    return Object.keys(this.itemsCollected).reduce(
      (acc, item) => acc + +(item in Items),
      0
    );
  }
  countItemsOfFreq(freq: string): number {
    return Object.entries(this.itemsCollected).reduce(
      (acc, [item, count]) => acc + count * +(Items[item]?.freq === freq),
      0
    );
  }
  countMatchedPatterns(): number {
    return Object.keys(this.patternsMatched).reduce(
      (acc, item) => acc + +(Items[item]?.kind === "pattern"),
      0
    );
  }
  countUsedActions(): number {
    return Object.values(this.actionsUsed).reduce(
      (acc, count) => acc + +(count > 0),
      0
    );
  }
  countLevelsWon(): number {
    return Object.entries(this.levelsWon).filter(([_, count]) => count > 0)
      .length;
  }
}

function totalOfKind(kind: string): number {
  return Object.values(Items).filter((item) => item.kind === kind).length;
}

// Achievement Definitions

export const Achievements: Record<string, Achievement> = {};

let nextPriority = 0;
function register(achievement: Achievement) {
  achievement.priority = nextPriority++;
  Achievements[achievement.name] = achievement;
}
register({
  name: "first_wave",
  title: "First Steps",
  description: "Complete your first wave",
  check: (_, run) => run !== null && run.wavesCompleted >= 1,
});
register({
  name: "first_win",
  title: "Nat-ural",
  description: "Win your first run",
  check: (player) => player.runsWon >= 1,
});
register({
  name: "waves_10",
  title: "Wave Rider",
  description: "Complete 10 waves, total",
  check: (player) => player.wavesCompleted >= 10,
  progress: (player) => Math.min(1, player.wavesCompleted / 10),
});
register({
  name: "waves_50",
  title: "Seasoned",
  description: "Complete 50 waves, total",
  check: (player) => player.wavesCompleted >= 50,
  progress: (player) => Math.min(1, player.wavesCompleted / 50),
});
register({
  name: "wins_5",
  title: "Champion",
  description: "Win 5 runs",
  check: (player) => player.runsWon >= 5,
  progress: (player) => Math.min(1, player.runsWon / 5),
});
register({
  name: "all_levels",
  title: "Completionist",
  description: "Win every level",
  check: (player) => player.countLevelsWon() >= Object.keys(Levels).length,
  progress: (player) =>
    Math.min(1, player.countLevelsWon() / Object.keys(Levels).length),
  todo: (player) => {
    const missing: string[] = [];
    for (const levelName of Object.keys(Levels)) {
      if (!(levelName in player.levelsWon)) {
        missing.push(Levels[levelName].title);
      }
    }
    return missing;
  },
});

// Score
register({
  name: "score_500",
  title: "High Scorer",
  description: "Subtract 500+ nnats with a single grid",
  check: (player) => player.highestGridScore >= 500,
  progress: (player) => Math.min(1, player.highestGridScore / 500),
});
register({
  name: "score_1000",
  title: "Master Scorer",
  description: "Subtract 1000+ nnats with a single grid",
  check: (player) => player.highestGridScore >= 1000,
  progress: (player) => Math.min(1, player.highestGridScore / 1000),
});
register({
  name: "run_score_10000",
  title: "Prolific",
  description: "Subtract 10,000+ nnats total in a single run",
  check: (player) => player.highestRunScore >= 10000,
  progress: (player) => Math.min(1, player.highestRunScore / 10000),
});
register({
  name: "lifetime_score_100000",
  title: "Entropy Hunter",
  description: "Subtract 100,000+ nnats total",
  check: (player) => player.totalScore >= 100000,
  progress: (player) => Math.min(1, player.totalScore / 100000),
});

// Items
register({
  name: "collect_rare",
  title: "Rare Collector",
  description: "Collect 10 different rare items",
  check: (player) => player.countItemsOfFreq("rare") >= 10,
  progress: (player) => Math.min(1, player.countItemsOfFreq("rare") / 10),
});
register({
  name: "collect_all",
  title: "Catch 'em All",
  description: "Collect all items",
  check: (player) => player.countItems() >= Object.keys(Items).length,
  progress: (player) =>
    Math.min(1, player.countItems() / Object.keys(Items).length),
  todo: (player) => {
    const missing: string[] = [];
    for (const item of Object.keys(Items)) {
      if (!(item in player.itemsCollected)) {
        missing.push(Items[item].title);
      }
    }
    return missing;
  },
});
register({
  name: "match_all",
  title: "Match 'em All",
  description: "Match every pattern at least once",
  check: (player) => player.countMatchedPatterns() >= totalOfKind("pattern"),
  progress: (player) =>
    Math.min(1, player.countMatchedPatterns() / totalOfKind("pattern")),
  todo: (player) => {
    const missing: string[] = [];
    for (const item of Object.keys(Items)) {
      if (Items[item].kind === "pattern" && !(item in player.patternsMatched)) {
        missing.push(Items[item].title);
      }
    }
    return missing;
  },
});
register({
  name: "use_all",
  title: "Use 'em All",
  description: "Use every action at least once",
  check: (player) => player.countUsedActions() >= totalOfKind("action"),
  progress: (player) =>
    Math.min(1, player.countUsedActions() / totalOfKind("action")),
  todo: (player) => {
    const missing: string[] = [];
    for (const item of Object.keys(Items)) {
      if (Items[item].kind === "action" && !(item in player.actionsUsed)) {
        missing.push(Items[item].title);
      }
    }
    return missing;
  },
});

// Special
register({
  name: "one_group",
  title: "One Group to Rule Them All",
  description: "Score a grid with everything connected in a single group",
  check: () => false,
  checkOnGridScored: (_, score) => score.components.length === 1,
});
register({
  name: "match_3",
  title: "Triple Threat",
  description: "Match 3 different patterns with a single grid",
  check: () => false,
  checkOnGridScored: (_, score) => {
    for (const component of score.components) {
      const uniquePatterns = new Set(
        component.matches.map((match) => match.pattern.name)
      );
      if (uniquePatterns.size >= 3) {
        return true;
      }
    }
    return false;
  },
});
register({
  name: "5_groups",
  title: "Group Effort",
  description: "Score a grid with patterns in 5 distinct groups",
  check: () => false,
  checkOnGridScored: (_, score) =>
    score.components.filter((c) => c.matches.length > 0).length >= 5,
});
register({
  name: "mvp",
  title: "Minimum Viable Pattern",
  description: "Win a run holding just one pattern",
  check: () => false,
  checkOnRunEnd: (run, outcome) => {
    return (
      outcome.result === "win" &&
      run.items.filter((item) => item.kind === "pattern").length === 1
    );
  },
});
register({
  name: "safe_20",
  title: "Playing it safe",
  description: "Defeat 20 waves with grids to spare",
  check: (player) => player.wavesWithFramesRemaining >= 20,
  progress: (player) => Math.min(1, player.wavesWithFramesRemaining / 20),
});

// Achievement Tracker Singleton

const PLAYER_STATS_KEY = "player_stats";
const UNLOCKS_KEY = "unlocked_achievements";

export type AchievementState = {
  achievement: Achievement;
  unlock: number | null;
};

export class AchievementTracker {
  private playerStats: PlayerStats = new PlayerStats();
  private unlocks: Record<string, number> = {};
  private runStats: RunStats | null = null;
  private currentRunLog: RunLog | null = null;
  onUnlock: ((achievement: AchievementState) => void) | null = null;

  constructor() {
    this.load();
  }

  // General

  private load(): void {
    const playerStats = localStorage.getItem(PLAYER_STATS_KEY);
    if (playerStats) {
      Object.assign(this.playerStats, JSON.parse(playerStats));
    }
    const unlocks = localStorage.getItem(UNLOCKS_KEY);
    if (unlocks) {
      this.unlocks = JSON.parse(unlocks);
    }
  }

  private save(): void {
    localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(this.playerStats));
    localStorage.setItem(UNLOCKS_KEY, JSON.stringify(this.unlocks));
  }

  private unlockAchievement(achievement: Achievement): void {
    if (!(achievement.name in this.unlocks)) {
      this.unlocks[achievement.name] = Date.now();
      if (this.onUnlock) {
        this.onUnlock({ achievement, unlock: this.unlocks[achievement.name] });
      }
    }
  }

  private checkAchievements(): void {
    for (const achievement of Object.values(Achievements)) {
      if (achievement.check(this.playerStats, this.runStats)) {
        this.unlockAchievement(achievement);
      }
    }
    this.save();
  }

  reset(): void {
    this.playerStats = new PlayerStats();
    this.unlocks = {};
    this.save();
  }

  // Event Hooks

  onRunStart(run: R.Run): void {
    this.runStats = new RunStats();
    this.playerStats.runsStarted++;
    this.currentRunLog = new RunLog(run.level);
  }

  onRunEnd(run: R.Run, outcome: R.RunOutcome): void {
    this.playerStats.runsWon += +(outcome.result === "win");
    this.playerStats.runsLost += +(outcome.result === "lose");
    if (outcome.result === "win") {
      this.playerStats.levelsWon[run.level] =
        (this.playerStats.levelsWon[run.level] || 0) + 1;
    }
    this.checkAchievements();
    this.runStats = null;
    if (this.currentRunLog) {
      RunLogs.get().add(this.currentRunLog);
      this.currentRunLog = null;
    }
  }

  onGridScored(wave: W.Wave, score: W.Score): void {
    const total = score.total;
    if (this.runStats) {
      this.runStats.totalScore += total;
    }
    this.playerStats.totalScore += total;
    this.playerStats.highestGridScore = Math.max(
      this.playerStats.highestGridScore,
      total
    );
    this.playerStats.highestRunScore = Math.max(
      this.playerStats.highestRunScore,
      this.runStats?.totalScore ?? 0
    );
    for (const component of score.components) {
      for (const match of component.matches) {
        this.playerStats.patternsMatched[match.pattern.name] =
          (this.playerStats.patternsMatched[match.pattern.name] || 0) + 1;
      }
    }
    for (const action of wave.usedActions) {
      this.playerStats.actionsUsed[action.name] =
        (this.playerStats.actionsUsed[action.name] || 0) + 1;
    }

    if (this.currentRunLog) {
      this.currentRunLog.score(wave, total);
    }

    // Check
    for (const achievement of Object.values(Achievements)) {
      if (
        achievement.checkOnGridScored &&
        achievement.checkOnGridScored(wave, score)
      ) {
        this.unlockAchievement(achievement);
      }
    }
    this.checkAchievements();
  }

  onWaveComplete(wave: W.Wave): void {
    if (this.runStats) {
      this.runStats.wavesCompleted++;
    }
    this.playerStats.wavesCompleted++;
    this.playerStats.wavesWithFramesRemaining += +(
      wave.status === "win" && wave.framesRemaining > 0
    );
    this.checkAchievements();
  }

  onItemCollected(item: W.Item): void {
    if (this.currentRunLog) {
      this.currentRunLog.select(item.name);
    }
    this.playerStats.itemsCollected[item.name] =
      (this.playerStats.itemsCollected[item.name] || 0) + 1;
    this.checkAchievements();
  }

  // Query

  stats(): PlayerStats {
    return this.playerStats;
  }

  list(): AchievementState[] {
    const result: AchievementState[] = [];
    for (const achievement of Object.values(Achievements)) {
      result.push({
        achievement,
        unlock: this.unlocks[achievement.name] || null,
      });
    }
    return result;
  }

  // Singleton Access

  static impl: AchievementTracker | null = null;

  static get(): AchievementTracker {
    if (AchievementTracker.impl === null) {
      AchievementTracker.impl = new AchievementTracker();
    }
    return AchievementTracker.impl;
  }
}

export function setItemsAndLevels(
  items: Record<string, W.Item>,
  levels: Record<string, R.Level>
): void {
  Object.assign(Items, items);
  Object.assign(Levels, levels);
}
