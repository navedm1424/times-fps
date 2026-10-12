import type {StretchableTransition, Transition} from "./transition.js";
import type {Ratio, Repeat, Seconds} from "./types.js";

export interface TimedTween<Name extends string = string> {
    name: Name;
    transition: Transition;
    delay?: Seconds;
    repeat?: Repeat;           // count must be finite
}

export interface RatioTween<Name extends string = string> {
    name: Name;
    ratio?: Ratio;             // omitted = equal share of what's left
    transition?: StretchableTransition;
}

export class Animation {
    protected constructor(readonly repeat?: Repeat) {}

    static of(transition: Transition, repeat?: Repeat): SimpleAnimation;
    static of<T extends string[]>(transition: Transition, tweens: { [I in keyof T]: RatioTween<T[I]>; }, repeat?: Repeat): SelfTimedAnimation<T>;
    static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, repeat?: Repeat): TweenTimedAnimation<T>;
    static of(
        transitionOrTweens: Transition | readonly TimedTween[],
        tweensOrRepeat?: readonly RatioTween[] | Repeat,
        repeat?: Repeat
    ): Animation {
        if (!('type' in transitionOrTweens)) {
            const tweens = transitionOrTweens;
            for (const tween of tweens) {
                if (tween.repeat && !Number.isFinite(tween.repeat.count)) {
                    throw new RangeError(`Tween "${tween.name}" must repeat a finite number of times.`);
                }
            }
            return new TweenTimedAnimation(tweens, tweensOrRepeat as Repeat | undefined);
        }

        const transition = transitionOrTweens;
        if (tweensOrRepeat === undefined || 'count' in tweensOrRepeat)
            return new SimpleAnimation(transition, tweensOrRepeat);

        return new SelfTimedAnimation(transition, tweensOrRepeat, repeat);
    }
}

export class SimpleAnimation extends Animation {
    readonly type = "simple" as const;
    constructor(readonly transition: Transition, repeat?: Repeat) {
        super(repeat);
    }
}

export class SelfTimedAnimation<T extends string[]> extends Animation {
    readonly type = "self-timed" as const;
    constructor(
        readonly transition: Transition,
        readonly tweens: {
            readonly [I in keyof T]: RatioTween<T[I]>;
        },
        repeat?: Repeat
    ) {
        super(repeat);
    }
}

export class TweenTimedAnimation<T extends string[]> extends Animation {
    readonly type = "tween-timed" as const;
    constructor(
        readonly tweens: {
            readonly [I in keyof T]: TimedTween<T[I]>;
        },
        repeat?: Repeat
    ) {
        super(repeat);
    }
    // easing?: Easing;           // compounds with each tween's easing
}

export type MultiTweenAnimation<T extends string[]> = SelfTimedAnimation<T> | TweenTimedAnimation<T>;
