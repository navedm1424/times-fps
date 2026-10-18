// ── Adaptation ─────────────────────────────────────────────

import type {
    Animation, TimedTweenAnimation,
    TimedTweenAnimationEntry,
    Sequence,
    NestedSequenceEntry, SimpleAnimation, Progress
} from "../src/index.js";

type Target = unknown;
type Value = unknown;

// interface PropertyKeyframes {
//     values: readonly Value[];
//     offsets?: readonly Progress[];
// }
// type PropertyValueKeyframes = {
//     [property: string]: readonly Value[] | PropertyKeyframes;
// };

type PropertyValues = {
    [property: string]: Value;
};

interface SingleTweenMapping {
    target: Target;
    from: PropertyValues;
    to: PropertyValues;
    // keyframes: Keyframes;
}

interface TimedTweenMapping<TweenName extends string> {
    target: Target;
    from: PropertyValues;
    to: { [N in TweenName]: PropertyValues };  // values continue from the previous tween's end
}

type AnimationMappingOf<A extends Animation> =
    A extends TimedTweenAnimation<infer TweenNames>
        ? TimedTweenMapping<TweenNames[number]>
        : SingleTweenMapping;

type SequenceMappingOf<S extends Sequence> = {
    [Name in keyof S["entries"]]: S["entries"][Name] extends NestedSequenceEntry<infer Nested>
        ? SequenceMappingOf<Nested>
        : S["entries"][Name] extends TimedTweenAnimationEntry<infer A>
            ? AnimationMappingOf<A>
            : AnimationMappingOf<SimpleAnimation>;
};

/** Sequence is checked first, since every sequence is structurally an animation too. */
type MappingOf<Definition extends Sequence | Animation> =
    Definition extends Sequence
        ? SequenceMappingOf<Definition>
        : AnimationMappingOf<Definition>;

export interface Adapter<Output> {
    adapt<const Definition extends Sequence | Animation>(
        definition: Definition,
        mapping: MappingOf<Definition>,
    ): Output;
}