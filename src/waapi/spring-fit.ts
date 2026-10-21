import type {Progress, Seconds} from "../types.ts";
import {lerp} from "../utils/math.ts";
import {PRECISION} from "../constants.ts";
import {CubicBezierEasing, type SpringEasing} from "../easing.ts";

/** Keyed by the offset at which the spring is broken; `easing` leads from the previous point. */
export type Spline = {
    [offset: number]: {
        progress: Progress;
        easing?: CubicBezierEasing;
    };
};

const maxSplitDepth = 12;
const errorSamples = 16;

/** A moment on the spring that a fitted segment starts or ends at; only a turning point has an `acceleration`. */
interface SpringKnot {
    time: Seconds;
    progress: Progress;
    slope: number;
    acceleration?: number;
}

/** Fits cubic Bézier segments to the whole of a spring easing. */
export class SpringSplineFitter {
    private readonly spline: Spline = {0: {progress: 0}};

    private constructor(private readonly easing: SpringEasing) {}

    static fit(easing: SpringEasing): Spline {
        const fitter = new SpringSplineFitter(easing);
        const start = easing.spring.initialVelocity === 0 ? fitter.turningKnotAt(0) : fitter.knotAt(0);
        const knots = [
            {...start, progress: 0},
            ...easing.turningTimes.map(time => fitter.turningKnotAt(time)),
            {...fitter.knotAt(easing.duration), progress: 1}
        ];
        knots.slice(1).forEach((knot, index) => fitter.fitStretch(knots[index]!, knot, 0));
        return fitter.spline;
    }

    /** Halves the stretch until its easing follows the spring within `PRECISION`. */
    private fitStretch(from: SpringKnot, to: SpringKnot, depth: number): void {
        const easing = SpringSplineFitter.easingBetween(from, to);
        if (depth < maxSplitDepth && this.errorBetween(from, to, easing) > PRECISION) {
            const middle = this.knotAt((from.time + to.time) / 2);
            this.fitStretch(from, middle, depth + 1);
            this.fitStretch(middle, to, depth + 1);
            return;
        }
        this.spline[to.time / this.easing.duration] = {progress: to.progress, easing};
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
            error = Math.max(error, Math.abs(progress - this.easing.progressAtTime(time)));
        }
        return error;
    }

    private knotAt(time: Seconds): SpringKnot {
        return {time, progress: this.easing.progressAtTime(time), slope: this.easing.slopeAtTime(time)};
    }

    private turningKnotAt(time: Seconds): SpringKnot {
        return {time, progress: this.easing.progressAtTime(time), slope: 0, acceleration: this.easing.spring.accelerationAt(time)};
    }
}
