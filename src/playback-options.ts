import type {Seconds} from "./types.ts";
import {checkNumber} from "./utils/validation.ts";

/** The delay of each element, from its index among total; what delay takes, and what stagger() makes. */
export type Stagger = (index: number, total: number) => Seconds;
export type RepeatMode = 'loop' | 'reverse' | 'mirror';

export interface RepeatOptions {
    repeat?: number;
    repeatDelay?: Seconds;
    repeatMode?: RepeatMode;
}

/** The delays a stagger gives a number of elements, in order. */
export type StaggeredDelays = (count: number) => Seconds[];

/** The options of a timing: a delay before the first play, and how it repeats. */
export interface PlaybackOptions extends RepeatOptions {
    delay?: Seconds | Stagger;
}

/** The options as a timing keeps them: clamped, with a stagger wrapped as `StaggeredDelays`. */
export interface PlaybackDescriptor extends RepeatOptions {
    delay?: Seconds | StaggeredDelays;
}

const repeatModes: readonly RepeatMode[] = ['loop', 'reverse', 'mirror'];

/** Delays and repeat delays must be finite, the repeat count a number, and the repeat mode a known one; `label` names the timing in messages. */
export function checkPlaybackOptions(options: PlaybackOptions, label: string): void {
    if (typeof options.delay === 'number') checkNumber(options.delay, `${label}'s delay`);
    checkNumber(options.repeatDelay, `${label}'s repeat delay`);
    checkNumber(options.repeat, `${label}'s repeat count`, {allowInfinity: true});
    if (options.repeatMode !== undefined && !repeatModes.includes(options.repeatMode))
        throw new TypeError(`${label} repeats as "${options.repeatMode}", which isn't one of ${repeatModes.map(repeatMode => `"${repeatMode}"`).join(', ')}.`);
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

/** Wraps a stagger so it gives every element's delay at once; NaN and infinite delays throw, and negative ones become 0. */
export function staggeredDelaysOf(stagger: Stagger): StaggeredDelays {
    return count => Array.from({length: count}, (_, index) =>
        Math.max(0, checkNumber(stagger(index, count), `The staggered delay of element ${index}`))
    );
}

/** The options clamped, with a staggered delay wrapped so it gives every element's delay at once. */
export function playbackDescriptorOf(options: PlaybackOptions): PlaybackDescriptor {
    const {delay, ...clampedOptions} = clampedDelay(clampedRepeats(options));
    return {...clampedOptions, ...(delay !== undefined && {delay: typeof delay === 'number' ? delay : staggeredDelaysOf(delay)})};
}
