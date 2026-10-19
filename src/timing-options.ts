import type {RepeatOptions, Seconds, Stagger} from "./types.js";

/** The options animations and sequences share: a delay before the first play, and how they repeat. */
export interface TimingOptions extends RepeatOptions {
    delay?: Seconds | Stagger;
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
