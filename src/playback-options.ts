import type {Seconds} from "./types.ts";
import {checkNumber} from "./utils/validation.ts";

export type Stagger = (index: number, total: number) => Seconds;
export type RepeatMode = 'loop' | 'reverse' | 'mirror';

export interface RepeatOptions {
    repeat?: number;           // plays after the first
    repeatDelay?: Seconds;     // between plays, never after the last
    repeatMode?: RepeatMode;
}

/** The options of an animation's timing: a delay before the first play, and how it repeats. */
export interface AnimationPlaybackOptions extends RepeatOptions {
    delay?: Seconds | Stagger;
}

/** A sequence's timing takes the same options as an animation's. */
export type SequencePlaybackOptions = AnimationPlaybackOptions;

/** Delays and repeat delays must be finite, and the repeat count a number; `label` names the timing in messages. */
export function checkPlaybackOptions(options: AnimationPlaybackOptions, label: string): void {
    if (typeof options.delay === 'number') checkNumber(options.delay, `${label}'s delay`);
    checkNumber(options.repeatDelay, `${label}'s repeat delay`);
    checkNumber(options.repeat, `${label}'s repeat count`, {allowInfinity: true});
}

/** Negative repeat counts and delays become 0, and fractional counts round down. */
export function clampedRepeats<Options extends RepeatOptions>(options: Options): Options {
    const {repeat, repeatDelay} = options;
    return {
        ...options,
        ...(repeat !== undefined && {repeat: Math.max(0, Math.floor(repeat))}),
        ...(repeatDelay !== undefined && {repeatDelay: Math.max(0, repeatDelay)})
    };
}

/** A negative delay becomes 0. */
export function clampedDelay<Options extends { delay?: Seconds | Stagger }>(options: Options): Options {
    return typeof options.delay === 'number' ? {...options, delay: Math.max(0, options.delay)} : options;
}
