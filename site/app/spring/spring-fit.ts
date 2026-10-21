import {AnimationDefinition, type SpringTransition} from "timesfps";
import {
    AnimationTracksResolver,
    type CubicBezierEasing,
    plainNumberResolver,
    PropertyStops,
    resolveSpring,
    resolveTimings,
    SpringEasing,
    SpringSplineFitter
} from "@/lib/timesfps-internals";

export interface SplinePoint {
    time: number;
    progress: number;
    /** Leads from the previous point. */
    easing?: CubicBezierEasing;
}

export interface SpringFit {
    duration: number;
    naturalFrequency: number;
    dampingRatio: number;
    splinePoints: SplinePoint[];
    /** How many keyframes the WAAPI adapter plays the spring as. */
    keyframeCount: number;
    times: number[];
    springProgresses: number[];
    splineProgresses: number[];
    /** The spline's progress minus the spring's. */
    errors: number[];
    largestError: number;
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
    return {
        duration,
        naturalFrequency: spring.naturalFrequency,
        dampingRatio: spring.dampingRatio,
        splinePoints,
        keyframeCount: keyframeCountOf(transition),
        times,
        springProgresses,
        splineProgresses,
        errors,
        largestError: Math.max(...errors.map(Math.abs))
    };
}

/** The resolver only keys its tracks by target, so a plain object stands in for an element, which the server doesn't have. */
const standInTarget = {} as Element;

function keyframeCountOf(transition: SpringTransition): number {
    const targetValues = [{target: standInTarget, properties: {progress: {stops: PropertyStops.of("progress", {0: 0, 1: 1}), allowedFill: "both" as const}}}];
    const tracks = AnimationTracksResolver.resolve(resolveTimings(AnimationDefinition.of(transition), 1), () => targetValues, plainNumberResolver);
    return tracks.get(standInTarget)!.progress!.reduce((count, effect) => count + effect.keyframes.length, 0);
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
