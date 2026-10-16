
import type {Easing} from "./easing.js";
import type {At, Progress, RepeatOptions, Seconds, Stagger} from "./types.js";

declare function ease(easing: Easing, progress: Progress): Progress;

export function stagger(each: Seconds, options: {
    from?: 'first' | 'last' | 'center' | number;
    easing?: Easing;
} = {}): Stagger {
    const {from = 'first', easing} = options;
    return (index, total) => {
        const origin = originIndex(from, total);
        const distance = Math.abs(index - origin);
        if (!easing) return distance * each;

        const farthestDistance = Math.max(origin, total - 1 - origin);
        if (farthestDistance === 0) return 0;
        return ease(easing, distance / farthestDistance) * farthestDistance * each;
    };
}

function originIndex(from: 'first' | 'last' | 'center' | number, total: number): number {
    switch (from) {
        case 'first': return 0;
        case 'last': return total - 1;
        case 'center': return (total - 1) / 2;
        default: return from;
    }
}

/** Sequence-local times an entry's position can refer to. */
export type EntryReferences = { start: Seconds; end: Seconds };

export type ParsedAt<N extends string> =
    | { kind: 'absolute'; time: Seconds }
    | { kind: 'relative'; reference: N | undefined; anchor: keyof EntryReferences; offset: Seconds };

export function parseAt<N extends string>(at: At<N>): ParsedAt<N> {
    if (typeof at === 'number') return {kind: 'absolute', time: at};

    const [, reference, startMarker, sign, amountText] = /^(\w*)(>?)([+-])(.+)$/.exec(at) ?? [];
    const amount = Number(amountText);
    if (!amountText?.trim() || Number.isNaN(amount))
        throw new Error(`Can't parse the position "${at}".`);

    return {
        kind: 'relative',
        reference: reference ? reference as N : undefined,
        anchor: startMarker ? 'start' : 'end',
        offset: sign === '-' ? -amount : amount
    };
}

/** Throws for NaN, and for an infinite number unless `allowInfinity` is set; otherwise gives the value back. */
export function checkNumber<Value extends number | undefined>(value: Value, label: string, {allowInfinity = false} = {}): Value {
    if (value !== undefined && (Number.isNaN(value) || (!allowInfinity && !Number.isFinite(value))))
        throw new RangeError(`${label} must be ${allowInfinity ? "a number" : "a finite number"}.`);
    return value;
}

/** Negative repeat counts and delays become 0, and fractional counts round down. */
export function clampedRepeats<Options extends RepeatOptions>(options: Options): Options {
    const {repeatCount, repeatDelay} = options;
    return {
        ...options,
        ...(repeatCount !== undefined && {repeatCount: Math.max(0, Math.floor(repeatCount))}),
        ...(repeatDelay !== undefined && {repeatDelay: Math.max(0, repeatDelay)})
    };
}

/** A negative delay becomes 0. */
export function clampedDelay<Options extends { delay?: Seconds | Stagger }>(options: Options): Options {
    return typeof options.delay === 'number' ? {...options, delay: Math.max(0, options.delay)} : options;
}

/** Exact at both ends: `from` at 0 and `to` at 1. */
export function lerp(from: number, to: number, amount: number): number {
    return from * (1 - amount) + to * amount;
}

/** The amount at which `lerp` from `from` to `to` gives `value`. */
export function invLerp(value: number, from: number, to: number): number {
    return (value - from) / (to - from);
}

/** Maps `value` from the range `fromStart`–`fromEnd` onto the range `toStart`–`toEnd`. */
export function remap(value: number, fromStart: number, fromEnd: number, toStart: number, toEnd: number): number {
    return lerp(toStart, toEnd, invLerp(value, fromStart, fromEnd));
}

/**
 * The input between `low` and `high` at which `fn`, which only rises or only falls there, reaches `target`:
 * Newton's method kept inside a shrinking bracket, bisecting whenever a step leaves it.
 */
export function solveMonotone(
    fn: (input: number) => number,
    derivative: (input: number) => number,
    target: number,
    low: number,
    high: number,
    tolerance = 1e-12,
    maxIterations = 64
): number {
    const lowOutput = fn(low);
    const highOutput = fn(high);
    if (target === lowOutput) return low;
    if (target === highOutput) return high;

    const rising = highOutput >= lowOutput;
    let input = (low + high) / 2;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const error = fn(input) - target;
        if (Math.abs(error) <= tolerance) return input;
        if ((error < 0) === rising) low = input;
        else high = input;

        const newtonInput = input - error / derivative(input);
        input = newtonInput > low && newtonInput < high ? newtonInput : (low + high) / 2;
    }
    return input;
}

/** Object keys don't keep numeric order, since integer keys like 0 and 1 always come first. */
export function sortedByKey<T>(record: { [key: number]: T }): [number, T][] {
    return Object.entries(record)
        .map(([key, item]): [number, T] => [Number(key), item])
        .sort(([a], [b]) => a - b);
}
