import {AnimationTiming, type AnimationTimingOptions} from "./animation.ts";
import type {At} from "./at.ts";
import {entryPathOf, type EntryPath, SequenceTiming, type SequenceTimingBuilder, type SequenceTimingEntries} from "./sequence.ts";
import type {PlaybackOptions} from "./playback-options.ts";
import {
    type AnimationMapping,
    type AnimationValues,
    checkAnimationValues,
    type MappingTree,
    type SequenceMapping,
    type Target
} from "./dom/mapping.ts";

/** Where an entry goes in a sequence: the name later positions refer to it by, and when it starts. */
export interface EntryPlacementOptions<N extends string, Names extends string> {
    name?: N;
    at?: At<Names>;
}

export type Definition = AnimationDefinition | SequenceDefinition;

/** Defines one animation: which elements, which values, and how it moves through them. */
export function animation(target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions): AnimationDefinition {
    return new AnimationDefinition(target, values, timing);
}

/** A sequence built entry by entry, or a sequence timing given with its mapping. */
export function sequence(): SequenceDefinitionBuilder;
export function sequence<Timing extends SequenceTiming>(timing: Timing, mapping: SequenceMapping<Timing>): SequenceDefinition;
export function sequence(timing?: SequenceTiming, mapping?: SequenceMapping): SequenceDefinitionBuilder | SequenceDefinition {
    if (!timing) return new SequenceDefinitionBuilder();
    return new SequenceDefinition(timing, mappingTreeOf(timing, mapping, undefined));
}

/** A timing bound to targets and values, ready to play any number of times. */
export class AnimationDefinition {
    /** @internal */
    readonly timing: AnimationTiming;
    /** @internal */
    readonly target: Target;
    /** @internal */
    readonly values: AnimationValues;

    /** @internal */
    constructor(target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions) {
        checkAnimationValues(values);
        this.timing = timing instanceof AnimationTiming ? timing : AnimationTiming.of(timing);
        this.target = target;
        this.values = values;
    }
}

/** Timings laid out in time and bound to targets and values, ready to play any number of times. */
export class SequenceDefinition {
    /** @internal */
    readonly timing: SequenceTiming;
    /** @internal */
    readonly mapping: SequenceMapping;

    /** @internal */
    constructor(timing: SequenceTiming, mapping: SequenceMapping) {
        this.timing = timing;
        this.mapping = mapping;
    }
}

/** An entry as it's added, before the unnamed ones get their names. */
interface PendingEntry {
    name: string | undefined;
    at: At | undefined;
    definition: Definition;
}

type InlineEntryArgs = [
    target: Target,
    values: AnimationValues,
    timing: AnimationTiming | AnimationTimingOptions,
    placement?: EntryPlacementOptions<string, string>
];
type DefinitionEntryArgs = [definition: Definition, placement?: EntryPlacementOptions<string, string>];

/** Builds a sequence definition; every `add` gives a new builder, and positions can refer to the entries named before them. */
export class SequenceDefinitionBuilder<Names extends string = never> {
    /** @internal */
    constructor(private readonly entries: readonly PendingEntry[] = []) {}

    add<N extends string = never>(
        target: Target,
        values: AnimationValues,
        timing: AnimationTiming | AnimationTimingOptions,
        placement?: EntryPlacementOptions<N, Names>
    ): SequenceDefinitionBuilder<Names | N>;
    add<N extends string = never>(
        definition: Definition,
        placement?: EntryPlacementOptions<N, Names>
    ): SequenceDefinitionBuilder<Names | N>;
    add(...args: InlineEntryArgs | DefinitionEntryArgs): SequenceDefinitionBuilder<string> {
        const [definition, {name, at}] = this.#isDefinitionEntry(args) ? [args[0], args[1] ?? {}] : this.#inlineEntryOf(args);
        return new SequenceDefinitionBuilder([...this.entries, {name, at, definition}]);
    }

    #isDefinitionEntry(args: InlineEntryArgs | DefinitionEntryArgs): args is DefinitionEntryArgs {
        return args[0] instanceof AnimationDefinition || args[0] instanceof SequenceDefinition;
    }
    /** The inline entry's animation, and its placement. */
    #inlineEntryOf([target, values, timing, placement = {}]: InlineEntryArgs): [AnimationDefinition, EntryPlacementOptions<string, string>] {
        return [new AnimationDefinition(target, values, timing), placement];
    }

    /** Names the unnamed entries in order, as `a` to `z`, then `aa` and on, skipping the names given. */
    build(options: PlaybackOptions = {}): SequenceDefinition {
        const givenNames = new Set(this.givenNames);
        let builder: SequenceTimingBuilder<SequenceTimingEntries> = SequenceTiming.builder();
        const mappings: { [name: string]: MappingTree } = {};
        let ordinal = 0;
        const nextUnnamedName = () => {
            let name: string;
            do name = alphabeticNameOf(ordinal++);
            while (givenNames.has(name));
            return name;
        };
        for (const {name: givenName, at, definition} of this.entries) {
            const name = givenName ?? nextUnnamedName();
            if (definition instanceof SequenceDefinition) {
                builder = builder.add(definition.timing, name, at);
                mappings[name] = definition.mapping;
            } else {
                builder = builder.add(definition.timing, name, at);
                mappings[name] = [definition.target, definition.values];
            }
        }
        return new SequenceDefinition(builder.build(options), mappings);
    }

    private get givenNames(): string[] {
        return this.entries.flatMap(({name}) => name === undefined ? [] : [name]);
    }
}

/** The mapping of a sequence timing as a tree; every entry must be mapped, and every animation's values must take one of the forms. */
function mappingTreeOf(sequence: SequenceTiming, mapping: { readonly [name: string]: unknown } | undefined, path: EntryPath | undefined): SequenceMapping {
    if (!mapping) throw new TypeError(path ? `No mapping present for "${path}".` : "No mapping present.");
    const entries: { [name: string]: MappingTree } = {};
    for (const entry of sequence.entries) {
        const entryPath = entryPathOf(path, entry.name);
        const entryMapping = mapping[entry.name];
        if (!entryMapping) throw new TypeError(`No mapping present for "${entryPath}".`);
        if ('sequence' in entry) {
            entries[entry.name] = mappingTreeOf(entry.sequence, entryMapping as { readonly [name: string]: unknown }, entryPath);
            continue;
        }
        if (!Array.isArray(entryMapping)) throw new TypeError(`The mapping of "${entryPath}" needs a target and values.`);
        const [target, values] = entryMapping as AnimationMapping;
        if (target === undefined || values === undefined)
            throw new TypeError(`The mapping of "${entryPath}" needs a target and values.`);
        checkAnimationValues(values);
        entries[entry.name] = [target, values];
    }
    return entries;
}

/** `a` for 0 to `z` for 25, then `aa`, `ab` and on. */
function alphabeticNameOf(index: number): string {
    let name = '';
    for (let remaining = index + 1; remaining > 0; remaining = Math.floor((remaining - 1) / 26))
        name = String.fromCharCode('a'.charCodeAt(0) + (remaining - 1) % 26) + name;
    return name;
}
