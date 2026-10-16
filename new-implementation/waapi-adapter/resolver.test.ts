import {describe, expect, it} from "vitest";
import {Animation, type AnimationOptions, type SimpleAnimation} from "../animation.js";
import {eased, spring, type Transition} from "../transition.js";
import {invLerp, lerp} from "../utils.js";
import {CubicBezierEasing, StepsEasing, type ResolvedEasing} from "./easing.js";
import {AnimationKeyframesResolver, ResolvedAnimationEffect} from "./animation-effects.js";
import {type SimpleAnimationMapping, SimpleAnimationResolver} from "./resolver.js";
import {PropertyValues} from "./stops.js";
import {resolveTransition} from "./transition-curve.js";

const target = {} as Element;
const values = {
    opacity: {0: 0, 0.5: 0.8, 1: 1},
    scale: {0.25: 1, 1: 1.2}
};

describe("SimpleAnimationResolver", () => {
    it("resolves a linear transition", () => {
        new SimpleAnimationResolver(0, Animation.of(eased(0.4)), {target, values}).resolve();
    });

    it("resolves a preset easing", () => {
        new SimpleAnimationResolver(0, Animation.of(eased(0.4, 'easeOut')), {target, values}).resolve();
    });

    it("resolves a steps easing", () => {
        new SimpleAnimationResolver(0, Animation.of(eased(0.4, [4, 'jumpStart'])), {target, values}).resolve();
    });

    it("resolves a perceptual spring", () => {
        new SimpleAnimationResolver(0, Animation.of(spring({duration: 0.5, bounce: 0.3})), {target, values}).resolve();
    });

    it("resolves a physical spring", () => {
        new SimpleAnimationResolver(0, Animation.of(spring({stiffness: 260, damping: 22})), {target, values}).resolve();
    });

    for (const repeatMode of ['loop', 'mirror', 'reverse'] as const) {
        it(`resolves a ${repeatMode} repeat with a repeat delay`, () => {
            const animation = Animation.of(eased(0.4, 'easeInOut'), {repeatCount: 3, repeatDelay: 0.2, repeatMode});
            const effects = new SimpleAnimationResolver(0, animation, {target, values}).resolve();
            console.log(effects);
        });
    }
});

const line = {x: {0: 0, 1: 1}};

function effectsOf(animation: SimpleAnimation, values: SimpleAnimationMapping['values'] = line): ResolvedAnimationEffect[] {
    return new SimpleAnimationResolver(0, animation, {target, values}).resolve().get(target)!;
}

function timingOf({delay, duration, iterations, direction, fill}: ResolvedAnimationEffect) {
    return {delay, duration, iterations, direction, fill};
}

function keyframesOf(effect: ResolvedAnimationEffect): number[][] {
    return effect.animation.x!.map(({offset, value}) => [offset, value]);
}

function closeTo(rows: number[][]) {
    return rows.map(row => row.map(number => expect.closeTo(number, 9)));
}

/** The easing's output at `x`, as a browser computes it. */
function ease(easing: ResolvedEasing | undefined, x: number): number {
    if (easing instanceof CubicBezierEasing) return easing.curve.coordinateAt('y', easing.curve.parameterAt('x', x));
    if (easing instanceof StepsEasing) {
        const [count, position = 'jumpEnd'] = easing.definition;
        const jumps = {jumpStart: count, jumpEnd: count, jumpNone: count - 1, jumpBoth: count + 1}[position];
        const step = Math.floor(x * count) + (position === 'jumpStart' || position === 'jumpBoth' ? 1 : 0);
        return Math.min(Math.max(step, 0), jumps) / jumps;
    }
    return x;
}

/** The property's value at `x` through one iteration of the effect, as a browser computes it. */
function valueAt(effect: Pick<ResolvedAnimationEffect, 'animation' | 'easing'>, property: string, x: number): number {
    const progress = ease(effect.easing, x);
    const keyframes = effect.animation[property]!;
    const nextIndex = keyframes.findIndex(keyframe => keyframe.offset >= progress);
    const index = nextIndex === -1 ? keyframes.length - 1 : Math.max(1, nextIndex);
    const from = keyframes[index - 1]!;
    const to = keyframes[index]!;
    const localProgress = to.offset > from.offset ? invLerp(progress, from.offset, to.offset) : 1;
    return lerp(from.value, to.value, ease(to.easing, localProgress));
}

describe("SimpleAnimationResolver layouts", () => {
    const play = eased(1);
    const repeats = (options: AnimationOptions) => effectsOf(Animation.of(play, {repeatDelay: 0.5, ...options}));

    it("plays once without repeats", () => {
        const effects = effectsOf(Animation.of(eased(1, 'easeInOut')));
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 1, iterations: 1, direction: 'normal', fill: 'both'}]);
        expect(effects[0]!.easing).toBe(resolveTransition(eased(1, 'easeInOut')).curve.singleEasing);
    });

    it("repeats natively without a repeat delay", () => {
        expect(effectsOf(Animation.of(play, {repeatCount: 2, repeatMode: 'loop'})).map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: 3, direction: 'normal', fill: 'both'}]);
        expect(effectsOf(Animation.of(play, {repeatCount: 2, repeatMode: 'reverse'})).map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: 3, direction: 'alternate', fill: 'both'}]);
    });

    it("loops as [original+hold] × repeatCount, then original on its own", () => {
        const effects = repeats({repeatCount: 2, repeatMode: 'loop'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 1.5, iterations: 2, direction: 'normal', fill: 'backwards'},
            {delay: 3, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[0]!)).toEqual(closeTo([[0, 0], [2 / 3, 1], [1, 1]]));
        expect(keyframesOf(effects[1]!)).toEqual(closeTo([[0, 0], [1, 1]]));
    });

    it("loops forever as [original+hold] × ∞", () => {
        expect(repeats({repeatCount: Infinity, repeatMode: 'loop'}).map(timingOf))
            .toEqual([{delay: 0, duration: 1.5, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("mirrors an odd play count as [original+hold, backward+hold] × repeatCount/2, then original on its own", () => {
        const effects = repeats({repeatCount: 2, repeatMode: 'mirror'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 3, iterations: 1, direction: 'normal', fill: 'backwards'},
            {delay: 3, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[0]!)).toEqual(closeTo([[0, 0], [1 / 3, 1], [0.5, 1], [0.5, 1], [5 / 6, 0], [1, 0]]));
    });

    it("mirrors an even play count as [original+hold, backward+hold] × (playCount−2)/2, then [original+hold, backward] once", () => {
        const effects = repeats({repeatCount: 3, repeatMode: 'mirror'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 3, iterations: 1, direction: 'normal', fill: 'backwards'},
            {delay: 3, duration: 2.5, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[1]!)).toEqual(closeTo([[0, 0], [0.4, 1], [0.6, 1], [0.6, 1], [1, 0]]));
    });

    it("mirrors two plays as [original+hold, backward] once", () => {
        expect(repeats({repeatCount: 1, repeatMode: 'mirror'}).map(timingOf))
            .toEqual([{delay: 0, duration: 2.5, iterations: 1, direction: 'normal', fill: 'both'}]);
    });

    it("mirrors forever as [original+hold, backward+hold] × ∞", () => {
        expect(repeats({repeatCount: Infinity, repeatMode: 'mirror'}).map(timingOf))
            .toEqual([{delay: 0, duration: 3, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("resolves nothing for a play without duration", () => {
        expect(new SimpleAnimationResolver(0, Animation.of(eased(0)), {target, values: line}).resolve().size).toBe(0);
    });
});

describe("SimpleAnimationResolver delays", () => {
    const targets = [{} as Element, {} as Element, {} as Element];

    it("adds each target's staggered delay to its effects", () => {
        const animation = Animation.of(eased(1), {repeatCount: 2, repeatDelay: 0.5, repeatMode: 'loop', delay: index => index * 0.25});
        const effects = new SimpleAnimationResolver(0, animation, {target: targets, values: line}).resolve();
        expect(targets.map(element => effects.get(element)!.map(({delay}) => delay))).toEqual([[0, 3], [0.25, 3.25], [0.5, 3.5]]);
    });

    it("clamps negative staggered delays to 0", () => {
        const animation = Animation.of(eased(1), {delay: index => index - 1});
        expect(new SimpleAnimationResolver(0, animation, {target: targets, values: line}).targetDelays).toEqual([0, 0, 1]);
    });

    it("rejects staggered delays that aren't finite", () => {
        const animation = Animation.of(eased(1), {delay: () => NaN});
        expect(() => new SimpleAnimationResolver(0, animation, {target: targets, values: line})).toThrow(RangeError);
    });
});

describe("SimpleAnimationResolver final play", () => {
    const cases = [
        ['loop', {repeatCount: 2, repeatDelay: 0.5, repeatMode: 'loop'}],
        ['mirror', {repeatCount: 2, repeatDelay: 0.5, repeatMode: 'mirror'}],
        ['reverse', {repeatCount: 2, repeatDelay: 0.5, repeatMode: 'reverse'}]
    ] as const;

    /** The final play's keyframes against the stops eased as a whole, which is what the play means. */
    function largestDeviation(transition: Transition, options: AnimationOptions): number {
        const finalPlay = effectsOf(Animation.of(transition, options), values).at(-1)!;
        const referenceKeyframes = new AnimationKeyframesResolver(PropertyValues.of(values), resolveTransition(transition).curve);
        const reference = {animation: referenceKeyframes.resolve(), easing: referenceKeyframes.effectEasing};
        let largest = 0;
        for (const property of Object.keys(values))
            for (let step = 0; step <= 1000; step++)
                largest = Math.max(largest, Math.abs(valueAt(finalPlay, property, step / 1000) - valueAt(reference, property, step / 1000)));
        return largest;
    }

    for (const [repeatMode, options] of cases) {
        it(`follows a cubic Bézier easing after a ${repeatMode} repeat`, () => {
            expect(largestDeviation(eased(1, 'easeInOut'), options)).toBeLessThan(1e-9);
            expect(largestDeviation(eased(1, [0.3, 1.6, 0.6, 1]), options)).toBeLessThan(1e-9);
        });

        it(`follows a steps easing after a ${repeatMode} repeat`, () => {
            expect(largestDeviation(eased(1, [4, 'jumpStart']), options)).toBeLessThan(1e-9);
        });
    }
});
