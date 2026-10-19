import type {SimpleAnimation} from "../animation.js";
import type {Sequence} from "../sequence.js";
import type {NestedSequenceEntry, SequenceEntries, SimpleAnimationEntry} from "../types.js";
import type {AllowedFill} from "./tracks.js";

export type CSSSelector = string;

/** Elements, or what finds them in the scope. */
export type Target = Element | Element[] | CSSSelector | ((scope: Element) => Element | Element[]);

/** A number, a number with a unit, or a CSS expression that resolves to one. */
export type CSSValue = number | string;

/** Values keyed by progress, or listed evenly from 0 to 1. */
export type ValueStops = readonly CSSValue[] | {
    [progress: number]: CSSValue;
};

export type AnimationMapping = {
    target: Target;
    values: {
        [property: string]: ValueStops;
    };
    /** How the values combine with what's under them, which they replace by default. */
    composite?: CompositeOperation;
    /** Which of the fills their track gives them the entry's effects keep; all of them by default. */
    fill?: AllowedFill;
};

export type SequenceMapping<SE extends SequenceEntries = SequenceEntries> = {
    [N in keyof SE]: SE[N] extends NestedSequenceEntry<Sequence<infer NSE>>
        ? SequenceMapping<NSE>
        : SE[N] extends SimpleAnimationEntry
            ? AnimationMapping
            : never;
};

/** The mapping a definition takes. */
export type MappingOf<Definition extends SimpleAnimation | Sequence> = Definition extends Sequence<infer SE>
    ? SequenceMapping<SE>
    : AnimationMapping;

/** The target's elements, each once; a target with none is a mistake. */
export function resolveTargets(target: Target, scope: Element): Element[] {
    const elements = typeof target === 'string' ? [...scope.querySelectorAll(target)]
        : typeof target === 'function' ? [target(scope)].flat()
        : [target].flat();
    if (elements.length === 0)
        throw new Error(typeof target === 'string' ? `"${target}" matches no elements.` : "The target has no elements.");
    return [...new Set(elements)];
}
