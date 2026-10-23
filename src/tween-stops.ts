import type {CSSValue, RawTweenStops} from "./dom/mapping.ts";
import type {Progress} from "./types.ts";
import {sortedEntriesOf} from "./utils/records.ts";

/** A `null` value is the value underneath as the entry starts. */
export interface TweenStop {
    offset: Progress;
    value: CSSValue | null;
}

/**
 * One property's values at offsets from 0 to 1, in order, with a stop at each end.
 * A missing 0 is the value underneath as the entry starts; a missing 1 is the last value given.
 */
export class TweenStops {
    private constructor(readonly stops: readonly TweenStop[]) {}

    /** The stops of one of the forms; a single value is the last, as in WAAPI, and a `null` is left out wherever it is. */
    static of(property: string, rawStops: RawTweenStops): TweenStops {
        const given: [Progress, CSSValue | null][] = typeof rawStops !== 'object'
            ? [[1, rawStops]]
            : Array.isArray(rawStops)
                ? listedStopsOf(rawStops)
                : sortedEntriesOf(rawStops as { [offset: number]: CSSValue | null });

        for (const [offset] of given) {
            if (!(offset >= 0 && offset <= 1))
                throw new RangeError(`"${property}" has a value at ${offset}, outside the 0–1 range.`);
        }
        const stops: TweenStop[] = given.flatMap(([offset, value]) => value === null ? [] : [{offset, value}]);
        const first = stops[0];
        const last = stops.at(-1);
        if (!first || !last) throw new TypeError(`"${property}" has no values.`);

        if (first.offset !== 0) stops.unshift({offset: 0, value: null});
        if (last.offset !== 1) stops.push({offset: 1, value: last.value});
        return new TweenStops(stops);
    }

    /** The value throughout. */
    static constant(value: CSSValue | null): TweenStops {
        return new TweenStops([{offset: 0, value}, {offset: 1, value}]);
    }

    get startValue(): CSSValue | null {
        return this.stops[0]!.value;
    }

    get endValue(): CSSValue | null {
        return this.stops.at(-1)!.value;
    }

    /** The value of the stop at exactly the offset, if there's one. */
    get(offset: Progress): CSSValue | null | undefined {
        const stop = this.stops.find(stop => stop.offset === offset);
        return stop ? stop.value : undefined;
    }

    /** The same values played backwards: each moves from its offset to 1 minus it. */
    reverse(): TweenStops {
        return new TweenStops(this.stops.map(({offset, value}) => ({offset: 1 - offset, value})).reverse());
    }
}

function listedStopsOf(values: readonly (CSSValue | null)[]): [Progress, CSSValue | null][] {
    if (values.length === 1) return [[1, values[0]!]];
    return values.map((value, index) => [index / (values.length - 1), value]);
}
