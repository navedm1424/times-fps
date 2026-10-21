import type {EasingFunction} from "./easing.js";
import {
    type AnimationPlaybackOptions,
    checkPlaybackOptions,
    clampedDelay,
    clampedRepeats,
    type RepeatOptions
} from "./playback-options.js";
import {checkTransitionOptions, isTransitionKey, resolveTransition, type TransitionOptions} from "./transition.js";
import type {Seconds} from "./types.js";
import {checkNumber} from "./utils/validation.js";

/** A transition with the options of its timing spread into it. */
export type AnimationTimingDescriptor = TransitionOptions & AnimationPlaybackOptions;

/** One play through the transition, with its delay and repeats. */
export class AnimationTiming {
    readonly options: AnimationPlaybackOptions;
    /** How long one play lasts. */
    readonly duration: Seconds;
    readonly easing: EasingFunction;

    private constructor(readonly transition: TransitionOptions, options: AnimationPlaybackOptions = {}) {
        checkPlaybackOptions(options, "The timing");
        checkTransitionOptions(transition, "The timing's transition");
        this.options = clampedDelay(clampedRepeats(options));
        const {duration, easing} = resolveTransition(transition);
        this.duration = duration;
        this.easing = easing;
    }

    /** A descriptor is split by key into its transition and its options. */
    static of(timing: AnimationTimingDescriptor): AnimationTiming;
    static of(transition: TransitionOptions, options?: AnimationPlaybackOptions): AnimationTiming;
    // static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, options?: AnimationPlaybackOptions): TimedTweenTiming<T>;
    // static of<T extends string[]>(transition: TransitionOptions, tweens: { [I in keyof T]: RatioTween<T[I]>; }, options?: AnimationPlaybackOptions): SelfTimedTiming<T>;
    static of(transition: TransitionOptions | AnimationTimingDescriptor, options?: AnimationPlaybackOptions): AnimationTiming {
        const entries = Object.entries(transition).filter(([, value]) => value !== undefined);
        const transitionOptions = Object.fromEntries(entries.filter(([key]) => isTransitionKey(key))) as TransitionOptions;
        const playbackOptions = Object.fromEntries(entries.filter(([key]) => !isTransitionKey(key))) as AnimationPlaybackOptions;
        return new AnimationTiming(transitionOptions, {...playbackOptions, ...options});
    }
}

/**
 * `repeat` must be finite.
 * @internal
 */
export interface TimedTween<Name extends string = string> extends RepeatOptions {
    name: Name;
    transition: TransitionOptions;
    delay?: Seconds;
}

// export interface RatioTween<Name extends string = string> {
//     name: Name;
//     ratio?: Ratio;             // omitted = equal share of what's left
//     transition?: StretchableTransition;
// }

// export class SelfTimedTiming<T extends string[]> {
//     readonly type = "self-timed" as const;
//     constructor(
//         readonly transition: TransitionOptions,
//         readonly tweens: {
//             readonly [I in keyof T]: RatioTween<T[I]>;
//         },
//         options?: AnimationPlaybackOptions
//     ) {}
// }

/** @internal */
export class TimedTweenTiming<T extends string[]> {
    readonly type = "timed-tween" as const;
    readonly options: AnimationPlaybackOptions;
    readonly tweens: { readonly [I in keyof T]: TimedTween<T[I]>; };

    constructor(tweens: { readonly [I in keyof T]: TimedTween<T[I]>; }, options: AnimationPlaybackOptions = {}) {
        checkPlaybackOptions(options, "The timing");
        this.options = clampedDelay(clampedRepeats(options));
        const givenTweens: readonly TimedTween[] = tweens;
        for (const tween of givenTweens) {
            checkNumber(tween.repeat, `Tween "${tween.name}"'s repeat count`);
            checkNumber(tween.delay, `Tween "${tween.name}"'s delay`);
            checkNumber(tween.repeatDelay, `Tween "${tween.name}"'s repeat delay`);
            checkTransitionOptions(tween.transition, `Tween "${tween.name}"'s transition`);
        }
        this.tweens = givenTweens.map(tween => clampedDelay(clampedRepeats(tween))) as unknown as typeof this.tweens;
    }
    // easing?: EasingDescriptor;           // compounds with each tween's easing
}
