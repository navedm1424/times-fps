import {Sequence} from "../sequence.js";
import type {RepeatOptions, SequenceEntries, SequenceEntry, Seconds, Stagger} from "../types.js";
import {parseAt} from "../utils.js";
import type {SimpleAnimation} from "../animation.js";
import {linear, type ResolvedEasing} from "./easing.js";
import {resolveTransition, type TransitionCurve} from "./transition-curve.js";
import {PropertyValues, type ValueStops} from "./stops.js";
import {AnimationKeyframesResolver, ResolvedAnimation} from "./resolved-animation.js";

export type SimpleAnimationMapping = {
    target: Element | Element[];
    values: {
        [propertyName: string]: ValueStops;
    };
};

/** One WAAPI effect's worth of the animation; effects play one after another. */
interface ResolvedAnimationEffect {
    animation: ResolvedAnimation;
    easing: ResolvedEasing;
    delay: Seconds;
    duration: Seconds;
    iterations: number;
    direction: PlaybackDirection;
}

export class SimpleAnimationResolver {
    readonly delay: Seconds | Stagger;
    readonly playDuration: Seconds;
    readonly totalDuration: Seconds;
    readonly curve: TransitionCurve;
    readonly propertyValues: PropertyValues;
    /** The animation's own first, then each enclosing sequence's, compounding on the ones before. */
    readonly repeatOptions: RepeatOptions[];

    constructor(animation: SimpleAnimation, mapping: SimpleAnimationMapping) {
        const {duration, curve} = resolveTransition(animation.transition);
        this.delay = animation.options.delay ?? 0;
        this.playDuration = duration;
        this.totalDuration = this.repeatedDuration(duration, animation.options);
        this.curve = curve;
        // Validating the interpolation
        this.propertyValues = PropertyValues.of(mapping.values);
        this.repeatOptions = [animation.options];
    }

    private repeatedDuration(playDuration: Seconds, {repeatCount = 0, repeatDelay = 0}: RepeatOptions): Seconds {
        if (repeatCount === Infinity) return Infinity;
        return playDuration * (repeatCount + 1) + repeatDelay * repeatCount;
    }

    addRepeat(options: RepeatOptions) {
        this.repeatOptions.push(options);
    }

    resolveEffects(): ResolvedAnimationEffect[] {
        const {playDuration, curve, propertyValues} = this;

        const singleEasing = curve.singleEasing;
        const alone: Pick<ResolvedAnimationEffect, 'animation' | 'easing'> = singleEasing
            ? {animation: ResolvedAnimation.ofStops(propertyValues), easing: singleEasing}
            : {animation: AnimationKeyframesResolver.resolve(curve, propertyValues), easing: linear};

        const {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = this.repeatOptions[0] ?? {};
        const hold = repeatDelay / playDuration;
        const playCount = repeatCount + 1;

        if (repeatCount === 0)
            return [playOnce(alone, playDuration)];

        if (repeatMode !== 'mirror' && hold === 0)
            return [{...alone, delay: 0, duration: playDuration, iterations: playCount, direction: repeatMode === 'reverse' ? 'alternate' : 'normal'}];

        const original = singleEasing ? AnimationKeyframesResolver.resolve(curve, propertyValues) : alone.animation;
        if (repeatMode === 'loop') {
            const delayedPlay = ResolvedAnimation.merge([original], hold);
            return [
                playOnce(alone, playDuration),
                repeated(delayedPlay, {delay: playDuration, duration: playDuration * (1 + hold), iterations: repeatCount})
            ];
        }

        const backward = repeatMode === 'mirror'
            ? AnimationKeyframesResolver.resolve(curve, propertyValues.flip())
            : original.reversed();
        const delayedPairDuration = playDuration * 2 * (1 + hold);

        if (playCount % 2 === 1) {
            const delayedPair = ResolvedAnimation.merge([backward, original], hold);
            return [
                playOnce(alone, playDuration),
                repeated(delayedPair, {delay: playDuration, duration: delayedPairDuration, iterations: repeatCount / 2})
            ];
        }

        const firstPair = ResolvedAnimation.merge([original, backward], index => index === 0 ? 0 : hold);
        const firstPairDuration = playDuration * (2 + hold);
        const firstPairEffect = repeated(firstPair, {delay: 0, duration: firstPairDuration, iterations: 1});
        if (playCount === 2) return [firstPairEffect];

        const delayedPair = ResolvedAnimation.merge([original, backward], hold);
        return [
            firstPairEffect,
            repeated(delayedPair, {delay: firstPairDuration, duration: delayedPairDuration, iterations: (playCount - 2) / 2})
        ];
    }
}

/** A play that runs once, from the start. */
function playOnce(play: Pick<ResolvedAnimationEffect, 'animation' | 'easing'>, duration: Seconds): ResolvedAnimationEffect {
    return {...play, delay: 0, duration, iterations: 1, direction: 'normal'};
}

/** Merged plays, whose curves are already in their keyframes. */
function repeated(animation: ResolvedAnimation, timing: Pick<ResolvedAnimationEffect, 'delay' | 'duration' | 'iterations'>): ResolvedAnimationEffect {
    return {animation, easing: linear, direction: 'normal', ...timing};
}

class SequenceResolver {
    static of<SE extends SequenceEntries>(start: number, sequence: Sequence<SE>) {
        if (sequence.names.length === 0)
            throw new Error("Sequence must not be empty.");

        let lastResolver: SequenceEntryResolver | undefined;
        const resolversMap = new Map<keyof SE, SequenceEntryResolver>();
        const resolvers: SequenceEntryResolver[] = [];
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const parsedAt = parseAt(entry.at ?? "+0");

            let resolvedEntryStart: number;
            if (parsedAt.kind === 'absolute')
                resolvedEntryStart = parsedAt.time;
            else if (parsedAt.reference) {
                if (!resolversMap.has(parsedAt.reference))
                    throw new Error(`Invalid reference at: ${parsedAt.reference}`);
                resolvedEntryStart = resolversMap.get(parsedAt.reference)![parsedAt.anchor] + parsedAt.offset;
            } else
                resolvedEntryStart = (lastResolver?.[parsedAt.anchor] ?? 0) + parsedAt.offset;

            if (resolvedEntryStart < 0)
                resolvedEntryStart = 0;

            const resolvedEntry = SequenceEntryResolver.of(start + (sequence.options.delay ?? 0) + resolvedEntryStart, entry);
            resolversMap.set(name, lastResolver = resolvedEntry);
            resolvers.push(resolvedEntry);
        }

        const {referenceableEnd} = lastResolver!;
        const {repeatCount, repeatMode, repeatDelay} = sequence.options;
        if (repeatCount) {
            resolvers.forEach(entry => {
                if (entry === lastResolver) return;
                // entry.addRepeat({ repeatCount, repeatMode, repeatDelay:  });
            });
        }
        // return new SequenceResolver(start, referenceableEnd);
    }
}

declare class SequenceEntryResolver {
    readonly start: number;
    readonly referenceableEnd: number;
    readonly totalDuration: number;
    static of(resolvedStart: number, entry: SequenceEntry): SequenceEntryResolver;

    addRepeat(options: RepeatOptions): void;
}