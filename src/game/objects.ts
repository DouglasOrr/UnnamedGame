import Phaser from "phaser";
import * as unitai from "./unitai";

type Body = Phaser.Physics.Arcade.Body;

// General
const ShipScale = 0.5;
const PlayerColors = [0x008888, 0xff8888, 0x888888, 0xcccccc];
const GravityPerRadius = 0.05;  // (au/s)/au
const ConquerTime = 60; // s
const ConquerDefenders = 5; // i.e. conquering happens when this many friendlies are around

// Weapons
const LazerRecharge = 1.0; // s
const LazerDamage = 1/20; // (20 shots to kill)
export const LazerRange = 400; // au
const LazerTime = 0.1; // s

// Visibility
export const ShipVisionRange = 700;
export const CelestialVisionRange = 1000;
export enum Depth {
    // Objects on top by default, so start the enum low!
    Glow = -20,
    ShipCommandLine,
    ShipLazerLine,
    Celestial,
    ConquerIndicator,
    OtherShip,
    Fog,
    PlayerShip,
}

export function conquerRadius(celestial: unitai.Celestial): number {
    return unitai.orbitalRadius(celestial.radius) + unitai.OrbitThresholdOffset
}

// Ship

const ShipSpriteRotation = 45;  // degrees - to rotate body to lay out sprite

export class Ship extends Phaser.GameObjects.Sprite {
    unit: unitai.Ship;
    selected: boolean;
    health: number;
    charge: number;
    visibleToPlayer: boolean;
    visibleToEnemy: boolean;
    commander: unitai.Commander;
    vision: Phaser.GameObjects.Arc;
    glow: Phaser.GameObjects.Sprite;
    celestials: Celestial[];

    constructor(scene: Phaser.Scene, celestials: Celestial[]) {
        super(scene, 0, 0, "ship");
        scene.physics.add.existing(this);
        this.setScale(ShipScale, ShipScale);
        // Set dummy initial state
        this.unit = {
            position: undefined,
            velocity: undefined,
            rotation: undefined,
            player: undefined
        };
        this.selected = undefined;
        this.health = undefined;
        this.charge = undefined;
        this.commander = new unitai.Commander(this.unit, celestials.map(c => c.unit));
        // Don't add `vision` to the scene - it's used for a separate render-to-texture
        this.vision = new Phaser.GameObjects.Arc(scene, 0, 0, ShipVisionRange, 0, 360, false, 0x000000);
        this.glow = scene.add.sprite(0, 0, "ship")
            .setFrame(2)
            .setDepth(Depth.Glow)
            .setAlpha(0.35)
            .setScale(3);
        this.celestials = celestials;
        // Make sure we're initially inactive (need to call setup())
        this.kill();
    }
    setup(x: number, y: number, rotation: number, player: unitai.PlayerId): void {
        // Set core state
        const body = <Body>this.body;
        this.unit.position = body.position;
        this.unit.velocity = body.velocity;
        this.unit.rotation = Phaser.Math.DEG_TO_RAD * (body.rotation - ShipSpriteRotation);
        this.unit.player = player;
        this.selected = false;
        this.health = 1;
        this.charge = 0;
        // Enable: see kill()
        this.active = true;
        this.visible = true;
        this.glow.visible = true;
        body.enable = true;
        // Set initial state
        body.reset(x, y);
        this.glow.setPosition(x, y);
        body.rotation = Phaser.Math.RAD_TO_DEG * rotation + ShipSpriteRotation;
        this.commander.patrol(x, y);
        this.updateTint();
        this.setDepth(player === unitai.PlayerId.Player ? Depth.PlayerShip : Depth.OtherShip);
        this.setFrame(0);
    }
    kill(): void {
        const body = (<Body>this.body);
        // Even though we'll be disabled, we can still participate in hit tests,
        // so set a default position
        body.reset(0, 0);
        // Disable: see setup()
        this.active = false;
        this.visible = false;
        this.glow.visible = false;
        body.enable = false;
    }
    select(selected: boolean): void {
        this.selected = selected;
        this.updateTint();
    }
    updateTint(): void {
        this.glow.setTint(this.selected ? 0xffff00 : PlayerColors[this.unit.player]);
    }
    syncBackgroundPosition(): void {
        this.glow.x = this.x;
        this.glow.y = this.y;
    }
    update(dt: number, fog: boolean): void {
        const body = <Body>this.body;
        this.unit.rotation = Phaser.Math.DEG_TO_RAD * (body.rotation - ShipSpriteRotation);

        // Controller
        this.commander.step(dt);

        // Physics from controller
        body.angularVelocity = Phaser.Math.RAD_TO_DEG * this.commander.rotationRate;
        body.acceleration.set(
            this.commander.thrust * Math.cos(this.unit.rotation),
            this.commander.thrust * Math.sin(this.unit.rotation)
        );

        // Physics from gravity
        this.celestials.forEach((celestial) => {
            const distance = Phaser.Math.Distance.Between(body.x, body.y, celestial.x, celestial.y);
            const gravity = (
                ((GravityPerRadius * celestial.unit.radius) ** 2)
                / Math.max(distance, celestial.unit.radius)
            );
            body.acceleration.x += (celestial.x - body.x) * gravity / distance;
            body.acceleration.y += (celestial.y - body.y) * gravity / distance;
        });

        // Weapon
        this.charge += dt;
        if (this.charge >= LazerRecharge) {
            this.fireWeapon();
        }

        // Visibility
        this.updateVisible();
        this.visible = !fog || this.visibleToPlayer;
        this.glow.visible = this.visible;

        // Animation
        this.setFrame(0.5 <= this.commander.thrust ? 1 : 0);
    }
    updateVisible(): void {
        this.visibleToPlayer = (this.unit.player === unitai.PlayerId.Player);
        this.visibleToEnemy = (this.unit.player === unitai.PlayerId.Enemy);
        for (let i = 0; i < this.celestials.length; ++i) {
            const celestial = this.celestials[i];
            const threshold = celestial.unit.radius + CelestialVisionRange;
            if (celestial.unit.position.distanceSq(this.unit.position) < threshold * threshold) {
                this.visibleToPlayer = this.visibleToPlayer || (celestial.unit.player === unitai.PlayerId.Player);
                this.visibleToEnemy = this.visibleToEnemy || (celestial.unit.player === unitai.PlayerId.Enemy);
            }
        }
        // Rough check using overlapRect (exact check follows)
        const candidates = <Body[]>this.scene.physics.overlapRect(
            this.x - ShipVisionRange, this.y - ShipVisionRange, 2 * ShipVisionRange, 2 * ShipVisionRange
        );
        for (let i = 0; i < candidates.length; ++i) {
            if (candidates[i].enable) {
                const ship = <Ship>candidates[i].gameObject;
                if (ship.unit.position.distanceSq(this.unit.position) < ShipVisionRange * ShipVisionRange) {
                    this.visibleToPlayer = this.visibleToPlayer || (ship.unit.player === unitai.PlayerId.Player);
                    this.visibleToEnemy = this.visibleToEnemy || (ship.unit.player === unitai.PlayerId.Enemy);
                }
            }
        }
    }
    fireWeapon(): void {
        let closestEnemy: Ship = undefined;
        let closestDistanceSq: number = LazerRange * LazerRange;
        // Rough check using overlapRect (exact check follows)
        const candidates = <Body[]>this.scene.physics.overlapRect(
            this.x - LazerRange, this.y - LazerRange, 2 * LazerRange, 2 * LazerRange
        );
        candidates.forEach(body => {
            if (body.enable) {
                // We only put ships in the physics system
                const ship = <Ship>body.gameObject;
                if (ship.unit.player !== this.unit.player) {
                    const distanceSq = Phaser.Math.Distance.BetweenPointsSquared(
                        this.unit.position, ship.unit.position);
                    if (distanceSq < closestDistanceSq) {
                        closestDistanceSq = distanceSq;
                        closestEnemy = ship;
                    }
                }
            }
        });
        if (closestEnemy !== undefined) {
            this.scene.events.emit("lazerfired", this, closestEnemy);
            closestEnemy.health -= LazerDamage;
            if (closestEnemy.health <= 0) {
                this.scene.events.emit("shipdestroyed", this, closestEnemy);
                closestEnemy.kill();
            }
            this.charge = 0;
        }
    }
}

export class ShipCommandLine extends Phaser.GameObjects.Line {
    ship?: Ship;

    constructor(scene: Phaser.Scene) {
        super(scene);
        this.setOrigin(0, 0);
        this.setDepth(Depth.ShipCommandLine);
        this.isStroked = true;
        this.strokeAlpha = 0.5;
        this.unset();
    }
    unset(): void {
        this.active = false;
        this.visible = false;
        this.ship = undefined;
    }
    set(ship: Ship): void {
        this.active = true;
        this.visible = true;
        this.ship = ship;
        this.update();
    }
    update(): void {
        if (this.ship !== undefined && this.ship.active && this.ship.selected) {
            const type = this.ship.commander.commandType;
            if (type === unitai.CommandType.Patrol) {
                const dest = this.ship.commander.destination;
                this.setTo(this.ship.x, this.ship.y, dest.x, dest.y);
                this.strokeColor = 0xffffff;
            }
            if (type == unitai.CommandType.Orbit) {
                const dest = this.ship.commander.celestial;
                this.setTo(this.ship.x, this.ship.y, dest.position.x, dest.position.y);
                this.strokeColor = 0x00ff00;
            }
        } else {
            this.unset();
        }
    }
}

export class ShipLazerLine extends Phaser.GameObjects.Line {
    src?: Ship;
    dest?: Ship;
    lifetime?: number;

    constructor(scene: Phaser.Scene) {
        super(scene);
        this.setOrigin(0, 0);
        this.setDepth(Depth.ShipLazerLine);
        this.isStroked = true;
        this.strokeColor = 0xff0000;
        this.lineWidth = 2;
        this.unset();
    }
    unset(): void {
        this.active = false;
        this.visible = false;
        this.src = undefined;
        this.dest = undefined;
        this.lifetime = undefined;
    }
    set(src: Ship, dest: Ship): void {
        this.active = true;
        this.visible = true;
        this.src = src;
        this.dest = dest;
        this.lifetime = LazerTime;
        this.update(0);
    }
    update(dt: number): void {
        this.lifetime -= dt;
        if (this.src !== undefined && this.src.active && this.dest.active && 0 <= this.lifetime) {
            this.setTo(this.src.x, this.src.y, this.dest.x, this.dest.y);
        } else {
            this.unset();
        }
    }
}

export interface Orbit {
    center: Celestial,
    radius: number,
    angle: number,
    clockwise: boolean
}

export class Celestial extends Phaser.GameObjects.Sprite {
    unit: unitai.Celestial;
    orbit: Orbit;
    spawnCount: number;
    ships: Phaser.GameObjects.Group;
    conquered: number;
    conquerIndicator: Phaser.GameObjects.Graphics;
    vision: Phaser.GameObjects.Arc;
    glow: Phaser.GameObjects.Sprite;

    constructor(scene: Phaser.Scene,
                radius: number,
                location: Orbit | Phaser.Math.Vector2,
                player: unitai.PlayerId,
                spawnCount: number,
                ships: Phaser.GameObjects.Group) {
        super(scene, 0, 0, undefined);
        this.ships = ships;
        this.spawnCount = spawnCount;
        this.setDepth(Depth.Celestial);
        this.setTint(Phaser.Display.Color.ValueToColor(PlayerColors[player]).darken(10).color32);
        this.setScale(2 * radius / this.width);
        this.setPipeline("radial");

        // Background glow
        const color = Phaser.Display.Color.ValueToColor(PlayerColors[player]);
        if (color.s !== 0) {  // Phaser bug - desaturating grey gives a color!
            color.desaturate(80);
        }
        this.glow = this.scene.add.sprite(0, 0, "glow")
            .setDepth(Depth.Glow)
            .setAlpha(0.5)
            .setTint(color.color32);
        this.glow.setScale(2 * 2 * radius / this.glow.width);

        // Conquering indicator
        if (player === unitai.PlayerId.Player || player === unitai.PlayerId.Enemy) {
            const enemyColor = PlayerColors[unitai.getOpponent(player)];
            this.conquerIndicator = this.scene.add.graphics({
                fillStyle: {color: enemyColor, alpha: 0.35},
            }).setDepth(Depth.ConquerIndicator).setVisible(false);
        }

        this.unit = {
            position: new Phaser.Math.Vector2(),
            velocity: new Phaser.Math.Vector2(),
            radius: radius,
            player: player,
        };
        this.conquered = 0;
        this.vision = new Phaser.GameObjects.Arc(scene,
            0, 0, radius + CelestialVisionRange, 0, 360, false, 0x000000);
        if (location instanceof Phaser.Math.Vector2) {
            this.orbit = undefined;
            this.setPosition(location.x, location.y);
            this.glow.setPosition(location.x, location.y);
            // Constant {position, velocity}
            this.unit.position.copy(location);
            this.unit.velocity.reset();
        } else {
            this.orbit = {...location};
            this.updateOrbit(0); // Set {this.x, this.y}
        }
    }
    angularSpeed(): number {
        const direction = (1 - 2 * +this.orbit.clockwise);
        return direction * GravityPerRadius * this.orbit.center.unit.radius / this.orbit.radius;
    }
    futurePosition(dt: number, out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
        if (this.orbit === undefined) {
            return this.unit.position;
        }
        const angle = this.orbit.angle + dt * this.angularSpeed();
        const rcos = this.orbit.radius * Math.cos(angle);
        const rsin = this.orbit.radius * Math.sin(angle);
        const x = this.orbit.center.x + rcos;
        const y = this.orbit.center.y + rsin;
        return out.set(x, y);
    }
    updateOrbit(dt: number): void {
        const angularSpeed = this.angularSpeed();
        this.orbit.angle += angularSpeed * dt;
        const rcos = this.orbit.radius * Math.cos(this.orbit.angle);
        const rsin = this.orbit.radius * Math.sin(this.orbit.angle);
        this.x = this.orbit.center.x + rcos;
        this.y = this.orbit.center.y + rsin;
        this.unit.position.set(this.x, this.y);
        this.unit.velocity.set(-angularSpeed * rsin, angularSpeed * rcos);
        this.glow.x = this.x;
        this.glow.y = this.y;
    }
    update(dt: number): void {
        // Orbiting
        if (this.orbit !== undefined) {
            this.updateOrbit(dt);
        }
        // Conquering
        if (this.unit.player === unitai.PlayerId.Player || this.unit.player === unitai.PlayerId.Enemy) {
            if (this.isBeingConquered()) {
                this.updateConquered(dt);
            } else if (this.conquered > 0) {
                this.updateConquered(-dt);
            }
        }
    }
    updateConquered(delta: number): void {
        this.conquered = Phaser.Math.Clamp(this.conquered + delta, 0, ConquerTime);
        this.conquerIndicator.visible = this.conquered > 0;
        if (this.conquerIndicator.visible) {
            const radius = this.unit.radius * 0.7;
            const angle = Phaser.Math.PI2 * this.conquered / ConquerTime;
            this.conquerIndicator.clear().beginPath()
                .arc(this.x, this.y, radius, 0, angle)
                .lineTo(this.x, this.y)
                .lineTo(this.x + radius, this.y)
                .fillPath();
        }
        if (this.conquered === ConquerTime) {
            this.scene.events.emit("conquercelestial", unitai.getOpponent(this.unit.player));
        }
    }
    isBeingConquered(): boolean {
        const bodies = this.scene.physics.overlapCirc(this.x, this.y, conquerRadius(this.unit));
        let nFriendly = 0;
        for (let i = 0; i < bodies.length; ++i) {
            const ship = <Ship>bodies[i].gameObject;
            nFriendly += +(ship.unit.player === this.unit.player);
            if (nFriendly >= ConquerDefenders) {
                return false;
            }
        }
        return bodies.length > 2 * nFriendly;
    }
    spawn(): void {
        const a = Phaser.Math.PI2 * (Math.random() - .5);
        const r = unitai.orbitalRadius(this.unit.radius);
        const x = this.x + r * Math.cos(a);
        const y = this.y + r * Math.sin(a);
        const ship = <Ship>this.ships.get();
        // Initially face outwards
        ship.setup(x, y, a, this.unit.player);
        ship.commander.orbit(this.unit);
        // Slight hack - we know we're already in orbit, but don't want to randomly sample a
        // new position, so set the orbital angle manually
        ship.commander.orbitalAngle = a;
    }
}
