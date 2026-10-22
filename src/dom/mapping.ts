import type {SequenceTiming, SubsequenceTimingEntry} from "../sequence.ts";
import {sortedByKey} from "../utils/records.ts";

export type CSSSelector = string;

/** Elements, or what finds them in the scope. */
export type Target = Element | Iterable<Element> | CSSSelector | ((scope: Element) => Element | Iterable<Element>);

export interface AnimatorOptions {
    /** Where selectors and target functions look for elements; the document's root element by default. */
    scope?: Element;
}

export type CSSValue = number | string;

/** One value to animate to, values listed evenly from 0 to 1, or values keyed by progress; `null` at an end stands for the value underneath. */
export type ValueStops = CSSValue | readonly (CSSValue | null)[] | {
    [progress: number]: CSSValue | null;
};

/** Each property's values. */
export type AnimationValues = {
    [property: string]: ValueStops;
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

/** A mapping as it's played: an animation's, or a sequence's. */
export type MappingTree = AnimationMapping | SequenceMapping;

/** The values as stops keyed by progress, with the missing ones left out; a single value is the last, as in WAAPI. */
export function progressStopsOf(property: string, valueStops: ValueStops): [progress: number, value: CSSValue][] {
    const given: [number, CSSValue | null][] = typeof valueStops !== 'object'
        ? [[1, valueStops]]
        : Array.isArray(valueStops)
            ? listedStopsOf(valueStops)
            : sortedByKey(valueStops as { [progress: number]: CSSValue | null });
    if (given.length === 0) throw new TypeError(`"${property}" has no values.`);

    given.forEach(([progress, value], index) => {
        if (!(progress >= 0 && progress <= 1))
            throw new RangeError(`"${property}" has a value at ${progress}, outside the 0–1 range.`);
        if (value === null && index !== 0 && index !== given.length - 1)
            throw new TypeError(`"${property}" has a null between its ends; null only stands for the value underneath at the start or the end.`);
    });
    const stops = given.filter((stop): stop is [number, CSSValue] => stop[1] !== null);
    if (stops.length === 0) throw new TypeError(`"${property}" has no values.`);
    return stops;
}

/** Every property's values must take one of the forms, as `progressStopsOf` reads them. */
export function checkAnimationValues(values: AnimationValues): void {
    for (const [property, valueStops] of Object.entries(values)) progressStopsOf(property, valueStops);
}

function listedStopsOf(values: readonly (CSSValue | null)[]): [number, CSSValue | null][] {
    if (values.length === 1) return [[1, values[0]!]];
    return values.map((value, index) => [index / (values.length - 1), value]);
}

/** The target's elements, each once; a target with none is a mistake. */
export function resolveTargets(target: Target, scope: Element): Element[] {
    const elements = typeof target === 'string' ? [...scope.querySelectorAll(target)]
        : typeof target === 'function' ? elementsOf(target(scope))
        : elementsOf(target);
    if (elements.length === 0)
        throw new Error(typeof target === 'string' ? `"${target}" matches no elements.` : "The target has no elements.");
    return [...new Set(elements)];
}

function elementsOf(found: Element | Iterable<Element>): Element[] {
    return Symbol.iterator in found ? [...found] : [found];
}
