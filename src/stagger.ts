import {type EasingDescriptor, resolveEasing} from "./easing.js";
import type {Seconds, Stagger} from "./types.js";
import {checkNumber} from "./utils/validation.js";

type StaggerOrigin = 'first' | 'last' | 'center' | number;

/** `each` spaces neighbouring elements; `amount` is how long the farthest element waits. */
export type StaggerOptions = ({ each: Seconds; amount?: never } | { amount: Seconds; each?: never }) & {
    from?: StaggerOrigin;
    easing?: EasingDescriptor;
};

export function stagger(options: StaggerOptions): Stagger {
    const {each, amount, from = 'first', easing} = options;
    if ((each === undefined) === (amount === undefined))
        throw new TypeError("A stagger takes either `each` or `amount`.");
    checkNumber(each, "The stagger's time between elements");
    checkNumber(amount, "The stagger's amount");
    if (typeof from === 'number') checkNumber(from, "The stagger's origin");
    const easingFunction = easing && resolveEasing(easing);
    return (index, total) => {
        const origin = originIndex(from, total);
        const distance = Math.abs(index - origin);
        if (each !== undefined && !easingFunction) return distance * each;

        const farthestDistance = Math.max(origin, total - 1 - origin);
        if (farthestDistance === 0) return 0;
        const share = easingFunction ? easingFunction.progressAt(distance / farthestDistance) : distance / farthestDistance;
        return share * (each !== undefined ? farthestDistance * each : amount!);
    };
}

function originIndex(from: StaggerOrigin, total: number): number {
    switch (from) {
        case 'first': return 0;
        case 'last': return total - 1;
        case 'center': return (total - 1) / 2;
        default: return from;
    }
}
