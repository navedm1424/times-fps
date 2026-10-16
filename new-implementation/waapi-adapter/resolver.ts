import {Sequence} from "../sequence.js";
import type {
    NestedSequenceEntry,
    RepeatOptions,
    Seconds,
    SequenceEntries,
    SequenceEntry,
    SimpleAnimationEntry
} from "../types.js";
import {checkNumber, type EntryReferences, parseAt} from "../utils.js";
import {SimpleAnimation} from "../animation.js";
import {resolveTransition, type TransitionCurve} from "./transition-curve.js";
import {PropertyValues, type RawValueStops} from "./stops.js";
import {AnimationEffectsResolver, AnimationKeyframesResolver, type ResolvedAnimationEffect} from "./animation-effects.js";

export type SimpleAnimationMapping = {
    target: Element | Element[];
    values: {
        [propertyName: string]: RawValueStops;
    };
};
export type SequenceMapping<SE extends SequenceEntries = SequenceEntries> = {
    [N in keyof SE]: SE[N] extends NestedSequenceEntry<Sequence<infer NSE>>
        ? SequenceMapping<NSE>
        : SE[N] extends SimpleAnimationEntry
            ? SimpleAnimationMapping
            : never;
};

export class SimpleAnimationResolver implements SequenceEntryResolver {
    readonly targets: Element[];
    readonly targetDelays: Seconds[];
    readonly playDuration: Seconds;
    readonly totalDuration: Seconds;
    readonly curve: TransitionCurve;
    readonly propertyValues: PropertyValues;
    /** The animation's own first, then each enclosing sequence's, compounding on the ones before. */
    readonly repeatOptions: RepeatOptions[];

    constructor(readonly start: number, animation: SimpleAnimation, mapping: SimpleAnimationMapping) {
        const {duration, curve} = resolveTransition(animation.transition);
        const {delay = 0, ...repeatOptions} = animation.options;
        const targets = [mapping.target].flat();
        this.targets = targets;
        this.targetDelays = targets.map((_, index) => {
            if (typeof delay === 'number') return delay;
            return Math.max(0, checkNumber(delay(index, targets.length), `The staggered delay of target ${index}`));
        });
        this.playDuration = duration;
        this.totalDuration = repeatedDuration(duration, repeatOptions);
        this.curve = curve;
        // Validating the interpolation
        this.propertyValues = PropertyValues.of(mapping.values);
        this.repeatOptions = [repeatOptions];
        this.referenceableEnd =
            start + Math.max(0, ...this.targetDelays) +
            (Number.isFinite(this.totalDuration) ? this.totalDuration : duration);
    }

    readonly referenceableEnd: number;

    addRepeat(options: RepeatOptions) {
        this.repeatOptions.push(options);
    }

    resolve(): Map<Element, ResolvedAnimationEffect[]> {
        if (this.playDuration === 0) return new Map();

        const keyframesResolver = new AnimationKeyframesResolver(this.propertyValues, this.curve);
        const effectsResolver = AnimationEffectsResolver.of(this.playDuration, keyframesResolver, this.repeatOptions[0] ?? {});
        return new Map(this.targets.map((target, index) => [target, effectsResolver.resolve(this.start + this.targetDelays[index]!)]));
    }
}

export class SequenceResolver<SE extends SequenceEntries> implements SequenceEntryResolver {
    readonly referenceableEnd: number;
    readonly totalDuration: number;
    constructor(
        readonly start: number,
        readonly delay: Seconds,
        readonly names: readonly (keyof SE)[],
        readonly entryResolvers: Map<keyof SE, SequenceEntryResolver>,
        readonly repeatOptions: RepeatOptions
    ) {
        const iterationStart = start + delay;
        const entries = [...this.entryResolvers.values()];
        const iterationDuration = Math.max(0, ...entries.map(entry => entry.referenceableEnd - iterationStart));
        const playsDuration = repeatedDuration(iterationDuration, repeatOptions);

        this.referenceableEnd = iterationStart + (Number.isFinite(playsDuration) ? playsDuration : iterationDuration);
        this.totalDuration = entries.some(entry => !Number.isFinite(entry.totalDuration)) ? Infinity : playsDuration;
        this.repeatEntries(iterationDuration, this.repeatOptions);
    }

    static of<SE extends SequenceEntries>(start: number, sequence: Sequence<SE>, mapping?: SequenceMapping<SE>) {
        if (sequence.names.length === 0)
            throw new Error("Sequence must not be empty.");
        this.validateMapping(sequence, mapping);

        const {delay = 0, ...repeatOptions} = sequence.options;
        const iterationStart = start + delay;

        let lastReferences: EntryReferences | undefined;
        const referencesMap = new Map<keyof SE, EntryReferences>();
        const resolversMap = new Map<keyof SE, SequenceEntryResolver>();
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const parsedAt = parseAt(entry.at ?? "+0");

            let resolvedEntryStart: number;
            if (parsedAt.kind === 'absolute')
                resolvedEntryStart = checkNumber(parsedAt.time, `Entry "${String(name)}"'s position`);
            else {
                checkNumber(parsedAt.offset, `Entry "${String(name)}"'s position offset`);
                if (parsedAt.reference) {
                    if (!referencesMap.has(parsedAt.reference))
                        throw new Error(`Invalid reference at: ${parsedAt.reference}`);
                    resolvedEntryStart = referencesMap.get(parsedAt.reference)![parsedAt.anchor] + parsedAt.offset;
                } else
                    resolvedEntryStart = (lastReferences?.[parsedAt.anchor] ?? 0) + parsedAt.offset;
            }

            if (resolvedEntryStart < 0)
                resolvedEntryStart = 0;

            const resolvedEntry = this.getEntryResolver(iterationStart + resolvedEntryStart, entry, mapping[name]!);
            resolversMap.set(name, resolvedEntry);
            referencesMap.set(name, lastReferences = {
                start: resolvedEntryStart,
                end: resolvedEntry.referenceableEnd - iterationStart
            });
        }

        return new SequenceResolver(start, delay, sequence.names, resolversMap, repeatOptions);
    }

    private static validateMapping<SE extends SequenceEntries>(sequence: Sequence<SE>, mapping?: SequenceMapping<SE>): asserts mapping is SequenceMapping<SE> {
        if (!mapping)
            throw new Error("Invalid mapping");
        for (const name of sequence.names) {
            if (!Object.hasOwn(mapping, name))
                throw new Error(`No mapping present for ${name}`);
        }
    }
    private static getEntryResolver(start: number, entry: SequenceEntry, mapping: SimpleAnimationMapping | SequenceMapping): SequenceEntryResolver {
        if ("animation" in entry && entry.animation instanceof SimpleAnimation)
            return new SimpleAnimationResolver(start, entry.animation, mapping as SimpleAnimationMapping);
        if ("sequence" in entry && entry.sequence instanceof Sequence)
            return SequenceResolver.of(start, entry.sequence, mapping as SequenceMapping);
        throw new Error("Unsupported sequence entry");
    }

    addRepeat(options: RepeatOptions) {
        this.repeatEntries(this.totalDuration, options);
    }

    /** Each entry comes back once the span and the repeat delay pass, so its own repeat delay is whatever its plays leave of that. */
    private repeatEntries(span: Seconds, options: RepeatOptions) {
        const {repeatCount, repeatDelay = 0} = options;
        if (!repeatCount) return;

        for (const [name, entry] of this.entryResolvers) {
            const totalDuration = checkNumber(entry.totalDuration, `The total duration of entry "${String(name)}" in a repeating sequence`);
            entry.addRepeat({...options, repeatDelay: span + repeatDelay - totalDuration});
        }
    }

    resolve(): Map<Element, ResolvedAnimationEffect[]> {
        // TODO: An entry's first effect fills backwards, so a later entry animating the same properties of a target covers the earlier entries' effects on it from the start.
        const effectsByTarget = new Map<Element, ResolvedAnimationEffect[]>();
        for (const entry of this.entryResolvers.values()) {
            for (const [target, effects] of entry.resolve()) {
                const targetEffects = effectsByTarget.get(target);
                if (targetEffects) targetEffects.push(...effects);
                else effectsByTarget.set(target, [...effects]);
            }
        }
        return effectsByTarget;
    }
}

interface SequenceEntryResolver {
    readonly start: number;
    readonly referenceableEnd: number;
    readonly totalDuration: number;

    addRepeat(options: RepeatOptions): void;
    resolve(): Map<Element, ResolvedAnimationEffect[]>;
}

function repeatedDuration(playDuration: Seconds, {repeatCount = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeatCount === Infinity) return Infinity;
    return playDuration * (repeatCount + 1) + repeatDelay * repeatCount;
}