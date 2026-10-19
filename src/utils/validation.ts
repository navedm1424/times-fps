import type {RepeatOptions, Seconds, Stagger} from "../types.js";

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

/** Throws unless the value, when it's given, is a finite number above 0. */
export function checkPositive(value: number | undefined, label: string): void {
    if (checkNumber(value, label) !== undefined && !(value! > 0))
        throw new RangeError(`${label} must be positive, not ${value}.`);
}
