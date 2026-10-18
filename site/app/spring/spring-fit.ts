import {resolveSpring, type SpringTransition} from "timesfps";
import {type CubicBezierEasing, SpringEasing, SpringSplineFitter} from "@/lib/timesfps-internals";

export interface SplinePoint {
    time: number;
    progress: number;
    /** Leads from the previous point. */
    easing?: CubicBezierEasing;
}

export interface SpringFit {
    duration: number;
    splinePoints: SplinePoint[];
    times: number[];
    springProgresses: number[];
    splineProgresses: number[];
    /** The spline's progress minus the spring's. */
    errors: number[];
}

const sampleCount = 600;

export function fitSpring(transition: SpringTransition): SpringFit {
    const {spring, duration} = resolveSpring(transition);
    const splinePoints = Object.entries(SpringSplineFitter.fit(new SpringEasing(spring, duration)))
        .map(([offset, point]) => ({time: Number(offset) * duration, ...point}))
        .sort((first, second) => first.time - second.time);

    const times = Array.from({length: sampleCount + 1}, (_, index) => duration * index / sampleCount);
    const springProgresses = times.map(time => spring.positionAt(time));
    const splineProgresses = times.map(time => splineProgressAt(splinePoints, time));
    const errors = splineProgresses.map((progress, index) => progress - springProgresses[index]!);
    return {duration, splinePoints, times, springProgresses, splineProgresses, errors};
}

/** Each segment's easing runs between its two points, as WAAPI plays an easing between two keyframes. */
function splineProgressAt(points: readonly SplinePoint[], time: number): number {
    const nextIndex = points.findIndex(point => point.time >= time);
    const index = nextIndex === -1 ? points.length - 1 : Math.max(1, nextIndex);
    const from = points[index - 1]!;
    const to = points[index]!;
    const offset = to.time > from.time ? (time - from.time) / (to.time - from.time) : 1;
    const easedProgress = to.easing?.progressAt(offset) ?? offset;
    return from.progress + (to.progress - from.progress) * easedProgress;
}
