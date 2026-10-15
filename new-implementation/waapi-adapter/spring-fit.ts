import type {Progress, Seconds} from "../types.js";
import {invLerp, lerp} from "../utils.js";
import {progressPrecision, type SpringTransition} from "../transition.js";
import {CubicBezierEasing} from "./easing.js";
import {DampedSpring} from "./damped-spring.js";
import type {Spline} from "./transition-curve.js";

/** The spring a transition describes, and how long it runs until it's at rest. */
export function resolveSpring(transition: SpringTransition): { spring: DampedSpring; duration: Seconds } {
    const velocity = transition.velocity ?? 0;
    if ('stiffness' in transition) {
        const spring = DampedSpring.physical(transition.stiffness, transition.damping, transition.mass ?? 1, velocity);
        return {spring, duration: spring.restTime(transition.restDelta ?? progressPrecision)};
    }

    const dampingRatio = dampingRatioOfBounce(transition.bounce);
    if ('visualDuration' in transition) {
        const spring = new DampedSpring(2 * Math.PI / transition.visualDuration, dampingRatio, velocity);
        return {spring, duration: spring.restTime(progressPrecision)};
    }
    return {spring: springRestingAfter(transition.duration, dampingRatio, velocity), duration: transition.duration};
}

/** Apple's mapping: a positive bounce lowers the damping ratio from 1, and a negative one raises it past 1. */
function dampingRatioOfBounce(bounce: number): number {
    return bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
}

const maxRestingRounds = 16;

/**
 * The spring of the damping ratio that comes to rest exactly at `duration`.
 * Its rest time shrinks in proportion as its natural frequency grows, except that the velocity, in progress per second, changes meaning with it; a few rounds settle that.
 */
function springRestingAfter(duration: Seconds, dampingRatio: number, velocity: number): DampedSpring {
    const naturalFrequencyFor = (naturalFrequency: number) =>
        new DampedSpring(1, dampingRatio, velocity / naturalFrequency).restTime(progressPrecision) / duration;

    let naturalFrequency = new DampedSpring(1, dampingRatio).restTime(progressPrecision) / duration;
    for (let round = 0; round < maxRestingRounds; round++) {
        const next = naturalFrequencyFor(naturalFrequency);
        if (Math.abs(next - naturalFrequency) <= naturalFrequency * 1e-12) break;
        naturalFrequency = next;
    }
    return new DampedSpring(naturalFrequency, dampingRatio, velocity);
}

const maxSplitDepth = 12;
const errorSamples = 16;

/** A moment on the spring that a fitted segment starts or ends at; only a turning point has an `acceleration`. */
interface SpringKnot {
    time: Seconds;
    progress: Progress;
    slope: number;
    acceleration?: number;
}

/** Fits cubic Bézier segments to a spring until `endTime`, closing the gap left there to 1 after the last turning point. */
export class SpringSplineFitter {
    private readonly turningTimes: Seconds[];
    private readonly closingStart: Seconds;
    private readonly closingGap: Progress;
    private readonly spline: Spline = {0: {progress: 0}};

    private constructor(private readonly spring: DampedSpring, private readonly endTime: Seconds) {
        this.turningTimes = spring.turningTimes(endTime);
        this.closingStart = this.turningTimes.at(-1) ?? 0;
        this.closingGap = 1 - spring.positionAt(endTime);
    }

    static fit(spring: DampedSpring, endTime: Seconds): Spline {
        const fitter = new SpringSplineFitter(spring, endTime);
        const start = spring.initialVelocity === 0 ? fitter.turningKnotAt(0) : fitter.knotAt(0);
        const knots = [
            {...start, progress: 0},
            ...fitter.turningTimes.map(time => fitter.turningKnotAt(time)),
            {...fitter.knotAt(endTime), progress: 1}
        ];
        knots.slice(1).forEach((knot, index) => fitter.fitStretch(knots[index]!, knot, 0));
        return fitter.spline;
    }

    /** Halves the stretch until its easing follows the spring within `progressPrecision`. */
    private fitStretch(from: SpringKnot, to: SpringKnot, depth: number): void {
        const easing = SpringSplineFitter.easingBetween(from, to);
        if (depth < maxSplitDepth && this.errorBetween(from, to, easing) > progressPrecision) {
            const middle = this.knotAt((from.time + to.time) / 2);
            this.fitStretch(from, middle, depth + 1);
            this.fitStretch(middle, to, depth + 1);
            return;
        }
        this.spline[to.time / this.endTime] = {progress: to.progress, easing};
    }

    /** The easing from one knot to the next, in that stretch's own 0–1 units, matching the spring's slope at both ends. */
    private static easingBetween(from: SpringKnot, to: SpringKnot): CubicBezierEasing {
        const span = to.time - from.time;
        const rise = to.progress - from.progress;
        const fromHandle = SpringSplineFitter.handleLength(from, span, rise);
        const toHandle = SpringSplineFitter.handleLength(to, span, rise);
        return CubicBezierEasing.of(
            fromHandle,
            from.slope * fromHandle * span / rise,
            1 - toHandle,
            1 - to.slope * toHandle * span / rise
        );
    }

    /** A share of the span: a third, or at a turning point, where the handle is flat, the length matching the spring's curvature κ there, `√(2 / 3κ)`. */
    private static handleLength(knot: SpringKnot, span: Seconds, rise: Progress): number {
        if (knot.acceleration === undefined) return 1 / 3;
        const curvature = Math.abs(knot.acceleration) * span * span / Math.abs(rise);
        return Math.min(Math.sqrt(2 / (3 * curvature)), 1);
    }

    /** The largest gap between the easing, laid over the stretch, and the spring. */
    private errorBetween(from: SpringKnot, to: SpringKnot, easing: CubicBezierEasing): Progress {
        const {curve} = easing;
        let error = 0;
        for (let sample = 1; sample < errorSamples; sample++) {
            const parameter = sample / errorSamples;
            const time = lerp(from.time, to.time, curve.coordinateAt('x', parameter));
            const progress = lerp(from.progress, to.progress, curve.coordinateAt('y', parameter));
            error = Math.max(error, Math.abs(progress - this.progressAt(time)));
        }
        return error;
    }

    private knotAt(time: Seconds): SpringKnot {
        return {time, progress: this.progressAt(time), slope: this.slopeAt(time)};
    }

    private turningKnotAt(time: Seconds): SpringKnot {
        return {time, progress: this.progressAt(time), slope: 0, acceleration: this.spring.accelerationAt(time)};
    }

    /** The spring's progress, with the gap left at the end closed evenly after the last turning point. */
    private progressAt(time: Seconds): Progress {
        return this.spring.positionAt(time) + this.closingGap * Math.max(0, invLerp(time, this.closingStart, this.endTime));
    }

    private slopeAt(time: Seconds): number {
        const closingSlope = time > this.closingStart ? this.closingGap / (this.endTime - this.closingStart) : 0;
        return this.spring.velocityAt(time) + closingSlope;
    }
}
