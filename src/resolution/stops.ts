import type {Progress} from "../types.js";
import {remap} from "../utils/math.js";
import {sortedByKey} from "../utils/records.js";

export type NumericValueStops = {
    [progress: number]: number;
};

/**
 * A property's value at a stop: its CSS text, and its number once its track's unit is known.
 * A missing 0 isn't given: it adopts the text of the value the track has as the entry starts, or only gets a number when the track is between stops then.
 */
export class StopValue {
    readonly given: boolean;
    #text: string | undefined;
    #number: number | undefined;

    constructor(text: string | undefined) {
        this.given = text !== undefined;
        this.#text = text;
    }

    get text(): string | undefined {
        return this.#text;
    }

    get number(): number {
        if (this.#number === undefined) throw new Error(`The value "${this.#text ?? "at the start"}" hasn't been resolved yet.`);
        return this.#number;
    }

    adoptText(text: string): void {
        this.#text = text;
    }

    assignNumber(number: number): void {
        this.#number = number;
    }
}

interface Stop {
    progress: Progress;
    value: StopValue;
}

/**
 * One property's values along the change, sorted by progress.
 * A missing 0 is the value the track has as the entry starts; a missing 1 is the last given value.
 */
export class PropertyStops {
    private constructor(readonly stops: readonly Stop[]) {}

    static of(property: string, valueStops: { [progress: number]: string | number }): PropertyStops {
        const stops = sortedByKey(valueStops).map(([progress, value]) => ({progress, value: new StopValue(String(value))}));
        const first = stops[0];
        const last = stops.at(-1);
        if (!first || !last) throw new Error(`"${property}" has no values.`);

        for (const {progress} of stops) {
            if (!(progress >= 0 && progress <= 1))
                throw new RangeError(`"${property}" has a value at ${progress}, outside the 0–1 range.`);
        }

        if (first.progress !== 0) stops.unshift({progress: 0, value: new StopValue(undefined)});
        if (last.progress !== 1) stops.push({progress: 1, value: last.value});
        return new PropertyStops(stops);
    }

    /** The value throughout. */
    static constant(value: StopValue): PropertyStops {
        return new PropertyStops([{progress: 0, value}, {progress: 1, value}]);
    }

    get startValue(): StopValue {
        return this.stops[0]!.value;
    }

    /** Each value once, in order. */
    get values(): StopValue[] {
        return [...new Set(this.stops.map(({value}) => value))];
    }

    /** The value of the stop at exactly the progress. */
    valueOfStopAt(progress: Progress): StopValue {
        const value = this.stopValueAt(progress);
        if (!value) throw new Error(`There's no stop at ${progress}.`);
        return value;
    }

    /** The value at the progress when it's exactly a stop's, as it is anywhere along constant stops. */
    stopValueAt(progress: Progress): StopValue | undefined {
        const [value, ...otherValues] = this.values;
        if (otherValues.length === 0) return value;
        return this.stops.find(stop => stop.progress === progress)?.value;
    }

    /** The stop's own value at a stop; linear between the surrounding stops; past either end, it continues the nearest segment, as a spring overshoots. */
    valueAt(progress: Progress): number {
        const stop = this.stops.find(stop => stop.progress === progress);
        if (stop) return stop.value.number;

        const {start, end} = this.surroundingStops(progress);
        return remap(progress, start.progress, end.progress, start.value.number, end.value.number);
    }

    /** The stops on either side of the progress; past either end, the nearest pair. */
    private surroundingStops(progress: Progress): { start: Stop; end: Stop } {
        const {stops} = this;
        const nextIndex = stops.findIndex(stop => stop.progress > progress);
        const endIndex = nextIndex === -1 ? stops.length - 1 : Math.max(nextIndex, 1);
        return {start: stops[endIndex - 1]!, end: stops[endIndex]!};
    }

    /** The stops strictly between the two, in either order. */
    stopsBetween(fromProgress: Progress, toProgress: Progress): Stop[] {
        const lowest = Math.min(fromProgress, toProgress);
        const highest = Math.max(fromProgress, toProgress);
        return this.stops.filter(({progress}) => progress > lowest && progress < highest);
    }

    /** Swaps the start and end values, so a mirrored play keeps its easing running forwards. */
    flip(): PropertyStops {
        return new PropertyStops(this.stops.map(({progress, value}) => ({progress: 1 - progress, value})).reverse());
    }
}
