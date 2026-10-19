import type {
    At,
    TimedTweenAnimationEntry,
    NestedSequenceEntry, RepeatOptions, Seconds, Stagger,
    SequenceEntries,
    SequenceEntry,
    SimpleAnimationEntry
} from "./types.js";
import {AnimationDefinition, animationOf, type SimpleAnimation, type TimedTweenAnimation, type TransitionAndOptions} from "./animation.js";
import {type ParsedAt, parseAt} from "./utils/positions.js";
import {checkNumber, clampedDelay, clampedRepeats} from "./utils/validation.js";

export class SequenceBuilder<SE extends SequenceEntries = {}> {
    private readonly names: string[] = [];
    private readonly entries: { [name: string]: SequenceEntry } = {};

    add<N extends string>(
        name: N,
        animation: SimpleAnimation | TransitionAndOptions,
        at?: At<keyof SE & string>
    ): SequenceBuilder<SE & { [_ in N]: SimpleAnimationEntry<keyof SE & string> }>;

    // add<N extends string, A extends TimedTweenAnimation<string[]>>(
    //     name: N,
    //     animation: A,
    //     at?: At<keyof SE & string>
    // ): SequenceBuilder<SE & { [_ in N]: TimedTweenAnimationEntry<A, keyof SE & string> }>;

    add<N extends string, NS extends Sequence>(
        name: N,
        sequence: NS,
        at?: At<keyof SE & string>
    ): SequenceBuilder<SE & { [_ in N]: NestedSequenceEntry<NS, keyof SE & string>; }>;

    add<N extends string>(
        name: N,
        definition: SimpleAnimation | TimedTweenAnimation<string[]> | Sequence | TransitionAndOptions,
        at?: At<string>
    ): SequenceBuilder<SE & { [_ in N]: SequenceEntry }> {
        if (Object.hasOwn(this.entries, name))
            throw new Error(`An entry named "${name}" already exists in this sequence.`);
        checkName(name);
        const parsedAt = parseAt(at ?? '+0');
        checkPosition(`Entry "${name}"`, parsedAt, this.names);

        this.names.push(name);
        const placement = {at: parsedAt};
        if (definition instanceof Sequence)
            this.entries[name] = {sequence: definition, ...placement};
        else if (!(definition instanceof AnimationDefinition))
            this.entries[name] = {animation: animationOf(definition), ...placement};
        else if (definition.type === 'simple')
            this.entries[name] = {animation: definition, ...placement};
        else
            this.entries[name] = {animation: definition, ...placement};

        return this;
    }

    build(options: SequenceOptions = {}): Sequence<{ [K in keyof SE]: SE[K] }> {
        return new Sequence([...this.names], {...this.entries} as { [K in keyof SE]: SE[K] }, options);
    }
}

export interface SequenceOptions extends RepeatOptions {
    delay?: Seconds | Stagger;
}

export class Sequence<SE extends SequenceEntries = SequenceEntries> {
    readonly options: SequenceOptions;

    constructor(
        readonly names: readonly string[],
        readonly entries: SE,
        options: SequenceOptions = {}
    ) {
        if (names.length === 0)
            throw new Error("A sequence needs at least one entry.");
        names.forEach((name, index) => {
            const earlierNames = names.slice(0, index);
            if (earlierNames.includes(name))
                throw new Error(`An entry named "${name}" already exists in this sequence.`);
            checkName(name);
            const entry: SequenceEntry | undefined = entries[name];
            if (!entry) throw new Error(`The sequence has no entry named "${name}".`);
            checkPosition(`Entry "${name}"`, entry.at, earlierNames);
        });

        if (typeof options.delay === 'number') checkNumber(options.delay, "The sequence's delay");
        checkNumber(options.repeatDelay, "The sequence's repeat delay");
        checkNumber(options.repeatCount, "The sequence's repeat count", {allowInfinity: true});
        this.options = clampedDelay(clampedRepeats(options));
    }

    static builder(): SequenceBuilder {
        return new SequenceBuilder();
    }
}

export function checkName(name: string): void {
    if (/\W/.test(name))
        throw new Error(`The entry name "${name}" can only contain letters, digits and underscores.`);
}

/** A position's time must be finite, and the entry it refers to must come before it; `entry` names the entry in messages. */
export function checkPosition(entry: string, at: ParsedAt<string>, earlierNames: readonly string[]): void {
    if (at.kind === 'absolute') {
        checkNumber(at.time, `${entry}'s position`);
        return;
    }
    checkNumber(at.offset, `${entry}'s position offset`);
    if (at.reference !== undefined && !earlierNames.includes(at.reference))
        throw new Error(`${entry}'s position refers to "${at.reference}", which isn't an earlier entry.`);
}
