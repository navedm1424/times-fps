import type {Progress, Seconds} from "../types.js";
import {invLerp, lerp, sortedByKey} from "../utils.js";
import type {Transition} from "../transition.js";
import {linear, resolveEasing, type CubicBezierEasing, type ResolvedEasing} from "./easing.js";
import {resolveSpring, SpringSplineFitter} from "./spring-fit.js";

/** Keyed by the offset at which the spring is broken; `easing` leads from the previous point. */
export type Spline = {
    [offset: number]: {
        progress: Progress;
        easing?: CubicBezierEasing;
    };
};

export function resolveTransition(transition: Transition): {
    duration: Seconds;
    curve: TransitionCurve;
} {
    if (transition.type === "eased")
        return {
            duration: transition.duration,
            curve: TransitionCurve.eased(transition.easing ? resolveEasing(transition.easing) : linear)
        };

    const {spring, duration} = resolveSpring(transition);
    return {duration, curve: TransitionCurve.ofSpline(SpringSplineFitter.fit(spring, duration))};
}

/** The transition's easing laid out over one play, as segments of the spline or a single segment. */
export class TransitionCurve {
    private constructor(readonly segments: readonly TransitionCurveSegment[]) {}

    /** The easing of a curve that is a single segment from (0, 0) to (1, 1); a spline of several has none. */
    get singleEasing(): ResolvedEasing | undefined {
        const [segment, ...rest] = this.segments;
        if (!segment || rest.length > 0) return undefined;
        const spansWhole = segment.startOffset === 0 && segment.endOffset === 1
            && segment.startProgress === 0 && segment.endProgress === 1;
        return spansWhole ? segment.easing : undefined;
    }

    static eased(easing: ResolvedEasing): TransitionCurve {
        return new TransitionCurve([new TransitionCurveSegment({startOffset: 0, endOffset: 1, startProgress: 0, endProgress: 1, easing})]);
    }

    static ofSpline(spline: Spline): TransitionCurve {
        const points = sortedByKey(spline);
        if (points.length < 2) throw new Error("A spline needs at least a start and an end point.");
        return new TransitionCurve(points.slice(1)
            .map(([endOffset, {progress: endProgress, easing = linear}], index) => {
                const [startOffset, {progress: startProgress}] = points[index]!;
                return new TransitionCurveSegment({startOffset, endOffset, startProgress, endProgress, easing});
            })
        );
    }
}

export class TransitionCurveSegment {
    readonly startOffset: number;
    readonly endOffset: number;
    readonly startProgress: Progress;
    readonly endProgress: Progress;
    readonly easing: ResolvedEasing;

    constructor({startOffset, endOffset, startProgress, endProgress, easing}: {
        startOffset: number;
        endOffset: number;
        startProgress: Progress;
        endProgress: Progress;
        easing: ResolvedEasing;
    }) {
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.startProgress = startProgress;
        this.endProgress = endProgress;
        this.easing = easing;
    }

    normalizeProgress(progress: Progress): Progress {
        return invLerp(progress, this.startProgress, this.endProgress);
    }

    scaleToOffsetRange(normalizedOffset: number): number {
        return lerp(this.startOffset, this.endOffset, normalizedOffset);
    }

    /** Splits wherever the easing turns back, so each piece's progress only rises or only falls. */
    splitAtTurningPoints(): TransitionCurveSegment[] {
        const pieces = this.easing.splitAt([...this.easing.turningOffsets(), 1]);
        return pieces.map(({offset, progress, easing}, index) => {
            const start = pieces[index - 1] ?? {offset: 0, progress: 0};
            return new TransitionCurveSegment({
                startOffset: this.scaleToOffsetRange(start.offset),
                endOffset: this.scaleToOffsetRange(offset),
                startProgress: this.scaleToProgressRange(start.progress),
                endProgress: this.scaleToProgressRange(progress),
                easing
            });
        });
    }

    scaleToProgressRange(normalizedProgress: Progress): Progress {
        return lerp(this.startProgress, this.endProgress, normalizedProgress);
    }
}
