import Phaser from "phaser";
import * as player from "./player";
import * as objects from "./objects";
import * as unitai from "./unitai";
import * as economy from "./economy";

// Fast forward into the future & try to discover the time of closest approach
function getClosestApproachTime(src: objects.Celestial, dest: objects.Celestial,
    interval: number, limit: number) {
    if ((src.orbit !== undefined && src.orbit.center.orbit !== undefined) ||
        (dest.orbit !== undefined && dest.orbit.center.orbit !== undefined)) {
        console.warn("Cannot forecast 'double orbits'");
        return limit;
    }
    let closestDistanceSq = Phaser.Math.Distance.BetweenPointsSquared(
        src.unit.position, dest.unit.position);
    let closestTime = 0;
    const srcPos = new Phaser.Math.Vector2();
    const destPos = new Phaser.Math.Vector2();
    for (let t = interval; t <= limit; t += interval) {
        const distanceSq = Phaser.Math.Distance.BetweenPointsSquared(
            src.futurePosition(t, srcPos), dest.futurePosition(t, destPos));
        if (distanceSq < closestDistanceSq) {
            closestTime = t;
            closestDistanceSq = distanceSq;
        }
    }
    return closestTime;
}

function closest(center: Phaser.Math.Vector2, ships: objects.Ship[], out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    let closest: objects.Ship;
    let closestDistanceSq = Infinity;
    for (let i = 0; i < ships.length; ++i) {
        const distanceSq = Phaser.Math.Distance.BetweenPointsSquared(
            center, ships[i].unit.position);
        if (distanceSq < closestDistanceSq) {
            closest = ships[i];
            closestDistanceSq = distanceSq;
        }
    }
    return out.copy(closest.unit.position);
}

function countInRadius(center: Phaser.Math.Vector2, radius: number, ships: objects.Ship[]): integer {
    let count = 0;
    for (let i = 0; i < ships.length; ++i) {
        const distanceSq = Phaser.Math.Distance.BetweenPointsSquared(
            center, ships[i].unit.position);
        count += +(distanceSq < radius * radius);
    }
    return count;
}

function getPointAtDistance(position: Phaser.Math.Vector2, target: Phaser.Math.Vector2,
    targetDistance: number, out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const currentDistance = Phaser.Math.Distance.BetweenPoints(position, target);
    return out.copy(target)
        .subtract(position)
        .scale((currentDistance - targetDistance) / currentDistance)
        .add(position);
}

export enum Difficulty {
    Easy,
    Medium,
    Hard,
}

enum PlanType {
    Wait,
    Invade,
}

interface Plan {
    type: PlanType;
    time?: integer;
    target?: objects.Celestial;
}

enum ActionType {
    Move,
    Group,
    Attack,
    Retreat,
}

interface Action {
    type: ActionType,
    patrol: Phaser.Math.Vector2,
    orbit: objects.Celestial,
}

enum Mode {
    Default,
    Flee,
}

export class PlayerAI {
    scene: Phaser.Scene;
    player: player.ActivePlayer;
    celestials: objects.Celestial[];
    opponentHome: objects.Celestial;
    difficulty: Difficulty;
    debug: boolean;

    // State
    plan: Plan;
    mode: Mode;
    impatience: number;
    action: Action;

    constructor(scene: Phaser.Scene, player: player.ActivePlayer, celestials: objects.Celestial[],
        difficulty: Difficulty, debug: boolean) {
        this.scene = scene;
        this.player = player;
        this.celestials = celestials;
        this.opponentHome = celestials.find(c => c.unit.player === unitai.PlayerId.Player);
        this.difficulty = difficulty;
        this.debug = debug;

        this.plan = {type: PlanType.Wait, time: 0, target: undefined};
        this.mode = Mode.Default;
        this.impatience = 0;
        this.action = {
            type: ActionType.Move,
            patrol: new Phaser.Math.Vector2,
            orbit: this.player.home,
        };
        this.replan(0);
    }
    updateDebug(time: integer): void {
        let planStr: string;
        if (this.plan.type === PlanType.Wait) {
            planStr = `Wait(${(this.plan.time - time).toFixed(0)}s)`
        } else {
            planStr = `Invade(${unitai.PlayerId[this.plan.target.unit.player]})`
        }
        let actionStr: string;
        if (this.action.type === ActionType.Move) {
            actionStr = `Move(${unitai.PlayerId[this.action.orbit.unit.player]})`
        } else {
            const v = this.action.patrol;
            actionStr = `${ActionType[this.action.type]}(${v.x.toFixed(0)}, ${v.y.toFixed(0)})`
        }
        const spending = 100 * this.player.account.spending;
        this.scene.events.emit("aidebugtext", [
            `${Difficulty[this.difficulty]}(${this.player.account.bonus.toFixed(2)})`,
            planStr,
            `${Mode[this.mode]}(${this.impatience.toFixed(0)}s)`,
            `${actionStr}/${spending.toFixed(0)}%`,
        ]);
    }
    replan(time: integer): void {
        this.plan.type = PlanType.Wait;

        const RandomTimingProbability = 0.5;
        const MinTime = 30;
        const MaxTime = 5 * 60;
        const approachTime = getClosestApproachTime(this.player.home, this.opponentHome, 30, MaxTime);
        if (Math.random() < RandomTimingProbability || approachTime === 0 || approachTime === MaxTime) {
            this.plan.time = time + Phaser.Math.Between(MinTime, MaxTime);
        } else {
            this.plan.time = time + Phaser.Math.Clamp(approachTime, MinTime, MaxTime);
        }
        // Note: should plan to attack neutrals too
        this.plan.target = this.opponentHome;
    }
    updatePlan(time: integer): void {
        if (this.plan.type === PlanType.Wait && this.plan.time < time) {
            this.plan.type = PlanType.Invade;
            // Note: this doesn't seem very principled - just attack for N minutes before replanning
            this.plan.time = time + 3*60;
        }
        if (this.plan.type === PlanType.Invade && this.plan.time < time) {
            this.replan(time);
        }
    }
    updateEconomy(time: integer, nships: integer): void {
        if (this.difficulty === Difficulty.Easy) {
            // This is a bad strategy - economy grows early on, but saturates
            // although we keep wasting money on investment
            this.player.account.spending = 0.5;
        } else if (this.difficulty === Difficulty.Medium) {
            if (nships < 8) {
                // Fleet too small
                this.player.account.spending = 1;
            } else {
                // Invest with a fixed horizon (needs to pay off in N minutes)
                const breakEvenTime = economy.breakEvenTime(
                    this.player.account.futureCapital(), this.player.account.bonus);
                this.player.account.spending = (breakEvenTime <= 3 * 60) ? 0 : 1;
            }
        } else { // Difficulty.Hard
            if (this.plan.type === PlanType.Invade || nships < 5) {
                // Invade / fleet too small => keep producing ships
                this.player.account.spending = 1;
            } else {
                // Calculate the break-even time for the invasion
                const timeToInvade = this.plan.time - time;
                const breakEven = economy.breakEvenTime(
                    this.player.account.futureCapital(), this.player.account.bonus);
                this.player.account.spending = breakEven < timeToInvade ? 0 : 1;
            }
        }
    }
    updateShipCommand(friendlies: objects.Ship[], enemies: objects.Ship[]): void {
        if (friendlies.length === 0) {
            return; // No ships to command
        }

        // Elect a leader - who has the most friendly ships within radius
        let leader: objects.Ship;
        let leaderCount = -1;
        for (let i = 0; i < friendlies.length; ++i) {
            const count = countInRadius(friendlies[i].unit.position, 150, friendlies);
            if (count > leaderCount) {
                leader = friendlies[i];
                leaderCount = count;
            }
        }
        // Debugging utility
        // myShips.forEach(ship => ship.select(false));
        // leader.select(true);

        const invasionThreshold = objects.conquerRadius(this.player.home.unit);
        const defenseThreshold = invasionThreshold + objects.LazerRange;
        const isDefending = Phaser.Math.Distance.BetweenPointsSquared(
            leader.unit.position, this.player.home.unit.position) < defenseThreshold * defenseThreshold;

        // FLEE
        const ImpatienceThreshold = 30; // s
        if (isDefending) {
            this.mode = Mode.Default;
            this.impatience = 0;
        }
        if (this.impatience > ImpatienceThreshold) {
            this.mode = Mode.Flee;
        }
        if (this.mode === Mode.Flee) {
            this.action.type = ActionType.Move;
            this.action.orbit = this.player.home;
            return;
        }

        // DEFEND
        const invaders = countInRadius(this.player.home.unit.position, invasionThreshold, enemies);
        if (!isDefending && invaders >= 1) {
            this.action.type = ActionType.Move;
            this.action.orbit = this.player.home;
            return;
        }

        const NearbyThreshold = objects.ShipVisionRange + 200;
        const nearbyEnemies = countInRadius(leader.unit.position, NearbyThreshold, enemies);
        const nearbyFriendlies = countInRadius(leader.unit.position, NearbyThreshold, friendlies);

        // RETREAT
        if (nearbyFriendlies * 1.5 < nearbyEnemies) {
            this.action.type = ActionType.Retreat;
            const closestEnemy = closest(leader.unit.position, enemies, this.action.patrol);
            this.action.patrol = getPointAtDistance(
                leader.unit.position, closestEnemy, objects.LazerRange * 1.2, closestEnemy);
            return;
        }

        // ATTACK
        if (3 <= nearbyEnemies ||
            (1 <= nearbyEnemies && this.plan.type === PlanType.Wait)) {
            this.action.type = ActionType.Attack;
            const closestEnemy = closest(leader.unit.position, enemies, this.action.patrol);
            // Hard has better micro - attacking from longer range
            const targetRange = (this.difficulty === Difficulty.Hard) ? 0.8 :
                ((this.difficulty === Difficulty.Medium) ? 0.65 : 0.4);
            this.action.patrol = getPointAtDistance(
                leader.unit.position, closestEnemy, targetRange * objects.LazerRange, closestEnemy);
            return;
        }

        // GROUP
        const grouped = 0.75 <= leaderCount / friendlies.length;
        const objective = (this.plan.type === PlanType.Wait) ? this.player.home : this.plan.target;
        const distanceToObjective = Phaser.Math.Distance.BetweenPoints(
            leader.unit.position, objective);
        if (this.action.type === ActionType.Group && !grouped) {
            // Already grouping - keep the current group command
            return;
        }
        if (this.action.type !== ActionType.Group && !grouped && 600 < distanceToObjective) {
            // Start grouping
            this.action.type = ActionType.Group;
            this.action.patrol.copy(objective.unit.position)
                .subtract(leader.unit.position)
                .scale(300/distanceToObjective)
                .add(leader.unit.position);
            return;
        }

        // MOVE
        this.action.type = ActionType.Move;
        this.action.orbit = objective;
    }
    updateImpatience(dt: number): void {
        if (this.action.type === ActionType.Retreat) {
            this.impatience += dt;
        } else {
            this.impatience = Math.max(0, this.impatience - dt);
        }
    }
    update(time: integer, dt: number, friendlies: objects.Ship[], enemies: objects.Ship[]): void {
        this.updatePlan(time);
        this.updateEconomy(time, friendlies.length);
        this.updateShipCommand(friendlies, enemies);
        this.updateImpatience(dt);
        if (this.debug) {
            this.updateDebug(time);
        }
        // Execute the chosen command
        friendlies.forEach(ship => {
            if (this.action.type === ActionType.Move) {
                ship.commander.orbit(this.action.orbit.unit);
            } else {
                ship.commander.patrol(this.action.patrol.x, this.action.patrol.y);
            }
        });
    }
}
