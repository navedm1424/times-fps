import {Sequence} from "../sequence.js";
import type {RepeatOptions, SequenceEntries, SequenceEntry, Seconds} from "../types.js";
import {checkNumber, parseAt} from "../utils.js";
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
export interface ResolvedAnimationEffect {
    animation: ResolvedAnimation;
    easing: ResolvedEasing;
    delay: Seconds;
    duration: Seconds;
    iterations: number;
    direction: PlaybackDirection;
    fill: FillMode;
}

/** A stretch of the plays that one effect runs, before it's placed in time. */
type PlaySegment = Omit<ResolvedAnimationEffect, 'delay' | 'fill'>;

export class SimpleAnimationResolver {
    readonly targets: Element[];
    readonly targetDelays: Seconds[];
    readonly playDuration: Seconds;
    readonly totalDuration: Seconds;
    readonly curve: TransitionCurve;
    readonly propertyValues: PropertyValues;
    /** The animation's own first, then each enclosing sequence's, compounding on the ones before. */
    readonly repeatOptions: RepeatOptions[];

    constructor(animation: SimpleAnimation, mapping: SimpleAnimationMapping) {
        const {duration, curve} = resolveTransition(animation.transition);
        const {delay = 0} = animation.options;
        const targets = [mapping.target].flat();
        this.targets = targets;
        this.targetDelays = targets.map((_, index) => {
            if (typeof delay === 'number') return delay;
            return Math.max(0, checkNumber(delay(index, targets.length), `The staggered delay of target ${index}`));
        });
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

    resolveEffects(): Map<Element, ResolvedAnimationEffect[]> {
        if (this.playDuration === 0) return new Map();

        const segments = this.resolveSegments();
        return new Map(this.targets.map((target, index) => [
            target,
            segments.map(segment => ({...segment, delay: segment.delay + this.targetDelays[index]!}))
        ]));
    }

    /**
     * The plays' segments one after another, with delays counted from the start of the plays.
     * The first holds its start values through the target's delay and the last keeps its end values.
     */
    private resolveSegments(): ResolvedAnimationEffect[] {
        const segments = this.layOutPlays();
        let start = 0;
        return segments.map((segment, index) => {
            const isFirst = index === 0;
            const isLast = index === segments.length - 1;
            const fill: FillMode = isFirst && isLast ? 'both' : isFirst ? 'backwards' : isLast ? 'forwards' : 'none';
            const effect = {...segment, delay: start, fill};
            start += segment.duration * segment.iterations;
            return effect;
        });
    }

    private layOutPlays(): PlaySegment[] {
        const {playDuration, curve, propertyValues} = this;
        const {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = this.repeatOptions[0] ?? {};
        const hold = repeatDelay / playDuration;
        const playCount = repeatCount + 1;

        if (repeatCount === 0)
            return [this.playAlone(1, 'normal')];

        if (repeatMode !== 'mirror' && hold === 0)
            return [this.playAlone(playCount, repeatMode === 'reverse' ? 'alternate' : 'normal')];

        const original = AnimationKeyframesResolver.resolve(curve, propertyValues);
        if (repeatMode === 'loop') {
            // [original+hold] × ∞
            if (!Number.isFinite(repeatCount))
                return [this.merged([original], [hold], Infinity)];
            // [original+hold] × repeatCount, then original on its own
            return [this.merged([original], [hold], repeatCount), this.playAlone(1, 'normal', original)];
        }

        const backward = repeatMode === 'mirror'
            ? AnimationKeyframesResolver.resolve(curve, propertyValues.flip())
            : original.reversed();

        // [original+hold, backward+hold] × ∞
        if (!Number.isFinite(repeatCount))
            return [this.merged([original, backward], [hold, hold], Infinity)];

        // [original+hold, backward+hold] × repeatCount/2, then original on its own
        if (playCount % 2 === 1)
            return [this.merged([original, backward], [hold, hold], repeatCount / 2), this.playAlone(1, 'normal', original)];

        // [original+hold, backward+hold] × (playCount−2)/2, then [original+hold, backward] once
        const lastPair = this.merged([original, backward], [hold, 0], 1);
        if (playCount === 2) return [lastPair];
        return [this.merged([original, backward], [hold, hold], (playCount - 2) / 2), lastPair];
    }

    /** One play as an effect of its own, keeping a single easing on the effect rather than in the keyframes; `keyframed` saves resolving the keyframes again. */
    private playAlone(iterations: number, direction: PlaybackDirection, keyframed?: ResolvedAnimation): PlaySegment {
        const {curve, propertyValues, playDuration} = this;
        const {singleEasing} = curve;
        const animation = singleEasing
            ? ResolvedAnimation.ofStops(propertyValues)
            : keyframed ?? AnimationKeyframesResolver.resolve(curve, propertyValues);
        return {animation, easing: singleEasing ?? linear, duration: playDuration, iterations, direction};
    }

    /** Plays laid out one after another, each followed by its hold, with their curves already in the keyframes. */
    private merged(plays: readonly ResolvedAnimation[], holds: readonly number[], iterations: number): PlaySegment {
        return {
            animation: ResolvedAnimation.merge(plays, 0, index => holds[index]!),
            easing: linear,
            duration: holds.reduce((total, hold) => total + this.playDuration * (1 + hold), 0),
            iterations,
            direction: 'normal'
        };
    }
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
                resolvedEntryStart = checkNumber(parsedAt.time, `Entry "${String(name)}"'s position`);
            else {
                checkNumber(parsedAt.offset, `Entry "${String(name)}"'s position offset`);
                if (parsedAt.reference) {
                    if (!resolversMap.has(parsedAt.reference))
                        throw new Error(`Invalid reference at: ${parsedAt.reference}`);
                    resolvedEntryStart = resolversMap.get(parsedAt.reference)![parsedAt.anchor] + parsedAt.offset;
                } else
                    resolvedEntryStart = (lastResolver?.[parsedAt.anchor] ?? 0) + parsedAt.offset;
            }

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