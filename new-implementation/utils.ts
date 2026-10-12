
import type {Easing} from "./easing.js";
import type {Progress, Seconds, Stagger} from "./types.js";

declare function ease(easing: Easing, progress: Progress): Progress;

export function stagger(each: Seconds, options: {
    from?: 'first' | 'last' | 'center' | number;
    easing?: Easing;
} = {}): Stagger {
    const {from = 'first', easing} = options;
    return (index, total) => {
        const origin = originIndex(from, total);
        const distance = Math.abs(index - origin);
        if (!easing) return distance * each;

        const farthestDistance = Math.max(origin, total - 1 - origin);
        if (farthestDistance === 0) return 0;
        return ease(easing, distance / farthestDistance) * farthestDistance * each;
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
