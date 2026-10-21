import type {EasingFunction} from "./easing.js";
import {type AnimationPlaybackOptions, checkPlaybackOptions, clampedDelay, clampedRepeats} from "./playback-options.js";
import {checkTransitionOptions, isTransitionKey, resolveTransition, type TransitionOptions} from "./transition.js";
import type {RepeatOptions, Seconds} from "./types.js";
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

    static of(transition: TransitionOptions, options?: AnimationPlaybackOptions): AnimationTiming;
    // static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, options?: AnimationTimingOptions): TimedTweenAnimation<T>;
    // static of<T extends string[]>(transition: TransitionDescriptor, tweens: { [I in keyof T]: RatioTween<T[I]>; }, options?: AnimationTimingOptions): SelfTimedAnimation<T>;
    static of(transition: TransitionOptions, options?: AnimationPlaybackOptions): AnimationTiming {
        return new AnimationTiming(transition, options);
    }
}

/** The timing given, or the one a descriptor describes, split by key into its transition and its options. */
export function animationTimingOf(timing: AnimationTiming | AnimationTimingDescriptor): AnimationTiming {
    if (timing instanceof AnimationTiming) return timing;
    const entries = Object.entries(timing).filter(([, value]) => value !== undefined);
    const transition = Object.fromEntries(entries.filter(([key]) => isTransitionKey(key))) as TransitionOptions;
    const options = Object.fromEntries(entries.filter(([key]) => !isTransitionKey(key))) as AnimationPlaybackOptions;
    return AnimationTiming.of(transition, options);
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

// export class SelfTimedAnimation<T extends string[]> {
//     readonly type = "self-timed" as const;
//     constructor(
//         readonly transition: TransitionDescriptor,
//         readonly tweens: {
//             readonly [I in keyof T]: RatioTween<T[I]>;
//         },
//         options?: AnimationTimingOptions
//     ) {}
// }

/** @internal */
export class TimedTweenAnimation<T extends string[]> {
    readonly type = "timed-tween" as const;
    readonly options: AnimationPlaybackOptions;
    readonly tweens: { readonly [I in keyof T]: TimedTween<T[I]>; };

    constructor(tweens: { readonly [I in keyof T]: TimedTween<T[I]>; }, options: AnimationPlaybackOptions = {}) {
        checkPlaybackOptions(options, "The animation");
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
