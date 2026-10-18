import type {Progress, Seconds} from "./types.js";
import {solveMonotone} from "./utils.js";

/** The closed-form motion of one damping regime, as the signed distance from the target. */
interface SpringMotion {
    displacementAt(time: Seconds): number;
    velocityAt(time: Seconds): number;
    /** The first time after `after` at which the velocity is 0, if there's one. */
    nextTurningTime(after: Seconds): Seconds | undefined;
}

const startDisplacement = -1;

/** Swings around the target with a shrinking amplitude. */
class UnderdampedMotion implements SpringMotion {
    private readonly decayRate: number;
    private readonly frequency: number;
    private readonly cosineAmount: number;
    private readonly sineAmount: number;
    /** The velocity is proportional to `cos(frequency·t + velocityPhase)`. */
    private readonly velocityPhase: number;

    constructor(naturalFrequency: number, dampingRatio: number, initialVelocity: number) {
        this.decayRate = dampingRatio * naturalFrequency;
        this.frequency = naturalFrequency * Math.sqrt(1 - dampingRatio * dampingRatio);
        this.cosineAmount = startDisplacement;
        this.sineAmount = (initialVelocity + this.decayRate * startDisplacement) / this.frequency;
        this.velocityPhase = Math.atan2(this.velocitySineAmount(), this.velocityCosineAmount());
    }

    displacementAt(time: Seconds): number {
        const angle = this.frequency * time;
        return Math.exp(-this.decayRate * time) * (this.cosineAmount * Math.cos(angle) + this.sineAmount * Math.sin(angle));
    }

    velocityAt(time: Seconds): number {
        const angle = this.frequency * time;
        return Math.exp(-this.decayRate * time) * (this.velocityCosineAmount() * Math.cos(angle) - this.velocitySineAmount() * Math.sin(angle));
    }

    nextTurningTime(after: Seconds): Seconds {
        const halfPeriod = Math.PI / this.frequency;
        const turnsBefore = Math.floor((this.frequency * after + this.velocityPhase - Math.PI / 2) / Math.PI);
        let time = (Math.PI / 2 - this.velocityPhase + (turnsBefore + 1) * Math.PI) / this.frequency;
        while (time <= after + halfPeriod * 1e-9) time += halfPeriod;
        return time;
    }

    private velocityCosineAmount(): number {
        return this.sineAmount * this.frequency - this.decayRate * this.cosineAmount;
    }

    private velocitySineAmount(): number {
        return this.cosineAmount * this.frequency + this.decayRate * this.sineAmount;
    }
}

/** The fastest approach that doesn't swing past the target, unless pushed. */
class CriticallyDampedMotion implements SpringMotion {
    private readonly linearAmount: number;

    constructor(private readonly naturalFrequency: number, initialVelocity: number) {
        this.linearAmount = initialVelocity + naturalFrequency * startDisplacement;
    }

    displacementAt(time: Seconds): number {
        return Math.exp(-this.naturalFrequency * time) * (startDisplacement + this.linearAmount * time);
    }

    velocityAt(time: Seconds): number {
        const displacementFactor = startDisplacement + this.linearAmount * time;
        return Math.exp(-this.naturalFrequency * time) * (this.linearAmount - this.naturalFrequency * displacementFactor);
    }

    nextTurningTime(after: Seconds): Seconds | undefined {
        if (this.linearAmount === 0) return undefined;
        const time = (this.linearAmount - this.naturalFrequency * startDisplacement) / (this.naturalFrequency * this.linearAmount);
        return time > after ? time : undefined;
    }
}

/** Creeps towards the target as the sum of a slow and a fast decay. */
class OverdampedMotion implements SpringMotion {
    private readonly slowRate: number;
    private readonly fastRate: number;
    private readonly slowAmount: number;
    private readonly fastAmount: number;
    /** How soon after `after` a turning time is only rounding noise, a billionth of the motion's time scale. */
    private readonly negligibleTime: Seconds;

    constructor(naturalFrequency: number, dampingRatio: number, initialVelocity: number) {
        this.negligibleTime = 1e-9 / naturalFrequency;
        const spread = naturalFrequency * Math.sqrt(dampingRatio * dampingRatio - 1);
        this.slowRate = -dampingRatio * naturalFrequency + spread;
        this.fastRate = -dampingRatio * naturalFrequency - spread;
        this.slowAmount = (initialVelocity - this.fastRate * startDisplacement) / (this.slowRate - this.fastRate);
        this.fastAmount = startDisplacement - this.slowAmount;
    }

    displacementAt(time: Seconds): number {
        return this.slowAmount * Math.exp(this.slowRate * time) + this.fastAmount * Math.exp(this.fastRate * time);
    }

    velocityAt(time: Seconds): number {
        return this.slowAmount * this.slowRate * Math.exp(this.slowRate * time) + this.fastAmount * this.fastRate * Math.exp(this.fastRate * time);
    }

    nextTurningTime(after: Seconds): Seconds | undefined {
        const ratio = -(this.fastAmount * this.fastRate) / (this.slowAmount * this.slowRate);
        if (!(ratio > 0)) return undefined;
        const time = Math.log(ratio) / (this.slowRate - this.fastRate);
        return time > after + this.negligibleTime ? time : undefined;
    }
}

/** A mass on a damped spring that starts at progress 0 and is pulled towards 1, in closed form throughout. */
export class DampedSpring {
    private readonly motion: SpringMotion;

    constructor(
        readonly naturalFrequency: number,
        readonly dampingRatio: number,
        readonly initialVelocity: number = 0
    ) {
        if (!(naturalFrequency > 0 && Number.isFinite(naturalFrequency)))
            throw new RangeError(`A spring's natural frequency must be positive, not ${naturalFrequency}.`);
        if (!(dampingRatio > 0 && Number.isFinite(dampingRatio)))
            throw new RangeError(`A spring needs a positive damping ratio to come to rest, not ${dampingRatio}.`);

        this.motion = dampingRatio < 1 ? new UnderdampedMotion(naturalFrequency, dampingRatio, initialVelocity)
            : dampingRatio === 1 ? new CriticallyDampedMotion(naturalFrequency, initialVelocity)
            : new OverdampedMotion(naturalFrequency, dampingRatio, initialVelocity);
    }

    /** From stiffness, damping and mass, as in `m·x″ = −k·x − c·x′`. */
    static physical(stiffness: number, damping: number, mass: number, initialVelocity: number): DampedSpring {
        return new DampedSpring(Math.sqrt(stiffness / mass), damping / (2 * Math.sqrt(stiffness * mass)), initialVelocity);
    }

    positionAt(time: Seconds): Progress {
        return 1 + this.motion.displacementAt(time);
    }

    velocityAt(time: Seconds): number {
        return this.motion.velocityAt(time);
    }

    /** From the equation of motion, `x″ = −ω₀²·x − 2ζω₀·x′`. */
    accelerationAt(time: Seconds): number {
        const {naturalFrequency, dampingRatio} = this;
        return -naturalFrequency * naturalFrequency * this.motion.displacementAt(time)
            - 2 * dampingRatio * naturalFrequency * this.motion.velocityAt(time);
    }

    /** The times after 0 at which the velocity is 0, before `until`, in order. */
    turningTimes(until: Seconds): Seconds[] {
        const times: Seconds[] = [];
        for (let time = this.motion.nextTurningTime(0); time !== undefined && time < until; time = this.motion.nextTurningTime(time))
            times.push(time);
        return times;
    }

    /** When the spring comes within `restDelta` of its target for good. */
    restTime(restDelta: Progress): Seconds {
        const displacementAt = (time: Seconds) => this.motion.displacementAt(time);
        if (Math.abs(displacementAt(0)) <= restDelta) return 0;

        // Between turning times the spring only moves one way, so it enters the rest band once, after the last swing that leaves it.
        let lastSwingOut: Seconds = 0;
        let next = this.motion.nextTurningTime(lastSwingOut);
        while (next !== undefined && Math.abs(displacementAt(next)) > restDelta) {
            lastSwingOut = next;
            next = this.motion.nextTurningTime(lastSwingOut);
        }

        let settled = next;
        if (settled === undefined) {
            let reach = Math.PI / this.naturalFrequency;
            while (Math.abs(displacementAt(lastSwingOut + reach)) > restDelta) reach *= 2;
            settled = lastSwingOut + reach;
        }
        const bandEdge = Math.sign(displacementAt(lastSwingOut)) * restDelta;
        return solveMonotone(displacementAt, time => this.motion.velocityAt(time), bandEdge, lastSwingOut, settled);
    }
}
