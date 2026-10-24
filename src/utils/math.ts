/** Exact at both ends: `from` at 0 and `to` at 1. */
export function lerp(from: number, to: number, amount: number): number {
    return from * (1 - amount) + to * amount;
}

/** The amount at which `lerp` from `from` to `to` gives `value`. */
export function invLerp(from: number, to: number, value: number): number {
    return (value - from) / (to - from);
}

/** Maps `value` from the range `fromStart`–`fromEnd` onto the range `toStart`–`toEnd`. */
export function remap(value: number, fromStart: number, fromEnd: number, toStart: number, toEnd: number): number {
    return lerp(toStart, toEnd, invLerp(fromStart, fromEnd, value));
}

/** `value` kept within `low`–`high`. */
export function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
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
