import {lerp} from "../utils.js";
import {linear, type ResolvedEasing} from "./easing.js";
import type {TransitionCurveSegment, TransitionCurve} from "./transition-curve.js";
import type {PropertyStops, PropertyValues} from "./stops.js";

export class AnimationKeyframesResolver {
    static resolve(curve: TransitionCurve, propertyValues: PropertyValues): ResolvedAnimation {
        return new ResolvedAnimation(propertyValues.map(stops => AnimationKeyframesResolver.resolveProperty(curve, stops)));
    }

    private static resolveProperty(curve: TransitionCurve, stops: PropertyStops): ResolvedAnimationKeyframe[] {
        const firstSegment = curve.segments[0]!;
        return [
            new ResolvedAnimationKeyframe(firstSegment.startOffset, stops.valueAt(firstSegment.startProgress)),
            ...curve.segments.flatMap(segment => AnimationKeyframesResolver.splitSegmentIntoKeyframes(segment, stops))
        ];
    }

    /** Splits the segment's easing wherever it passes a stop, so each piece eases between two values. */
    private static splitSegmentIntoKeyframes(segment: TransitionCurveSegment, stops: PropertyStops): ResolvedAnimationKeyframe[] {
        const normalizedProgresses = stops
            .stopsBetween(segment.startProgress, segment.endProgress)
            .map(({progress}) => segment.normalizeProgress(progress))
            .sort((a, b) => a - b);

        const inverses = normalizedProgresses.map(progress => segment.easing.inverseAt(progress));
        if (inverses.some(offsets => offsets.length > 1)) {
            return segment
                .splitAtTurningPoints()
                .flatMap(piece => AnimationKeyframesResolver.splitSegmentIntoKeyframes(piece, stops));
        }

        const normalizedOffsets = [...inverses.map(([offset]) => offset!), 1];
        return segment.easing.splitAt(normalizedOffsets).map(({offset, progress, easing}) => new ResolvedAnimationKeyframe(
            segment.scaleToOffsetRange(offset),
            stops.valueAt(segment.scaleToProgressRange(progress)),
            easing
        ));
    }
}

/** `easing` leads from the previous keyframe; a keyframe without one starts the animation or jumps to its value. */
class ResolvedAnimationKeyframe {
    constructor(
        readonly offset: number,
        readonly value: number,
        readonly easing?: ResolvedEasing
    ) {}

    scaleToRange(start: number, end: number): ResolvedAnimationKeyframe {
        return new ResolvedAnimationKeyframe(lerp(start, end, this.offset), this.value, this.easing);
    }
}

type DynamicDelay = number | number[] | ((index: number, total: number) => number);
function resolveDelay(delay: DynamicDelay, index: number, total: number) {
    return (
        typeof delay === "function" ?
            delay(index, total) :
            typeof delay === "number" ?
                delay : delay[index]
    ) ?? 0;
}

export class ResolvedAnimation {
    constructor(readonly keyframesByProperty: { [property: string]: ResolvedAnimationKeyframe[] }) {}

    /** The stops as keyframes at their progress, linear in between, for an effect whose own easing turns time into that progress. */
    static ofStops(propertyValues: PropertyValues): ResolvedAnimation {
        return new ResolvedAnimation(propertyValues.map(({stops}) => stops.map(({progress, value}, index) =>
            new ResolvedAnimationKeyframe(progress, value, index === 0 ? undefined : linear)
        )));
    }

    /**
     * Lays the animations out one after another, each counting as one play.
     * `delayAfter` gives the delays after the animation at the index, as fractions of a play; a number delays every animation.
     */
    static merge(
        animations: readonly ResolvedAnimation[],
        delayAfter: DynamicDelay = 0
    ): ResolvedAnimation {
        const padded = animations.map((animation, index) => {
            const after = resolveDelay(delayAfter, index, animations.length);
            return {animation: animation.padEnd(after), length: 1 + after};
        });

        const totalLength = padded.reduce((total, {length}) => total + length, 0);
        let start = 0;
        const scaled = padded.map(({animation, length}) => {
            const range = animation.scaleToRange(start / totalLength, (start + length) / totalLength);
            start += length;
            return range;
        });
        return scaled[0]!.mapKeyframes((_, property) => scaled.flatMap(animation => animation.keyframesByProperty[property]!));
    }

    /** Plays backwards in time, so each span's easing runs backwards too. */
    reversed(): ResolvedAnimation {
        return this.mapKeyframes(keyframes => keyframes
            .map(({offset, value}, index) => new ResolvedAnimationKeyframe(1 - offset, value, keyframes[index + 1]?.easing?.reversed()))
            .reverse()
        );
    }

    private scaleToRange(start: number, end: number): ResolvedAnimation {
        return this.mapKeyframes(keyframes => keyframes.map(keyframe => keyframe.scaleToRange(start, end)));
    }

    /** Holds the start values for `padding`, a fraction of the animation's length. */
    private padStart(padding: number): ResolvedAnimation {
        if (padding <= 0) return this;
        return this.scaleToRange(padding / (1 + padding), 1).mapKeyframes(keyframes => [
            new ResolvedAnimationKeyframe(0, keyframes[0]!.value),
            ...keyframes
        ]);
    }

    /** Holds the end values for `padding`, a fraction of the animation's length. */
    padEnd(padding: number): ResolvedAnimation {
        if (padding <= 0) return this;
        return this.scaleToRange(0, 1 / (1 + padding)).mapKeyframes(keyframes => [
            ...keyframes,
            new ResolvedAnimationKeyframe(1, keyframes.at(-1)!.value, linear)
        ]);
    }

    private mapKeyframes(
        transform: (keyframes: ResolvedAnimationKeyframe[], property: string) => ResolvedAnimationKeyframe[]
    ): ResolvedAnimation {
        return new ResolvedAnimation(Object.fromEntries(Object
            .entries(this.keyframesByProperty)
            .map(([property, keyframes]) => [property, transform(keyframes, property)])
        ));
    }
}
