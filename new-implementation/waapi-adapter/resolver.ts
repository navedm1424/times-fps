import {Sequence} from "../sequence.js";
import type {RepeatOptions, Seconds, SequenceEntries, SequenceEntry} from "../types.js";
import {checkNumber, parseAt} from "../utils.js";
import type {SimpleAnimation} from "../animation.js";
import {resolveTransition, type TransitionCurve} from "./transition-curve.js";
import {PropertyValues, type RawValueStops} from "./stops.js";
import {AnimationEffectsResolver, AnimationKeyframesResolver, type ResolvedAnimationEffect} from "./animation-effects.js";

export type SimpleAnimationMapping = {
    target: Element | Element[];
    values: {
        [propertyName: string]: RawValueStops;
    };
};

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
        const {delay = 0, ...repeatOptions} = animation.options;
        const targets = [mapping.target].flat();
        this.targets = targets;
        this.targetDelays = targets.map((_, index) => {
            if (typeof delay === 'number') return delay;
            return Math.max(0, checkNumber(delay(index, targets.length), `The staggered delay of target ${index}`));
        });
        this.playDuration = duration;
        this.totalDuration = this.repeatedDuration(duration, repeatOptions);
        this.curve = curve;
        // Validating the interpolation
        this.propertyValues = PropertyValues.of(mapping.values);
        this.repeatOptions = [repeatOptions];
    }

    private repeatedDuration(playDuration: Seconds, {repeatCount = 0, repeatDelay = 0}: RepeatOptions): Seconds {
        if (repeatCount === Infinity) return Infinity;
        return playDuration * (repeatCount + 1) + repeatDelay * repeatCount;
    }

    addRepeat(options: RepeatOptions) {
        this.repeatOptions.push(options);
    }

    resolve(): Map<Element, ResolvedAnimationEffect[]> {
        if (this.playDuration === 0) return new Map();

        const keyframesResolver = new AnimationKeyframesResolver(this.propertyValues, this.curve);
        const effectsResolver = AnimationEffectsResolver.of(this.playDuration, keyframesResolver, this.repeatOptions[0] ?? {});
        return new Map(this.targets.map((target, index) => [target, effectsResolver.resolve(this.targetDelays[index]!)]));
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