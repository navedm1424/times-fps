import {AnimationTiming, type AnimationTimingDescriptor, type TimedTweenTiming} from "./animation.ts";
import {type At, checkPositionDescriptor, parsePositionDescriptor, type PositionDescriptor} from "./at.ts";
import {checkPlaybackOptions, clampedDelay, clampedRepeats, type SequencePlaybackOptions} from "./playback-options.ts";

export interface AnimationTimingEntry<N extends string = string> {
    timing: AnimationTiming;
    position: PositionDescriptor<N>;
}
export interface SubsequenceTimingEntry<NS extends SequenceTiming = SequenceTiming, N extends string = string> {
    sequence: NS;
    position: PositionDescriptor<N>;
}

export type SequenceTimingEntry = AnimationTimingEntry | SubsequenceTimingEntry;

export type SequenceTimingEntries = {
    readonly [name: string]: SequenceTimingEntry;
};

const SEQUENCE_TIMING_CONSTRUCTION_LICENSE = Symbol("SequenceTimingConstructionLicense");

function createSequenceTimingBuilder(): SequenceTimingBuilder {
    return new (SequenceTimingBuilder as any)([], {}, SEQUENCE_TIMING_CONSTRUCTION_LICENSE);
}
function createSequenceTiming<Entries extends SequenceTimingEntries>(names: readonly string[], entries: Entries, options?: SequencePlaybackOptions): SequenceTiming<Entries> {
    return new (SequenceTiming as any)(names, entries, options, SEQUENCE_TIMING_CONSTRUCTION_LICENSE);
}

/** Builds a sequence timing; every `add` gives a new builder, so branches never share entries. */
export class SequenceTimingBuilder<SE extends SequenceTimingEntries = {}> {
    #names: readonly string[];
    #entries: SequenceTimingEntries;

    private constructor(
        names: readonly string[] = [],
        entries: SequenceTimingEntries = {},
        license?: typeof SEQUENCE_TIMING_CONSTRUCTION_LICENSE
    ) {
        if (license !== SEQUENCE_TIMING_CONSTRUCTION_LICENSE)
            throw new TypeError(`Use ${SequenceTiming.name}.${SequenceTiming.builder.name} to create a ${SequenceTimingBuilder.name}.`);
        this.#names = names;
        this.#entries = entries;
    }

    #addEntry<N extends string>(name: N, entry: SequenceTimingEntry): SequenceTimingBuilder<SE & { [_ in N]: SequenceTimingEntry }> {
        return new SequenceTimingBuilder([...this.#names, name], {...this.#entries, [name]: entry}, SEQUENCE_TIMING_CONSTRUCTION_LICENSE);
    }

    add<N extends string>(
        name: N,
        timing: AnimationTiming | AnimationTimingDescriptor,
        at?: At<keyof SE & string>
    ): SequenceTimingBuilder<SE & { [_ in N]: AnimationTimingEntry<keyof SE & string> }>;

    // add<N extends string, A extends TimedTweenTiming<string[]>>(
    //     name: N,
    //     timing: A,
    //     at?: At<keyof SE & string>
    // ): SequenceTimingBuilder<SE & { [_ in N]: TimedTweenTimingEntry<A, keyof SE & string> }>;

    add<N extends string, NS extends SequenceTiming>(
        name: N,
        sequence: NS,
        at?: At<keyof SE & string>
    ): SequenceTimingBuilder<SE & { [_ in N]: SubsequenceTimingEntry<NS, keyof SE & string>; }>;

    add<N extends string>(
        name: N,
        timing: AnimationTiming | AnimationTimingDescriptor | SequenceTiming,
        at?: At<string>
    ): SequenceTimingBuilder<SE & { [_ in N]: SequenceTimingEntry }> {
        checkNewName(name, this.#names);
        const position = parsePositionDescriptor(at ?? '>');
        checkPositionDescriptor(`Entry "${name}"`, position, this.#names);

        const entry: SequenceTimingEntry = timing instanceof SequenceTiming
            ? {sequence: timing, position}
            : {timing: timing instanceof AnimationTiming ? timing : AnimationTiming.of(timing), position};
        return this.#addEntry(name, entry);
    }

    build(options: SequencePlaybackOptions = {}): SequenceTiming<{ [K in keyof SE]: SE[K] }> {
        if (this.#names.length === 0)
            throw new Error("A sequence needs at least one entry.");
        checkPlaybackOptions(options, "The sequence");
        options = clampedDelay(clampedRepeats(options));
        return createSequenceTiming(this.#names, this.#entries as { [K in keyof SE]: SE[K] }, options);
    }
}

/** Named timings laid out in time, without targets or values. */
export class SequenceTiming<SE extends SequenceTimingEntries = SequenceTimingEntries> {
    private constructor(
        readonly names: readonly string[],
        readonly entries: SE,
        readonly options: SequencePlaybackOptions = {},
        license?: typeof SEQUENCE_TIMING_CONSTRUCTION_LICENSE
    ) {
        if (license !== SEQUENCE_TIMING_CONSTRUCTION_LICENSE)
            throw new TypeError(`A ${SequenceTiming.name} can only be created using ${SequenceTimingBuilder.name}.`);
    }

    static builder() {
        return createSequenceTimingBuilder();
    }
}

/** A name must be unique among the entries before it, and only contain letters, digits and underscores. */
export function checkNewName(name: string, earlierNames: readonly string[]): void {
    if (earlierNames.includes(name))
        throw new Error(`An entry named "${name}" already exists in this sequence.`);
    if (!/^\w+$/.test(name))
        throw new Error(`The entry name "${name}" can only contain letters, digits and underscores.`);
}
