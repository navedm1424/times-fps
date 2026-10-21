import type {CubicBezier} from "../cubic-bezier.ts";
import {CubicBezierEasing, type CubicBezierEasingDescriptor, type EasingFunction, LinearEasing, linear, SpringEasing, StepsEasing} from "../easing.ts";
import type {DampedSpring} from "../damped-spring.ts";
import type {PropertyStops, StopValue} from "../resolution/stops.ts";
import type {EntryPath} from "../resolution/layout.ts";
import type {TrackRun, TrackSpan} from "../resolution/track-runs.ts";
import type {Progress, Seconds} from "../types.ts";
import {invLerp, lerp} from "../utils/math.ts";
import {sortedByKey} from "../utils/records.ts";
import type {LinearPoint, NativeEasing} from "./native-easing.ts";
import {type Spline, SpringSplineFitter} from "./spring-fit.ts";
import type {PlacedEffect, ResolvedEffect} from "./tracks.ts";

/** `easing` leads to the next keyframe; without one, it's linear. The value is CSS text. */
export interface NativeKeyframe {
    offset: number;
    value: string;
    easing?: NativeEasing;
}

/** One WAAPI effect on one property. */
export interface NativeAnimationEffect {
    delay: Seconds;
    duration: Seconds;
    iterations: number;
    direction: PlaybackDirection;
    fill: FillMode;
    easing: NativeEasing;
    keyframes: NativeKeyframe[];
    /** The animation leaf it comes from, which is undefined for an animation on its own. */
    path: EntryPath | undefined;
}

/**
 * The effect with its spans' easings as WAAPI ones.
 * A single whole play keeps its easing on the effect, with the stops as linear keyframes; otherwise the easings are split into the keyframes.
 */
export function nativeEffectOf({run, delay, duration, iterations, direction, fill, unit, path}: ResolvedEffect): NativeAnimationEffect {
    const timing = {delay, duration, iterations, direction, fill, path};
    const values = unit === undefined ? stopTexts : numbersIn(unit);
    if (easesOnEffect(run, duration)) {
        const [span] = run.spans;
        return {...timing, easing: wholeNativeEasingOf(span!.easing), keyframes: span!.stops.stops.map(({progress, value}) => ({offset: progress, value: values.ofStop(value)}))};
    }
    if (duration === 0)
        return {...timing, easing: {type: 'linear'}, keyframes: [{offset: 0, value: values.startOf(run.spans[0]!)}, {offset: 1, value: values.ofStop(run.endValue)}]};
    return {...timing, easing: {type: 'linear'}, keyframes: keyframesOf(run.spans, duration, values.piecesOf)};
}

/**
 * Whether every keyframe of the effect lands on a stop, so its values can pass to WAAPI as the stops' own CSS text:
 * its easing is on the effect, or each span eases between two stops through one native easing that needn't be split.
 */
export function landsOnStops({run, duration}: PlacedEffect): boolean {
    return easesOnEffect(run, duration) || run.spans.every(span => span.end < span.start || isOneKeyframeInterval(span));
}

function easesOnEffect(run: TrackRun, duration: Seconds): boolean {
    const [span, ...otherSpans] = run.spans;
    return !!span && otherSpans.length === 0 && span.start === 0 && span.end === duration && runsOnEffect(span);
}

/**
 * The window covers the whole easing, either way, so it starts and ends on the stops, and it makes one native piece.
 * With only two stops, the value runs linearly with the progress even past them, so an overshoot needn't be split.
 */
function isOneKeyframeInterval({easing, stops}: TrackSpan): boolean {
    return !(easing instanceof SpringEasing)
        && Math.abs(easing.windowEnd - easing.windowStart) === 1
        && stops.stops.length === 2
        && nativePiecesOf(easing, easing.startProgress, easing.endProgress).length === 1;
}

/** How an effect's values become the CSS text of its keyframes. */
interface KeyframeValues {
    ofStop(value: StopValue): string;
    startOf(span: TrackSpan): string;
    piecesOf(span: TrackSpan): KeyframedPiece<string>[];
}

/** The stops' own text, for an effect whose keyframes land on its stops. */
const stopTexts: KeyframeValues = {
    ofStop: value => value.text!,
    startOf: ({easing, stops}) => stops.valueOfStopAt(easing.startProgress).text!,
    piecesOf: ({start, end, easing, stops}) => {
        const [piece] = nativePiecesOf(easing, easing.startProgress, easing.endProgress);
        return [{
            startOffset: 0,
            endOffset: 1,
            startValue: stops.valueOfStopAt(easing.startProgress).text!,
            endValue: stops.valueOfStopAt(easing.endProgress).text!,
            ...(end > start && piece!.easing && {easing: piece!.easing})
        }];
    }
};

/** The values as numbers in the unit, interpolated wherever a keyframe falls between stops. */
function numbersIn(unit: string): KeyframeValues {
    const textOf = (number: number) => `${number}${unit}`;
    return {
        ofStop: value => textOf(value.number),
        startOf: span => textOf(startValueOf(span)),
        piecesOf: span => {
            const pieces = span.end === span.start
                ? [{startOffset: 0, endOffset: 1, startValue: startValueOf(span), endValue: endValueOf(span)}]
                : keyframedPiecesOf(span);
            return pieces.map(piece => ({...piece, startValue: textOf(piece.startValue), endValue: textOf(piece.endValue)}));
        }
    };
}

function startValueOf({easing, stops}: TrackSpan): number {
    return stops.valueAt(easing.startProgress);
}

function endValueOf({easing, stops}: TrackSpan): number {
    return stops.valueAt(easing.endProgress);
}

function runsOnEffect({easing, stops}: TrackSpan): boolean {
    return easing.isWhole && !(easing instanceof SpringEasing) && stops.stops.every(({progress}) => progress >= 0 && progress <= 1);
}

function wholeNativeEasingOf(easing: EasingFunction): NativeEasing {
    if (easing instanceof CubicBezierEasing) return {type: 'cubic-bezier', definition: easing.definition};
    if (easing instanceof StepsEasing) return {type: 'steps', definition: easing.definition};
    return {type: 'linear'};
}

function keyframesOf(spans: readonly TrackSpan[], duration: Seconds, piecesOf: (span: TrackSpan) => KeyframedPiece<string>[]): NativeKeyframe[] {
    const keyframes: NativeKeyframe[] = [];
    for (const span of spans) {
        if (span.end < span.start) continue;
        const offsetAt = (spanOffset: number) => lerp(span.start, span.end, spanOffset) / duration;
        for (const piece of piecesOf(span)) {
            const startOffset = offsetAt(piece.startOffset);
            const last = keyframes.at(-1);
            if (last && last.offset === startOffset && last.value === piece.startValue) {
                if (piece.easing) last.easing = piece.easing;
            } else
                keyframes.push({offset: startOffset, value: piece.startValue, ...(piece.easing && {easing: piece.easing})});
            keyframes.push({offset: offsetAt(piece.endOffset), value: piece.endValue});
        }
    }

    // Rounding may leave offsets a hair outside 0–1 or out of order, which WAAPI rejects.
    let previousOffset = 0;
    for (const keyframe of keyframes)
        previousOffset = keyframe.offset = Math.min(Math.max(keyframe.offset, previousOffset), 1);
    return keyframes;
}

/** A stretch of a span between two keyframes; offsets are fractions of the span. */
interface KeyframedPiece<Value = number> {
    startOffset: number;
    endOffset: number;
    startValue: Value;
    endValue: Value;
    easing?: NativeEasing;
}

/** A part of a span's easing whose progress is `fromProgress` to `toProgress` scaled by its own; offsets are fractions of the span. */
interface CurveSegment {
    startOffset: number;
    endOffset: number;
    easing: EasingFunction;
    fromProgress: Progress;
    toProgress: Progress;
}

/** Splits the easing wherever it turns back or passes a stop, so each piece eases between two values. */
function keyframedPiecesOf({easing, stops}: TrackSpan): KeyframedPiece[] {
    return curveSegmentsOf(easing)
        .flatMap(splitAtTurningPoints)
        .flatMap(segment => splitAtStops(segment, stops));
}

/** A spring as the segments of its fitted spline within the window; any other easing as one segment. */
function curveSegmentsOf(easing: EasingFunction): CurveSegment[] {
    if (!(easing instanceof SpringEasing))
        return [{startOffset: 0, endOffset: 1, easing, fromProgress: 0, toProgress: 1}];

    const {windowStart, windowEnd} = easing;
    const [low, high] = windowStart <= windowEnd ? [windowStart, windowEnd] : [windowEnd, windowStart];
    const points = splinePointsOf(easing);
    return points.slice(1).flatMap(([endInput, {progress: toProgress, easing: pieceEasing = linear}], index): CurveSegment[] => {
        const [startInput, {progress: fromProgress}] = points[index]!;
        const coveredStart = Math.max(startInput, low);
        const coveredEnd = Math.min(endInput, high);
        if (coveredEnd <= coveredStart) return [];

        const [entry, exit] = windowStart <= windowEnd ? [coveredStart, coveredEnd] : [coveredEnd, coveredStart];
        const pieceOffsetOf = (input: number) => invLerp(input, startInput, endInput);
        return [{
            startOffset: invLerp(entry, windowStart, windowEnd),
            endOffset: invLerp(exit, windowStart, windowEnd),
            easing: pieceEasing.windowed(pieceOffsetOf(entry), pieceOffsetOf(exit)),
            fromProgress,
            toProgress
        }];
    }).sort((first, second) => first.startOffset - second.startOffset);
}

const splinesBySpring = new WeakMap<DampedSpring, Map<Seconds, [number, Spline[number]][]>>();

/** Fitted once per spring and duration, whatever the window. */
function splinePointsOf(easing: SpringEasing): [number, Spline[number]][] {
    let splinesByDuration = splinesBySpring.get(easing.spring);
    if (!splinesByDuration) splinesBySpring.set(easing.spring, splinesByDuration = new Map());
    let points = splinesByDuration.get(easing.duration);
    if (!points) splinesByDuration.set(easing.duration, points = sortedByKey(SpringSplineFitter.fit(easing)));
    return points;
}

function splitAtTurningPoints(segment: CurveSegment): CurveSegment[] {
    const boundaries = [0, ...segment.easing.turningOffsets(), 1];
    return boundaries.slice(1).map((end, index) => {
        const start = boundaries[index]!;
        return {
            ...segment,
            startOffset: lerp(segment.startOffset, segment.endOffset, start),
            endOffset: lerp(segment.startOffset, segment.endOffset, end),
            easing: segment.easing.windowed(start, end)
        };
    });
}

/** The segment's progress only rises or only falls, so it passes each stop once; between two passes, the value runs linearly with the progress. */
function splitAtStops({startOffset, endOffset, easing, fromProgress, toProgress}: CurveSegment, stops: PropertyStops): KeyframedPiece[] {
    const progressOf = (easedProgress: Progress) => lerp(fromProgress, toProgress, easedProgress);
    const startEased = easing.startProgress;
    const endEased = easing.endProgress;
    const crossings = stops
        .stopsBetween(progressOf(startEased), progressOf(endEased))
        .flatMap(({progress}) => {
            const eased = invLerp(progress, fromProgress, toProgress);
            const [offset] = easing.offsetsAt(eased);
            return offset === undefined ? [] : [{offset, eased}];
        })
        .sort((first, second) => first.offset - second.offset);
    const bounds = [{offset: 0, eased: startEased}, ...crossings, {offset: 1, eased: endEased}];

    return bounds.slice(1).flatMap((end, index) => {
        const start = bounds[index]!;
        if (end.offset <= start.offset) return [];

        const startValue = stops.valueAt(progressOf(start.eased));
        const endValue = stops.valueAt(progressOf(end.eased));
        const segmentOffsetOf = (pieceOffset: number) => lerp(startOffset, endOffset, lerp(start.offset, end.offset, pieceOffset));
        const pieces = nativePiecesOf(easing.windowed(start.offset, end.offset), start.eased, end.eased);
        return pieces.map((piece, pieceIndex): KeyframedPiece => {
            const previous = pieces[pieceIndex - 1] ?? {offset: 0, progress: 0};
            return {
                startOffset: segmentOffsetOf(previous.offset),
                endOffset: segmentOffsetOf(piece.offset),
                startValue: lerp(startValue, endValue, previous.progress),
                endValue: lerp(startValue, endValue, piece.progress),
                ...(piece.easing && {easing: piece.easing})
            };
        });
    });
}

/** A piece of a split easing, rescaled to 0–1, ending at `offset` where the whole runs `progress` of the way. */
interface NativePiece {
    offset: number;
    progress: Progress;
    easing?: NativeEasing;
}

/** The window as native easings that run from `startEased` to `endEased`, which steps only reach as they jump past them. */
function nativePiecesOf(easing: EasingFunction, startEased: Progress, endEased: Progress): NativePiece[] {
    if (startEased === endEased || easing instanceof LinearEasing) return [{offset: 1, progress: 1}];
    if (easing instanceof CubicBezierEasing) return cubicBezierPiecesOf(easing);
    if (easing instanceof StepsEasing) return [{offset: 1, progress: 1, easing: stepsEasingOf(easing, startEased, endEased)}];
    throw new Error("A spring's window must be fitted before it's made native.");
}

const timeTolerance = 1e-9;

/** The window cut out of the curve and stretched to (0, 0)–(1, 1), as one piece or two. */
function cubicBezierPiecesOf(easing: CubicBezierEasing): NativePiece[] {
    const {curve, windowStart, windowEnd} = easing;
    const [low, high] = windowStart <= windowEnd ? [windowStart, windowEnd] : [windowEnd, windowStart];
    const lowParameter = curve.parameterAt('x', low);
    const highParameter = curve.parameterAt('x', high);
    const [, fromLow] = curve.splitAt(lowParameter);
    const [window] = fromLow.splitAt(invLerp(highParameter, lowParameter, 1));
    const forwardPieces = stretchedPiecesOf(window);
    const pieces = windowStart <= windowEnd ? forwardPieces : forwardPieces.map((piece, index): StretchedPiece => {
        const start = forwardPieces[index - 1] ?? {offset: 0, progress: 0};
        const [x1, y1, x2, y2] = piece.definition;
        return {offset: 1 - start.offset, progress: 1 - start.progress, definition: [1 - x2, 1 - y2, 1 - x1, 1 - y1]};
    }).reverse();
    return pieces.map(({offset, progress, definition}) => ({offset, progress, easing: {type: 'cubic-bezier', definition}}));
}

interface StretchedPiece {
    offset: number;
    progress: Progress;
    definition: CubicBezierEasingDescriptor;
}

/**
 * The curve as one piece, or as two when stretching it would push its handles outside the 0–1 time range.
 * That only happens to a piece that contains the point where time moves slowest, and splitting there always fixes it.
 */
function stretchedPiecesOf(curve: CubicBezier): StretchedPiece[] {
    const [x1, , x2] = stretchedDefinitionOf(curve);
    const inflection = curve.inflectionParameter('x');
    const fitsInTime = isWithinTime(x1) && isWithinTime(x2);
    const parts = fitsInTime || inflection === undefined || inflection <= 0 || inflection >= 1 ? [curve] : curve.splitAt(inflection);
    const clampToTime = (x: number) => Math.min(Math.max(x, 0), 1);
    return parts.map(part => {
        const [x1, y1, x2, y2] = stretchedDefinitionOf(part);
        return {
            offset: invLerp(part.end.x, curve.start.x, curve.end.x),
            progress: invLerp(part.end.y, curve.start.y, curve.end.y),
            definition: [clampToTime(x1), y1, clampToTime(x2), y2]
        };
    });
}

function isWithinTime(x: number): boolean {
    return x >= -timeTolerance && x <= 1 + timeTolerance;
}

/** The control points of the curve stretched to run from (0, 0) to (1, 1). */
function stretchedDefinitionOf(curve: CubicBezier): CubicBezierEasingDescriptor {
    const {start, end} = curve;
    const stretch = ({x, y}: { x: number; y: number }) => [invLerp(x, start.x, end.x), invLerp(y, start.y, end.y)] as const;
    return [...stretch(curve.control1), ...stretch(curve.control2)];
}

/** The window's levels as a `linear()` with hard jumps, or the steps themselves when the window is the whole easing and runs 0 to 1. */
function stepsEasingOf(easing: StepsEasing, startEased: Progress, endEased: Progress): NativeEasing {
    if (easing.isWhole && startEased === 0 && endEased === 1) return {type: 'steps', definition: easing.definition};

    const bounds = [0, ...easing.jumpOffsets(), 1];
    const points: LinearPoint[] = [{input: 0, output: 0}];
    bounds.slice(1).forEach((end, index) => {
        const start = bounds[index]!;
        const level = invLerp(easing.progressAt((start + end) / 2), startEased, endEased);
        points.push({input: start, output: level}, {input: end, output: level});
    });
    points.push({input: 1, output: 1});
    return {type: 'linear-points', points: points.filter((point, index) => {
        const previous = points[index - 1];
        return !previous || previous.input !== point.input || previous.output !== point.output;
    })};
}
