import type {Progress} from "../types.js";
import {remap, sortedByKey} from "../utils.js";
import type {SimpleAnimationMapping} from "./resolver.js";

export type RawValueStops = {
    [progress: number]: number;
};

interface ValueStop {
    progress: Progress;
    value: number;
}

export class PropertyValues {
    private constructor(private readonly byProperty: { [property: string]: PropertyStops }) {}

    static of(values: SimpleAnimationMapping['values']): PropertyValues {
        return new PropertyValues(Object.fromEntries(Object
        .entries(values)
        .map(([property, valueStops]) => [property, PropertyStops.of(property, valueStops)])
        ));
    }

    /** Swaps every property's start and end values. */
    flip(): PropertyValues {
        return new PropertyValues(this.map(stops => stops.flip()));
    }

    map<Result>(transform: (stops: PropertyStops, property: string) => Result): { [property: string]: Result } {
        return Object.fromEntries(Object
        .entries(this.byProperty)
        .map(([property, stops]) => [property, transform(stops, property)])
        );
    }
}

/** One property's values along the change, sorted by progress, with the closest value filling in a missing end. */
export class PropertyStops {
    private constructor(readonly stops: readonly ValueStop[]) {}

    static of(property: string, valueStops: RawValueStops): PropertyStops {
        const stops = sortedByKey(valueStops).map(([progress, value]) => ({progress, value}));
        const first = stops[0];
        const last = stops.at(-1);
        if (!first || !last) throw new Error(`"${property}" has no values.`);

        for (const {progress} of stops) {
            if (!(progress >= 0 && progress <= 1))
                throw new RangeError(`"${property}" has a value at ${progress}, outside the 0–1 range.`);
        }

        if (first.progress !== 0) stops.unshift({progress: 0, value: first.value});
        if (last.progress !== 1) stops.push({progress: 1, value: last.value});
        return new PropertyStops(stops);
    }

    /** The stop's own value at a stop; linear between the surrounding stops; past either end, it continues the nearest segment, as a spring overshoots. */
    valueAt(progress: Progress): number {
        const stop = this.stops.find(stop => stop.progress === progress);
        if (stop) return stop.value;

        const {start, end} = this.surroundingStops(progress);
        return remap(progress, start.progress, end.progress, start.value, end.value);
    }

    /** The stops on either side of the progress; past either end, the nearest pair. */
    private surroundingStops(progress: Progress): { start: ValueStop; end: ValueStop } {
        const {stops} = this;
        const nextIndex = stops.findIndex(stop => stop.progress > progress);
        const endIndex = nextIndex === -1 ? stops.length - 1 : Math.max(nextIndex, 1);
        return {start: stops[endIndex - 1]!, end: stops[endIndex]!};
    }

    /** The stops strictly between the two, in either order. */
    stopsBetween(fromProgress: Progress, toProgress: Progress): ValueStop[] {
        const lowest = Math.min(fromProgress, toProgress);
        const highest = Math.max(fromProgress, toProgress);
        return this.stops.filter(({progress}) => progress > lowest && progress < highest);
    }

    /** Swaps the start and end values, so a mirrored play keeps its easing running forwards. */
    flip(): PropertyStops {
        return new PropertyStops(this.stops.map(({progress, value}) => ({progress: 1 - progress, value})).reverse());
    }
}
