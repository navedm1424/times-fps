import type {StretchableTransition, Transition} from "./transition.js";
import type {Ratio, RepeatOptions, Seconds, Stagger} from "./types.js";

/** `repeatCount` must be finite. */
export interface TimedTween<Name extends string = string> extends RepeatOptions {
    name: Name;
    transition: Transition;
    delay?: Seconds;
}

export interface RatioTween<Name extends string = string> {
    name: Name;
    ratio?: Ratio;             // omitted = equal share of what's left
    transition?: StretchableTransition;
}

export interface AnimationOptions extends RepeatOptions {
    delay?: Seconds | Stagger;
}

export class Animation {
    protected constructor(readonly options: AnimationOptions = {}) {}

    static of(transition: Transition, options?: AnimationOptions): SimpleAnimation;
    static of<T extends string[]>(transition: Transition, tweens: { [I in keyof T]: RatioTween<T[I]>; }, options?: AnimationOptions): SelfTimedAnimation<T>;
    static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, options?: AnimationOptions): TweenTimedAnimation<T>;
    static of(
        transitionOrTweens: Transition | readonly TimedTween[],
        tweensOrOptions?: readonly RatioTween[] | AnimationOptions,
        options?: AnimationOptions
    ): Animation {
        if (!('type' in transitionOrTweens)) {
            const tweens = transitionOrTweens;
            for (const tween of tweens) {
                if (tween.repeatCount !== undefined && !Number.isFinite(tween.repeatCount)) {
                    throw new RangeError(`Tween "${tween.name}" must repeat a finite number of times.`);
                }
            }
            return new TweenTimedAnimation(tweens, tweensOrOptions as AnimationOptions | undefined);
        }

        const transition = transitionOrTweens;
        if (tweensOrOptions === undefined || !('length' in tweensOrOptions))
            return new SimpleAnimation(transition, tweensOrOptions);

        return new SelfTimedAnimation(transition, tweensOrOptions, options);
    }
}

export class SimpleAnimation extends Animation {
    readonly type = "simple" as const;
    constructor(readonly transition: Transition, options?: AnimationOptions) {
        super(options);
    }
}

export class SelfTimedAnimation<T extends string[]> extends Animation {
    readonly type = "self-timed" as const;
    constructor(
        readonly transition: Transition,
        readonly tweens: {
            readonly [I in keyof T]: RatioTween<T[I]>;
        },
        options?: AnimationOptions
    ) {
        super(options);
    }
}

export class TweenTimedAnimation<T extends string[]> extends Animation {
    readonly type = "tween-timed" as const;
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

export type MultiTweenAnimation<T extends string[]> = SelfTimedAnimation<T> | TweenTimedAnimation<T>;
