import type {EasingFunction} from "./easing.js";
import {clampedDelay, clampedRepeats, type TimingOptions} from "./timing-options.js";
import {checkTransition, resolveTransition, type Transition} from "./transition.js";
import type {RepeatOptions, Seconds} from "./types.js";
import {checkNumber} from "./utils/validation.js";

/**
 * `repeatCount` must be finite.
 * @internal
 */
export interface TimedTween<Name extends string = string> extends RepeatOptions {
    name: Name;
    transition: Transition;
    delay?: Seconds;
}

// export interface RatioTween<Name extends string = string> {
//     name: Name;
//     ratio?: Ratio;             // omitted = equal share of what's left
//     transition?: StretchableTransition;
// }

export type AnimationOptions = TimingOptions;

/** A transition with the options of the animation that plays it. */
export type TransitionAndOptions = Transition & AnimationOptions;

export class AnimationDefinition {
    readonly options: AnimationOptions;

    protected constructor(options: AnimationOptions = {}) {
        if (typeof options.delay === 'number') checkNumber(options.delay, "The animation's delay");
        checkNumber(options.repeatDelay, "The animation's repeat delay");
        checkNumber(options.repeatCount, "The animation's repeat count", {allowInfinity: true});
        this.options = clampedDelay(clampedRepeats(options));
    }

    static of(transition: Transition, options?: AnimationOptions): SimpleAnimation;
    // static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, options?: AnimationOptions): TimedTweenAnimation<T>;
    // static of<T extends string[]>(transition: Transition, tweens: { [I in keyof T]: RatioTween<T[I]>; }, options?: AnimationOptions): SelfTimedAnimation<T>;
    static of(
        transition: Transition,
        options?: AnimationOptions
    ): AnimationDefinition {
        return new SimpleAnimation(transition, options);
    }
}

/** An animation of one play through the transition. */
export function animation(transition: Transition, options?: AnimationOptions): SimpleAnimation {
    return AnimationDefinition.of(transition, options);
}

/** The animation of a transition given together with its options. */
export function animationOf({delay, repeatCount, repeatDelay, repeatMode, ...transition}: TransitionAndOptions): SimpleAnimation {
    const options = Object.fromEntries(Object.entries({delay, repeatCount, repeatDelay, repeatMode}).filter(([, value]) => value !== undefined));
    return new SimpleAnimation(transition as Transition, options);
}

export class SimpleAnimation extends AnimationDefinition {
    readonly type = "simple" as const;
    /** How long one play lasts. */
    readonly duration: Seconds;
    readonly easing: EasingFunction;

    constructor(readonly transition: Transition, options?: AnimationOptions) {
        super(options);
        checkTransition(transition, "The animation's transition");
        const {duration, easing} = resolveTransition(transition);
        this.duration = duration;
        this.easing = easing;
    }
}

// export class SelfTimedAnimation<T extends string[]> extends AnimationDefinition {
//     readonly type = "self-timed" as const;
//     constructor(
//         readonly transition: Transition,
//         readonly tweens: {
//             readonly [I in keyof T]: RatioTween<T[I]>;
//         },
//         options?: AnimationOptions
//     ) {
//         super(options);
//     }
// }

/** @internal */
export class TimedTweenAnimation<T extends string[]> extends AnimationDefinition {
    readonly type = "timed-tween" as const;
    readonly tweens: { readonly [I in keyof T]: TimedTween<T[I]>; };

    constructor(tweens: { readonly [I in keyof T]: TimedTween<T[I]>; }, options?: AnimationOptions) {
        super(options);
        const givenTweens: readonly TimedTween[] = tweens;
        for (const tween of givenTweens) {
            checkNumber(tween.repeatCount, `Tween "${tween.name}"'s repeat count`);
            checkNumber(tween.delay, `Tween "${tween.name}"'s delay`);
            checkNumber(tween.repeatDelay, `Tween "${tween.name}"'s repeat delay`);
            checkTransition(tween.transition, `Tween "${tween.name}"'s transition`);
        }
        this.tweens = givenTweens.map(tween => clampedDelay(clampedRepeats(tween))) as unknown as typeof this.tweens;
    }
    // easing?: EasingDescriptor;           // compounds with each tween's easing
}
