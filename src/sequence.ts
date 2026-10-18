import type {
    At,
    TimedTweenAnimationEntry,
    NestedSequenceEntry, RepeatOptions, Seconds,
    SequenceEntries,
    SequenceEntry,
    SimpleAnimationEntry
} from "./types.js";
import type {SimpleAnimation, TimedTweenAnimation} from "./animation.js";
import {checkNumber, clampedDelay, clampedRepeats} from "./utils.js";

export class SequenceBuilder<SE extends SequenceEntries = {}> {
    private readonly names: string[] = [];
    private readonly entries: { [name: string]: SequenceEntry } = {};

    add<N extends string>(
        name: N,
        animation: SimpleAnimation,
        at?: At<keyof SE & string>
    ): SequenceBuilder<SE & { [_ in N]: SimpleAnimationEntry<keyof SE & string> }>;

    add<N extends string, A extends TimedTweenAnimation<string[]>>(
        name: N,
        animation: A,
        at?: At<keyof SE & string>
    ): SequenceBuilder<SE & { [_ in N]: TimedTweenAnimationEntry<A, keyof SE & string> }>;

    add<N extends string, NS extends Sequence>(
        name: N,
        sequence: NS,
        at?: At<keyof SE & string>
    ): SequenceBuilder<SE & { [_ in N]: NestedSequenceEntry<NS, keyof SE & string>; }>;

    add<N extends string>(
        name: N,
        definition: SimpleAnimation | TimedTweenAnimation<string[]> | Sequence,
        at?: At<string>
    ): SequenceBuilder<SE & { [_ in N]: SequenceEntry }> {
        if (Object.hasOwn(this.entries, name))
            throw new Error(`An entry named "${name}" already exists in this sequence.`);
        if (/\W/.test(name))
            throw new Error(`The entry name "${name}" can only contain letters, digits and underscores.`);

        this.names.push(name);
        const placement = {...(at !== undefined && {at})};
        if (definition instanceof Sequence)
            this.entries[name] = {sequence: definition, ...placement};
        else if (definition.type === 'simple')
            this.entries[name] = {animation: definition, ...placement};
        else
            this.entries[name] = {animation: definition, ...placement};

        return this;
    }

    build(options: SequenceOptions = {}): Sequence<{ [K in keyof SE]: SE[K] }> {
        checkNumber(options.delay, "The sequence's delay");
        checkNumber(options.repeatDelay, "The sequence's repeat delay");
        checkNumber(options.repeatCount, "The sequence's repeat count", {allowInfinity: true});

        return new Sequence(this.names, this.entries as { [K in keyof SE]: SE[K] }, clampedDelay(clampedRepeats(options)));
    }
}

export interface SequenceOptions extends RepeatOptions {
    delay?: Seconds;
}

export class Sequence<SE extends SequenceEntries = SequenceEntries> {
    constructor(
        readonly names: readonly string[],
        readonly entries: SE,
        readonly options: SequenceOptions = {}
    ) {}

    static builder(): SequenceBuilder {
        return new SequenceBuilder();
    }
}
