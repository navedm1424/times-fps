import type {SequenceTiming, SubsequenceTimingEntry} from "../sequence-timing.ts";

export type CSSSelector = string;

/** Elements, or what finds them in the scope. */
export type Target = Element | Iterable<Element> | CSSSelector | ((scope: Element) => Element | Iterable<Element>);

export interface AnimatorOptions {
    /** Where selectors and target functions look for elements; the document's root element by default. */
    scope?: Element;
}

export type CSSValue = number | string;

/** One value to animate to, values listed evenly from 0 to 1, or values keyed by progress; `null` at an end stands for the value underneath, and one between the ends is skipped. */
export type RawTweenStops = CSSValue | readonly (CSSValue | null)[] | {
    [progress: number]: CSSValue | null;
};

/** Each property's values. */
export type AnimationValues = {
    [property: string]: RawTweenStops;
};

/** The targets and values of an animation timing's entry. */
export type AnimationMapping = [target: Target, values: AnimationValues];

/** A sequence timing's targets and values, keyed by entry name, with a nested mapping for each nested sequence timing. */
export type SequenceMapping<Timing extends SequenceTiming = SequenceTiming> = Timing extends SequenceTiming<infer Entries> ?
    {
        [Entry in Entries[number] as Entry['name']]: Entry extends SubsequenceTimingEntry<string, infer Subsequence extends SequenceTiming> ?
            SequenceMapping<Subsequence> :
            AnimationMapping;
    } :
    never;

/** The target's elements, each once. */
export function resolveTargets(target: Target, scope: Element): Element[] {
    const elementOrElements = typeof target === 'string'
        ? scope.querySelectorAll(target)
        : typeof target === 'function'
            ? target(scope)
            : target;

    return [...new Set(Symbol.iterator in elementOrElements ? elementOrElements : [elementOrElements])];
}