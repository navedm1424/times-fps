import {Sequence} from "../sequence.js";
import type {SequenceEntries, SequenceEntry, Seconds} from "../types.js";
import {parseAt} from "../utils.js";
import type {SimpleAnimation} from "../animation.js";
import {linear, type ResolvedEasing} from "./easing.js";
import {resolveTransition} from "./transition-curve.js";
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

export function resolveSimpleAnimation(animation: SimpleAnimation, mapping: SimpleAnimationMapping): ResolvedAnimationEffect[] {
    const {duration, curve} = resolveTransition(animation.transition);

    // Validating the interpolation
    const propertyValues = PropertyValues.of(mapping.values);

    const singleEasing = curve.singleEasing;
    const alone: Pick<ResolvedAnimationEffect, 'animation' | 'easing'> = singleEasing
        ? {animation: ResolvedAnimation.ofStops(propertyValues), easing: singleEasing}
        : {animation: AnimationKeyframesResolver.resolve(curve, propertyValues), easing: linear};

    const {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = animation.options;
    const hold = repeatDelay / duration;
    const playCount = repeatCount + 1;

    if (repeatCount === 0)
        return [playOnce(alone, duration)];

    if (repeatMode !== 'mirror' && hold === 0)
        return [{...alone, delay: 0, duration, iterations: playCount, direction: repeatMode === 'reverse' ? 'alternate' : 'normal'}];

    const original = singleEasing ? AnimationKeyframesResolver.resolve(curve, propertyValues) : alone.animation;
    if (repeatMode === 'loop') {
        const delayedPlay = ResolvedAnimation.merge([original], hold);
        return [
            playOnce(alone, duration),
            repeated(delayedPlay, {delay: duration, duration: duration * (1 + hold), iterations: repeatCount})
        ];
    }

    const backward = repeatMode === 'mirror'
        ? AnimationKeyframesResolver.resolve(curve, propertyValues.flip())
        : original.reversed();
    const delayedPairDuration = duration * 2 * (1 + hold);

    if (playCount % 2 === 1) {
        const delayedPair = ResolvedAnimation.merge([backward, original], hold);
        return [
            playOnce(alone, duration),
            repeated(delayedPair, {delay: duration, duration: delayedPairDuration, iterations: repeatCount / 2})
        ];
    }

    const firstPair = ResolvedAnimation.merge([original, backward], index => index === 0 ? 0 : hold);
    const firstPairDuration = duration * (2 + hold);
    const firstPairEffect = repeated(firstPair, {delay: 0, duration: firstPairDuration, iterations: 1});
    if (playCount === 2) return [firstPairEffect];

    const delayedPair = ResolvedAnimation.merge([original, backward], hold);
    return [
        firstPairEffect,
        repeated(delayedPair, {delay: firstPairDuration, duration: delayedPairDuration, iterations: (playCount - 2) / 2})
    ];
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
    static resolve<SE extends SequenceEntries>(start: number, sequence: Sequence<SE>): ResolvedSequence {
        if (sequence.names.length === 0)
            throw new Error("Sequence must not be empty.");

        let lastResolvedEntry: ResolvedSequenceEntry | undefined;
        const resolvedEntriesMap = new Map<keyof SE, ResolvedSequenceEntry>();
        const resolvedEntries: ResolvedSequenceEntry[] = [];
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const parsedAt = parseAt(entry.at ?? "+0");

            let resolvedEntryStart: number;
            if (parsedAt.kind === 'absolute')
                resolvedEntryStart = parsedAt.time;
            else if (parsedAt.reference) {
                if (!resolvedEntriesMap.has(parsedAt.reference))
                    throw new Error(`Invalid reference at: ${parsedAt.reference}`);
                resolvedEntryStart = resolvedEntriesMap.get(parsedAt.reference)![parsedAt.anchor] + parsedAt.offset;
            } else
                resolvedEntryStart = (lastResolvedEntry?.[parsedAt.anchor] ?? 0) + parsedAt.offset;

            if (resolvedEntryStart < 0)
                resolvedEntryStart = 0;

            const resolvedEntry = SequenceEntryResolver.resolve(start + (sequence.options.delay ?? 0) + resolvedEntryStart, entry);
            resolvedEntriesMap.set(name, lastResolvedEntry = resolvedEntry);
            resolvedEntries.push(resolvedEntry);
        }

        const {referenceableEnd} = lastResolvedEntry!;
        if (sequence.options.repeatCount) {
            resolvedEntries.forEach(entry => {
                if (entry === lastResolvedEntry) return;
                entry.addEndDelay((sequence.options.repeatDelay ?? 0) + (referenceableEnd - entry.referenceableEnd));
            });
        }
        return new ResolvedSequence(start, referenceableEnd);
    }
}

declare class SequenceEntryResolver {
    static resolve(resolvedStart: number, entry: SequenceEntry): ResolvedSequenceEntry;
}

class ResolvedSequence {
    constructor(
        readonly start: number,
        readonly referenceableEnd: number,
    ) {}
}

declare class ResolvedSequenceEntry {
    readonly start: number;
    readonly referenceableEnd: number;
    readonly totalDuration: number;

    get endDelay(): number;

    addEndDelay(endDelay: number): void;
}