
import type {
    At,
    MultiTweenAnimationEntry,
    NestedSequenceEntry, Repeat,
    SequenceEntries,
    SequenceEntry,
    SimpleAnimationEntry, Stagger
} from "./types.js";
import type {MultiTweenAnimation, SimpleAnimation} from "./animation.js";

export class SequenceBuilder<SE extends SequenceEntries = {}> {
    private readonly entries: SequenceEntries = {};

    add<N extends string>(
        name: N,
        animation: SimpleAnimation,
        at?: SimpleAnimationEntry<keyof SE & string>["at"],
        stagger?: Stagger
    ): SequenceBuilder<SE & { [_ in N]: SimpleAnimationEntry<keyof SE & string> }>;

    add<N extends string, A extends MultiTweenAnimation<string[]>>(
        name: N,
        animation: A,
        at?: MultiTweenAnimationEntry<A, keyof SE & string>["at"],
        stagger?: Stagger
    ): SequenceBuilder<SE & { [_ in N]: MultiTweenAnimationEntry<A, keyof SE & string> }>;

    add<N extends string, NS extends Sequence>(
        name: N,
        sequence: NS,
        at?: NestedSequenceEntry<NS, keyof NS & string>["at"]
    ): SequenceBuilder<SE & { [_ in N]: NestedSequenceEntry<NS, keyof SE & string>; }>;

    add(
        name: string,
        definition: SimpleAnimation | MultiTweenAnimation<string[]> | Sequence,
        at?: At<string>,
        stagger?: Stagger
    ): SequenceBuilder<SequenceEntries> {
        if (Object.hasOwn(this.entries, name)) {
            throw new Error(`An entry named "${name}" already exists in this sequence.`);
        }
        const placement = {...(at !== undefined && {at})};
        if (definition instanceof Sequence) {
            this.entries[name] = {sequence: definition, ...placement};
        } else if (definition.type === 'simple') {
            this.entries[name] = {animation: definition, ...placement, ...(stagger && {stagger})};
        } else {
            this.entries[name] = {animation: definition, ...placement, ...(stagger && {stagger})};
        }
        return this;
    }

    build(repeat?: Repeat): Sequence<{ [K in keyof SE]: SE[K] }> {
        if (repeat?.count === Infinity && Object.values(this.entries).some(repeatsInfinitely)) {
            throw new RangeError("A sequence containing an infinitely repeating entry can't repeat infinitely.");
        }
        return new Sequence({...this.entries} as { [K in keyof SE]: SE[K] }, repeat);
    }
}

function repeatsInfinitely(entry: SequenceEntry): boolean {
    if ('animation' in entry) return entry.animation.repeat?.count === Infinity;
    return entry.sequence.repeat?.count === Infinity || Object.values<SequenceEntry>(entry.sequence.entries).some(repeatsInfinitely);
}

export class Sequence<SE extends SequenceEntries = {}> {
    readonly entries: SE;
    readonly repeat?: Repeat;

    constructor(entries: SE, repeat?: Repeat) {
        this.entries = entries;
        if (repeat) this.repeat = repeat;
    }

    static builder(): SequenceBuilder {
        return new SequenceBuilder();
    }
}
