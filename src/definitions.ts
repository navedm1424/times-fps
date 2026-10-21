import {AnimationTiming, type AnimationTimingDescriptor} from "./animation.js";
import type {At} from "./at.js";
import {SequenceTiming, type SequenceTimingBuilder, type SequenceTimingEntries} from "./sequence.js";
import type {SequencePlaybackOptions} from "./playback-options.js";
import {WAAPIAnimator} from "./waapi/animator.js";
import type {AnimationControls} from "./waapi/controls.js";
import {type AnimationMapping, type AnimationValues, type MappingTree, type SequenceMapping, type PlayOptions, type SequenceMappingNode, type Target} from "./dom/mapping.js";

/** A timing for each property of the values. */
export type PropertyTimings<Values extends AnimationValues> = {
    [Property in keyof Values]: AnimationTiming | AnimationTimingDescriptor;
};

/** Where an entry goes in a sequence: the name later positions refer to it by, and when it starts. */
export interface EntryPlacementOptions<N extends string, Names extends string> {
    name?: N;
    at?: At<Names>;
}

export type Definition = AnimationDefinition | SequenceDefinition;

/** A timing with the mapping of the same shape, which is what playing and nesting a definition take. */
type MappedTiming =
    | { timing: AnimationTiming; mapping: AnimationMapping }
    | { timing: SequenceTiming; mapping: SequenceMappingNode };

export function animation(target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingDescriptor): AnimationDefinition;
export function animation<Values extends AnimationValues>(target: Target, values: Values, timing: PropertyTimings<Values>): AnimationDefinition;
/** Defines one animation: which elements, which values, and how it moves through them. */
export function animation<Values extends AnimationValues>(
    target: Target,
    values: Values,
    timing: AnimationTiming | AnimationTimingDescriptor | PropertyTimings<Values>
): AnimationDefinition {
    return new AnimationDefinition(target, values, timing);
}

/** A sequence built entry by entry, or a sequence timing given with its mapping. */
export function sequence(): SequenceDefinitionBuilder;
export function sequence<Timing extends SequenceTiming>(timing: Timing, mapping: SequenceMapping<Timing>): SequenceDefinition;
export function sequence(timing?: SequenceTiming, mapping?: SequenceMapping<SequenceTiming>): SequenceDefinitionBuilder | SequenceDefinition {
    if (!timing) return new SequenceDefinitionBuilder();
    return new SequenceDefinition({timing, mapping: mappingTreeOf(timing, mapping, undefined)});
}

/** A timing bound to targets and values, ready to play any number of times. */
export class AnimationDefinition {
    /** @internal */
    readonly mappedTiming: MappedTiming;

    /** @internal */
    constructor(
        target: Target,
        values: AnimationValues,
        timing: AnimationTiming | AnimationTimingDescriptor | PropertyTimings<AnimationValues>
    ) {
        const mapping: AnimationMapping = {target, values};
        if (!isPropertyTimings(timing)) {
            this.mappedTiming = {timing: timing instanceof AnimationTiming ? timing : AnimationTiming.of(timing), mapping};
            return;
        }

        const properties = Object.keys(values);
        const untimed = properties.find(property => !Object.hasOwn(timing, property));
        if (untimed !== undefined) throw new TypeError(`"${untimed}" has no timing.`);
        const unknown = Object.keys(timing).find(property => !Object.hasOwn(values, property));
        if (unknown !== undefined) throw new TypeError(`"${unknown}" has a timing but no values.`);

        const timings = Object.fromEntries(properties.map(property => {
            const propertyTiming = timing[property]!;
            return [property, propertyTiming instanceof AnimationTiming ? propertyTiming : AnimationTiming.of(propertyTiming)];
        }));
        this.mappedTiming = propertySplitOf(mapping, timings);
    }

    play(options?: PlayOptions): AnimationControls {
        return playMapped(this.mappedTiming, options);
    }
}

/** Timings laid out in time and bound to targets and values, ready to play any number of times. */
export class SequenceDefinition {
    /** @internal */
    readonly mappedTiming: MappedTiming;

    /** @internal */
    constructor(mappedTiming: { timing: SequenceTiming; mapping: SequenceMappingNode }) {
        this.mappedTiming = mappedTiming;
    }

    play(options?: PlayOptions): AnimationControls {
        return playMapped(this.mappedTiming, options);
    }
}

/** An entry as it's added, before the unnamed ones get their names. */
interface PendingEntry {
    name: string | undefined;
    at: At<string> | undefined;
    definition: Definition;
}

type InlineEntryArgs = [
    target: Target,
    values: AnimationValues,
    timing: AnimationTiming | AnimationTimingDescriptor | PropertyTimings<AnimationValues>,
    placement?: EntryPlacementOptions<string, string>
];
type DefinitionEntryArgs = [definition: Definition, placement?: EntryPlacementOptions<string, string>];

/** Builds a sequence definition; every `add` gives a new builder, and positions can refer to the entries named before them. */
export class SequenceDefinitionBuilder<Names extends string = never> {
    /** @internal */
    constructor(private readonly entries: readonly PendingEntry[] = []) {}

    add<Values extends AnimationValues, N extends string = never>(
        target: Target,
        values: Values,
        timing: AnimationTiming | AnimationTimingDescriptor | PropertyTimings<Values>,
        placement?: EntryPlacementOptions<N, Names>
    ): SequenceDefinitionBuilder<Names | N>;
    add<N extends string = never>(
        definition: Definition,
        placement?: EntryPlacementOptions<N, Names>
    ): SequenceDefinitionBuilder<Names | N>;
    add(...args: InlineEntryArgs | DefinitionEntryArgs): SequenceDefinitionBuilder<string> {
        const [definition, {name, at}] = isDefinitionEntry(args) ? [args[0], args[1] ?? {}] : inlineEntryOf(args);
        return new SequenceDefinitionBuilder([...this.entries, {name, at, definition}]);
    }

    /** Names the unnamed entries in order, as `a` to `z`, then `aa` and on, skipping the names given. */
    build(options: SequencePlaybackOptions = {}): SequenceDefinition {
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
            const {mappedTiming} = definition;
            builder = mappedTiming.timing instanceof SequenceTiming
                ? builder.add(name, mappedTiming.timing, at)
                : builder.add(name, mappedTiming.timing, at);
            mappings[name] = mappedTiming.mapping;
        }
        return new SequenceDefinition({timing: builder.build(options), mapping: {entries: mappings, splitsProperties: false}});
    }

    private get givenNames(): string[] {
        return this.entries.flatMap(({name}) => name === undefined ? [] : [name]);
    }
}

function playMapped({timing, mapping}: MappedTiming, options: PlayOptions | undefined): AnimationControls {
    return WAAPIAnimator.play(timing, mapping, options);
}

function isDefinitionEntry(args: InlineEntryArgs | DefinitionEntryArgs): args is DefinitionEntryArgs {
    return args[0] instanceof AnimationDefinition || args[0] instanceof SequenceDefinition;
}

/** The inline entry's animation, and its placement. */
function inlineEntryOf([target, values, timing, placement = {}]: InlineEntryArgs): [AnimationDefinition, EntryPlacementOptions<string, string>] {
    return [new AnimationDefinition(target, values, timing), placement];
}

/** The keys only a transition has, as a number; a property timing is an object, so a property that shares one of their names isn't taken for one. */
const transitionMarkers = ['duration', 'visualDuration', 'stiffness', 'damping'] as const;

function isPropertyTimings(
    timing: AnimationTiming | AnimationTimingDescriptor | PropertyTimings<AnimationValues>
): timing is PropertyTimings<AnimationValues> {
    if (timing instanceof AnimationTiming) return false;
    return !transitionMarkers.some(key => typeof (timing as { [key: string]: unknown })[key] === 'number');
}

/** An entry for each property, all starting together on the same target, as a sequence whose level animation ids leave out. */
function propertySplitOf(mapping: AnimationMapping, timings: { readonly [property: string]: AnimationTiming }): MappedTiming {
    let builder: SequenceTimingBuilder<SequenceTimingEntries> = SequenceTiming.builder();
    const mappings: { [name: string]: MappingTree } = {};
    Object.entries(timings).forEach(([property, timing], index) => {
        const name = alphabeticNameOf(index);
        builder = builder.add(name, timing, '<');
        mappings[name] = {...mapping, values: {[property]: mapping.values[property]!}};
    });
    return {timing: builder.build(), mapping: {entries: mappings, splitsProperties: true}};
}

/** The mapping of a sequence timing as a tree; every entry must be mapped. */
function mappingTreeOf(sequence: SequenceTiming, mapping: { readonly [name: string]: unknown } | undefined, path: string | undefined): SequenceMappingNode {
    if (!mapping) throw new TypeError(path ? `No mapping present for "${path}".` : "No mapping present.");
    const entries: { [name: string]: MappingTree } = {};
    for (const name of sequence.names) {
        const entry = sequence.entries[name]!;
        const entryPath = path ? `${path}>${name}` : name;
        const entryMapping = mapping[name];
        if (!entryMapping) throw new TypeError(`No mapping present for "${entryPath}".`);
        if ('sequence' in entry) {
            entries[name] = mappingTreeOf(entry.sequence, entryMapping as { readonly [name: string]: unknown }, entryPath);
            continue;
        }
        const {target, values} = entryMapping as AnimationMapping;
        if (target === undefined || values === undefined)
            throw new TypeError(`The mapping of "${entryPath}" needs a target and values.`);
        entries[name] = {target, values};
    }
    return {entries, splitsProperties: false};
}

/** `a` for 0 to `z` for 25, then `aa`, `ab` and on. */
function alphabeticNameOf(index: number): string {
    let name = '';
    for (let remaining = index + 1; remaining > 0; remaining = Math.floor((remaining - 1) / 26))
        name = String.fromCharCode('a'.charCodeAt(0) + (remaining - 1) % 26) + name;
    return name;
}
