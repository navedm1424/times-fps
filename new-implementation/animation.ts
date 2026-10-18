import type {EasingFunction} from "./easing.js";
import {resolveTransition, type Transition} from "./transition.js";
import type {RepeatOptions, Seconds, Stagger} from "./types.js";
import {checkNumber, clampedDelay, clampedRepeats} from "./utils.js";

/** `repeatCount` must be finite. */
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

export interface AnimationOptions extends RepeatOptions {
    delay?: Seconds | Stagger;
}

export class AnimationDefinition {
    protected constructor(readonly options: AnimationOptions = {}) {}

    static of(transition: Transition, options?: AnimationOptions): SimpleAnimation;
    static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, options?: AnimationOptions): TimedTweenAnimation<T>;
    // static of<T extends string[]>(transition: Transition, tweens: { [I in keyof T]: RatioTween<T[I]>; }, options?: AnimationOptions): SelfTimedAnimation<T>;
    static of(
        transitionOrTweens: Transition | readonly TimedTween[],
        options?: AnimationOptions
    ): AnimationDefinition {
        if (options) {
            if (typeof options.delay === 'number') checkNumber(options.delay, "The animation's delay");
            checkNumber(options.repeatDelay, "The animation's repeat delay");
            checkNumber(options.repeatCount, "The animation's repeat count", {allowInfinity: true});
        }

        if (Array.isArray(transitionOrTweens)) {
            const tweens: TimedTween[] = transitionOrTweens;
            for (const tween of tweens) {
                checkNumber(tween.repeatCount, `Tween "${tween.name}"'s repeat count`);
                checkNumber(tween.delay, `Tween "${tween.name}"'s delay`);
                checkNumber(tween.repeatDelay, `Tween "${tween.name}"'s repeat delay`);
                checkTransition(tween.transition, `Tween "${tween.name}"'s transition`);
            }
            return new TimedTweenAnimation(tweens.map(tween => clampedDelay(clampedRepeats(tween))), options && clampedDelay(clampedRepeats(options)));
        }

        checkTransition(transitionOrTweens as Transition, "The animation's transition");
        return new SimpleAnimation(transitionOrTweens as Transition, options && clampedDelay(clampedRepeats(options)));
    }
}

function checkTransition(transition: Transition, label: string): void {
    if ('duration' in transition) checkNumber(transition.duration, `${label}'s duration`);
    if ('visualDuration' in transition) checkNumber(transition.visualDuration, `${label}'s visual duration`);
}

export class SimpleAnimation extends AnimationDefinition {
    readonly type = "simple" as const;
    /** How long one play lasts. */
    readonly duration: Seconds;
    readonly easing: EasingFunction;

    constructor(readonly transition: Transition, options?: AnimationOptions) {
        super(options);
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

export class TimedTweenAnimation<T extends string[]> extends AnimationDefinition {
    readonly type = "timed-tween" as const;
    constructor(
        readonly tweens: {
            readonly [I in keyof T]: TimedTween<T[I]>;
        },
        options?: AnimationOptions
    ) {
        super(options);
    }
    // easing?: Easing;           // compounds with each tween's easing
}
