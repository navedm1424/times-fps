import {type EasingDescriptor, resolveEasing} from "./easing.js";
import type {Seconds, Stagger} from "./types.js";
import {checkNumber} from "./utils/validation.js";

export function stagger(each: Seconds, options: {
    from?: 'first' | 'last' | 'center' | number;
    easing?: EasingDescriptor;
} = {}): Stagger {
    const {from = 'first', easing} = options;
    checkNumber(each, "The stagger's time between targets");
    if (typeof from === 'number') checkNumber(from, "The stagger's origin");
    const easingFunction = easing && resolveEasing(easing);
    return (index, total) => {
        const origin = originIndex(from, total);
        const distance = Math.abs(index - origin);
        if (!easingFunction) return distance * each;

        const farthestDistance = Math.max(origin, total - 1 - origin);
        if (farthestDistance === 0) return 0;
        return easingFunction.progressAt(distance / farthestDistance) * farthestDistance * each;
    };
}

function originIndex(from: 'first' | 'last' | 'center' | number, total: number): number {
    switch (from) {
        case 'first': return 0;
        case 'last': return total - 1;
        case 'center': return (total - 1) / 2;
        default: return from;
    }
}
