import {lerp} from "../utils.js";
import {linear, type ResolvedEasing} from "./easing.js";
import type {TransitionCurve, TransitionCurveSegment} from "./transition-curve.js";
import {type PropertyStops, PropertyValues} from "./stops.js";
import type {RepeatOptions, Seconds} from "../types.js";

/** `easing` leads from the previous keyframe; a keyframe without one starts the animation or jumps to its value. */
export class AnimationKeyframe {
    constructor(
        readonly offset: number,
        readonly value: number,
        readonly easing?: ResolvedEasing
    ) {}

    scaleToRange(start: number, end: number): AnimationKeyframe {
        return new AnimationKeyframe(lerp(start, end, this.offset), this.value, this.easing);
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

export type ResolvedAnimationKeyframes = { [property: string]: AnimationKeyframe[] };

export class AnimationKeyframesResolver {
    private readonly keyframesByProperty: ResolvedAnimationKeyframes;
    /** The single segment's easing, for the effect to run the stops with, while the transition curve isn't split into the keyframes. */
    private readonly unsplitEasing?: ResolvedEasing;
    /** What the keyframes come from; keyframes laid out from others have none. */
    private readonly source?: { propertyValues: PropertyValues; curve: TransitionCurve };
    /** Set by the first split, so later ones reuse it. */
    private splitResolver?: AnimationKeyframesResolver;

    constructor(propertyValues: PropertyValues, curve: TransitionCurve);
    /** Keyframes that already have the transition curve split into them. */
    constructor(keyframesByProperty: ResolvedAnimationKeyframes);
    constructor(propertyValuesOrKeyframes: PropertyValues | ResolvedAnimationKeyframes, curve?: TransitionCurve) {
        if (!(propertyValuesOrKeyframes instanceof PropertyValues)) {
            this.keyframesByProperty = propertyValuesOrKeyframes;
            return;
        }

        const propertyValues = propertyValuesOrKeyframes;
        this.source = {propertyValues, curve: curve!};
        this.unsplitEasing = curve!.singleEasing;
        this.keyframesByProperty = this.unsplitEasing
            ? AnimationKeyframesResolver.stopsAsKeyframes(propertyValues)
            : AnimationKeyframesResolver.splitTransitionCurveIntoKeyframes(propertyValues, curve!);
    }

    /** The easing the effect runs the keyframes with; linear once the transition curve is split into them. */
    get effectEasing(): ResolvedEasing {
        return this.unsplitEasing ?? linear;
    }

    resolve(): ResolvedAnimationKeyframes {
        return this.keyframesByProperty;
    }

    /** The stops as keyframes at their progress, linear in between, for an effect whose own easing turns time into that progress. */
    private static stopsAsKeyframes(propertyValues: PropertyValues): ResolvedAnimationKeyframes {
        return propertyValues.map(({stops}) => stops.map(({progress, value}, index) =>
            new AnimationKeyframe(progress, value, index === 0 ? undefined : linear)
        ));
    }

    private static splitTransitionCurveIntoKeyframes(propertyValues: PropertyValues, curve: TransitionCurve): ResolvedAnimationKeyframes {
        /** Splits the segment's easing wherever it passes a stop, so each piece eases between two values. */
        const splitSegment = (segment: TransitionCurveSegment, stops: PropertyStops): AnimationKeyframe[] => {
            const normalizedProgresses = stops
                .stopsBetween(segment.startProgress, segment.endProgress)
                .map(({progress}) => segment.normalizeProgress(progress))
                .sort((a, b) => a - b);

            const inverses = normalizedProgresses.map(progress => segment.easing.inverseAt(progress));
            if (inverses.some(offsets => offsets.length > 1)) {
                return segment
                    .splitAtTurningPoints()
                    .flatMap(piece => splitSegment(piece, stops));
            }

            const normalizedOffsets = [...inverses.map(([offset]) => offset!), 1];
            return segment.easing.splitAt(normalizedOffsets).map(({offset, progress, easing}) => new AnimationKeyframe(
                segment.scaleToOffsetRange(offset),
                stops.valueAt(segment.scaleToProgressRange(progress)),
                easing
            ));
        };

        const firstSegment = curve.segments[0]!;
        return propertyValues.map(stops => [
            new AnimationKeyframe(firstSegment.startOffset, stops.valueAt(firstSegment.startProgress)),
            ...curve.segments.flatMap(segment => splitSegment(segment, stops))
        ]);
    }

    /** These keyframes with the transition curve split into them; itself when it's there already. */
    private split(): AnimationKeyframesResolver {
        if (!this.unsplitEasing) return this;
        const {propertyValues, curve} = this.source!;
        return this.splitResolver ??= new AnimationKeyframesResolver(AnimationKeyframesResolver.splitTransitionCurveIntoKeyframes(propertyValues, curve));
    }

    /**
     * Lays the animations out one after another, each counting as one play.
     * `delayAfter` gives the delays after the animation at the index, as fractions of a play; a number delays every animation.
     */
    static merge(
        animations: readonly AnimationKeyframesResolver[],
        delayAfter: DynamicDelay = 0
    ): AnimationKeyframesResolver {
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

    /** The same transition curve through the property values with their start and end swapped. */
    mirrored(): AnimationKeyframesResolver {
        if (!this.source) throw new Error("Only keyframes resolved from property values can be mirrored.");
        return new AnimationKeyframesResolver(this.source.propertyValues.flip(), this.source.curve);
    }

    /** Plays backwards in time, so each span's easing runs backwards too. */
    reversed(): AnimationKeyframesResolver {
        return this.split().mapKeyframes(keyframes => keyframes
            .map(({offset, value}, index) => new AnimationKeyframe(1 - offset, value, keyframes[index + 1]?.easing?.reversed()))
            .reverse()
        );
    }

    private scaleToRange(start: number, end: number): AnimationKeyframesResolver {
        return this.mapKeyframes(keyframes => keyframes.map(keyframe => keyframe.scaleToRange(start, end)));
    }

    /** Holds the start values for `padding`, a fraction of the animation's length. */
    padStart(padding: number): AnimationKeyframesResolver {
        const split = this.split();
        if (padding <= 0) return split;
        return split.scaleToRange(padding / (1 + padding), 1).mapKeyframes(keyframes => [
            new AnimationKeyframe(0, keyframes[0]!.value),
            ...keyframes
        ]);
    }

    /** Holds the end values for `padding`, a fraction of the animation's length. */
    padEnd(padding: number): AnimationKeyframesResolver {
        const split = this.split();
        if (padding <= 0) return split;
        return split.scaleToRange(0, 1 / (1 + padding)).mapKeyframes(keyframes => [
            ...keyframes,
            new AnimationKeyframe(1, keyframes.at(-1)!.value, linear)
        ]);
    }

    private mapKeyframes(
        transform: (keyframes: AnimationKeyframe[], property: string) => AnimationKeyframe[]
    ): AnimationKeyframesResolver {
        return new AnimationKeyframesResolver(Object.fromEntries(Object
            .entries(this.keyframesByProperty)
            .map(([property, keyframes]) => [property, transform(keyframes, property)])
        ));
    }
}

/** One WAAPI effect's worth of the animation; effects play one after another. */
export interface ResolvedAnimationEffect {
    animation: ResolvedAnimationKeyframes;
    easing: ResolvedEasing;
    delay: Seconds;
    duration: Seconds;
    iterations: number;
    direction: PlaybackDirection;
    fill: FillMode;
}

/** One effect's worth of plays, before it's placed in time. */
interface PlannedEffect {
    keyframes: AnimationKeyframesResolver;
    duration: Seconds;
    iterations: number;
    direction?: PlaybackDirection;
}

/** The plays as an original effect, run on its own or after a repeating effect that runs the plays it doesn't. */
export class AnimationEffectsResolver {
    private constructor(
        private readonly originalEffect: PlannedEffect,
        private readonly repeatsForever: boolean,
        private readonly repeatingEffect?: PlannedEffect
    ) {}

    static of(
        playDuration: Seconds,
        keyframesResolver: AnimationKeyframesResolver,
        {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'}: RepeatOptions
    ): AnimationEffectsResolver {
        const repeatsForever = !Number.isFinite(repeatCount);
        const hold = repeatDelay / playDuration;
        const original: PlannedEffect = {keyframes: keyframesResolver, duration: playDuration, iterations: 1};

        // original
        if (repeatCount === 0)
            return new AnimationEffectsResolver(original, repeatsForever);

        // original × playCount, alternating for 'reverse'
        if (repeatMode !== 'mirror' && repeatDelay === 0) {
            const direction = repeatMode === 'reverse' ? 'alternate' : 'normal';
            return new AnimationEffectsResolver({...original, iterations: repeatCount + 1, direction}, repeatsForever);
        }

        // [original+hold] × repeatCount, then original on its own;
        // [original+hold] × ∞ when repeating forever
        if (repeatMode === 'loop') {
            const repeating: PlannedEffect = {
                keyframes: keyframesResolver.padEnd(hold),
                duration: playDuration + repeatDelay,
                iterations: repeatCount,
            };
            return new AnimationEffectsResolver(original, repeatsForever, repeating);
        }

        const flippedKeyframes = repeatMode === 'mirror' ? keyframesResolver.mirrored() : keyframesResolver.reversed();
        function repeatingPair(iterations: number): PlannedEffect {
            return {
                keyframes: AnimationKeyframesResolver.merge([keyframesResolver, flippedKeyframes], hold),
                duration: 2 * (playDuration + repeatDelay),
                iterations,
            };
        }

        // [original+hold, flipped+hold] × repeatCount/2, then original on its own;
        // [original+hold, flipped+hold] × ∞ when repeating forever
        if (repeatsForever || repeatCount % 2 === 0)
            return new AnimationEffectsResolver(original, repeatsForever, repeatingPair(repeatCount / 2));

        const finalPair: PlannedEffect = {
            keyframes: AnimationKeyframesResolver.merge([keyframesResolver, flippedKeyframes], [hold]),
            duration: 2 * playDuration + repeatDelay,
            iterations: 1,
        };

        // [original+hold, flipped] on its own
        if (repeatCount === 1)
            return new AnimationEffectsResolver(finalPair, repeatsForever);

        // [original+hold, flipped+hold] × (repeatCount−1)/2, then [original+hold, flipped] on its own
        return new AnimationEffectsResolver(finalPair, repeatsForever, repeatingPair((repeatCount - 1) / 2));
    }

    /** The effects from the delay; the first holds its start values through the delay and the last keeps its end values. */
    resolve(delay: Seconds): ResolvedAnimationEffect[] {
        const {originalEffect, repeatingEffect} = this;
        if (!repeatingEffect)
            return [AnimationEffectsResolver.place(originalEffect, delay, 'both')];
        if (this.repeatsForever)
            return [AnimationEffectsResolver.place(repeatingEffect, delay, 'both')];
        return [
            AnimationEffectsResolver.place(repeatingEffect, delay, 'backwards'),
            AnimationEffectsResolver.place(originalEffect, delay + repeatingEffect.duration * repeatingEffect.iterations, 'forwards')
        ];
    }

    private static place({keyframes, direction = "normal", ...timing}: PlannedEffect, delay: Seconds, fill: FillMode): ResolvedAnimationEffect {
        return {animation: keyframes.resolve(), easing: keyframes.effectEasing, direction, ...timing, delay, fill};
    }
}
