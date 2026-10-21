import {checkEasingSpecifier, type EasingSpecifier, resolveEasing} from "./easing-specifier.ts";
import type {Seconds} from "./types.ts";
import {checkNumber} from "./utils/validation.ts";
import type {Stagger} from "./playback-options.ts";

export type StaggerOrigin = 'first' | 'last' | 'center' | number;

/** `step` spaces neighbouring elements; `spread` is how far apart the origin's and the farthest element's delays are. */
export type StaggerSpacing = { step: Seconds; spread?: never } | { spread: Seconds; step?: never };

/** `startDelay` is the origin's delay. */
export interface StaggerOptions {
    startDelay?: Seconds;
    from?: StaggerOrigin;
    easing?: EasingSpecifier;
}

export function stagger(step: Seconds, options?: StaggerOptions): Stagger;
export function stagger(options: StaggerSpacing & StaggerOptions): Stagger;
export function stagger(stepOrOptions: Seconds | (StaggerSpacing & StaggerOptions), options: StaggerOptions = {}): Stagger {
    const spacedOptions: StaggerSpacing & StaggerOptions = typeof stepOrOptions === 'number' ? {...options, step: stepOrOptions} : stepOrOptions;
    const {step, spread, startDelay = 0, from = 'first', easing} = spacedOptions;
    if ((step === undefined) === (spread === undefined))
        throw new TypeError("A stagger takes either `step` or `spread`.");
    checkNumber(step, "The stagger's step");
    checkNumber(spread, "The stagger's spread");
    checkNumber(startDelay, "The stagger's start delay");
    if (typeof from === 'number') checkNumber(from, "The stagger's origin");
    if (easing !== undefined) checkEasingSpecifier(easing, "The stagger's easing");
    const easingFunction = easing && resolveEasing(easing);
    const spreadDelay = (index: number, total: number): Seconds => {
        const origin = originIndex(from, total);
        const distance = Math.abs(index - origin);
        if (step !== undefined && !easingFunction) return distance * step;

        const farthestDistance = Math.max(origin, total - 1 - origin);
        if (farthestDistance === 0) return 0;
        const share = easingFunction ? easingFunction.progressAt(distance / farthestDistance) : distance / farthestDistance;
        return share * (step !== undefined ? farthestDistance * step : spread!);
    };
    return (index, total) => startDelay + spreadDelay(index, total);
}

function originIndex(from: StaggerOrigin, total: number): number {
    switch (from) {
        case 'first': return 0;
        case 'last': return total - 1;
        case 'center': return (total - 1) / 2;
        default: return from;
    }
}
