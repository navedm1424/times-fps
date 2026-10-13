
import type {
    At,
    MultiTweenAnimationEntry,
    NestedSequenceEntry, RepeatOptions, Seconds,
    SequenceEntries,
    SequenceEntry,
    SimpleAnimationEntry
} from "./types.js";
import type {MultiTweenAnimation, SimpleAnimation} from "./animation.js";

export class SequenceBuilder<SE extends SequenceEntries = {}> {
    private readonly entries: SequenceEntries = {};

    add<N extends string>(
        name: N,
        animation: SimpleAnimation,
        at?: SimpleAnimationEntry<keyof SE & string>["at"]
    ): SequenceBuilder<SE & { [_ in N]: SimpleAnimationEntry<keyof SE & string> }>;

    add<N extends string, A extends MultiTweenAnimation<string[]>>(
        name: N,
        animation: A,
        at?: MultiTweenAnimationEntry<A, keyof SE & string>["at"]
    ): SequenceBuilder<SE & { [_ in N]: MultiTweenAnimationEntry<A, keyof SE & string> }>;

    add<N extends string, NS extends Sequence>(
        name: N,
        sequence: NS,
        at?: NestedSequenceEntry<NS, keyof SE & string>["at"]
    ): SequenceBuilder<SE & { [_ in N]: NestedSequenceEntry<NS, keyof SE & string>; }>;

    add(
        name: string,
        definition: SimpleAnimation | MultiTweenAnimation<string[]> | Sequence,
        at?: At<string>
    ): SequenceBuilder<SequenceEntries> {
        if (Object.hasOwn(this.entries, name)) {
            throw new Error(`An entry named "${name}" already exists in this sequence.`);
        }
        const placement = {...(at !== undefined && {at})};
        if (definition instanceof Sequence) {
            this.entries[name] = {sequence: definition, ...placement};
        } else if (definition.type === 'simple') {
            this.entries[name] = {animation: definition, ...placement};
        } else {
            this.entries[name] = {animation: definition, ...placement};
        }
        return this;
    }

    build(options: SequenceOptions = {}): Sequence<{ [K in keyof SE]: SE[K] }> {
        if (options.repeatCount === Infinity && Object.values(this.entries).some(repeatsInfinitely)) {
            throw new RangeError("A sequence containing an infinitely repeating entry can't repeat infinitely.");
        }
        return new Sequence({...this.entries} as { [K in keyof SE]: SE[K] }, options);
    }
}

function repeatsInfinitely(entry: SequenceEntry): boolean {
    if ('animation' in entry) return entry.animation.options.repeatCount === Infinity;
    return entry.sequence.options.repeatCount === Infinity || Object.values<SequenceEntry>(entry.sequence.entries).some(repeatsInfinitely);
}

export interface SequenceOptions extends RepeatOptions {
    delay?: Seconds;
}

export class Sequence<SE extends SequenceEntries = {}> {
    constructor(readonly entries: SE, readonly options: SequenceOptions = {}) {}

    static builder(): SequenceBuilder {
        return new SequenceBuilder();
    }
}
