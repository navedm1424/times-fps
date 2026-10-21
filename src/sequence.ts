import {AnimationTiming, type AnimationTimingDescriptor, animationTimingOf, type TimedTweenAnimation} from "./animation.js";
import {type At, type ParsedAt, parseAt} from "./at.js";
import {checkPlaybackOptions, clampedDelay, clampedRepeats, type SequencePlaybackOptions} from "./playback-options.js";
import {checkNumber} from "./utils/validation.js";

export interface AnimationTimingEntry<N extends string = string> {
    timing: AnimationTiming;
    at: ParsedAt<N>;
}
export interface SubsequenceTimingEntry<NS extends SequenceTiming = SequenceTiming, N extends string = string> {
    sequence: NS;
    at: ParsedAt<N>;
}

export type SequenceTimingEntry = AnimationTimingEntry | SubsequenceTimingEntry;

export type SequenceTimingEntries = {
    readonly [name: string]: SequenceTimingEntry;
};

/** Builds a sequence timing; every `add` gives a new builder, so branches never share entries. */
export class SequenceTimingBuilder<SE extends SequenceTimingEntries = {}> {
    constructor(
        private readonly names: readonly string[] = [],
        private readonly entries: SequenceTimingEntries = {}
    ) {}

    add<N extends string>(
        name: N,
        timing: AnimationTiming | AnimationTimingDescriptor,
        at?: At<keyof SE & string>
    ): SequenceTimingBuilder<SE & { [_ in N]: AnimationTimingEntry<keyof SE & string> }>;

    // add<N extends string, A extends TimedTweenAnimation<string[]>>(
    //     name: N,
    //     animation: A,
    //     at?: At<keyof SE & string>
    // ): SequenceTimingBuilder<SE & { [_ in N]: TimedTweenAnimationEntry<A, keyof SE & string> }>;

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
        checkNewName(name, this.names);
        const parsedAt = parseAt(at ?? '>');
        checkPosition(`Entry "${name}"`, parsedAt, this.names);

        const entry: SequenceTimingEntry = timing instanceof SequenceTiming
            ? {sequence: timing, at: parsedAt}
            : {timing: animationTimingOf(timing), at: parsedAt};
        return new SequenceTimingBuilder([...this.names, name], {...this.entries, [name]: entry});
    }

    build(options: SequencePlaybackOptions = {}): SequenceTiming<{ [K in keyof SE]: SE[K] }> {
        return new SequenceTiming(this.names, this.entries as { [K in keyof SE]: SE[K] }, options);
    }
}

/** Named timings laid out in time, without targets or values. */
export class SequenceTiming<SE extends SequenceTimingEntries = SequenceTimingEntries> {
    readonly options: SequencePlaybackOptions;

    constructor(
        readonly names: readonly string[],
        readonly entries: SE,
        options: SequencePlaybackOptions = {}
    ) {
        if (names.length === 0)
            throw new Error("A sequence needs at least one entry.");
        names.forEach((name, index) => {
            const earlierNames = names.slice(0, index);
            checkNewName(name, earlierNames);
            const entry: SequenceTimingEntry | undefined = entries[name];
            if (!entry) throw new Error(`The sequence has no entry named "${name}".`);
            checkPosition(`Entry "${name}"`, entry.at, earlierNames);
        });

        checkPlaybackOptions(options, "The sequence");
        this.options = clampedDelay(clampedRepeats(options));
    }

    static builder(): SequenceTimingBuilder {
        return new SequenceTimingBuilder();
    }
}

/** A name must be unique among the entries before it, and only contain letters, digits and underscores. */
export function checkNewName(name: string, earlierNames: readonly string[]): void {
    if (earlierNames.includes(name))
        throw new Error(`An entry named "${name}" already exists in this sequence.`);
    if (!/^\w+$/.test(name))
        throw new Error(`The entry name "${name}" can only contain letters, digits and underscores.`);
}

/** A position's time must be finite, and the entry it refers to must come before it; `entry` names the entry in messages. */
export function checkPosition(entry: string, at: ParsedAt<string>, earlierNames: readonly string[]): void {
    if (at.kind === 'absolute') {
        checkNumber(at.time, `${entry}'s position`);
        return;
    }
    checkNumber(at.offset, `${entry}'s position offset`);
    if (at.reference.kind === 'entry' && !earlierNames.includes(at.reference.name))
        throw new Error(`${entry}'s position refers to "${at.reference.name}", which isn't an earlier entry.`);
}
