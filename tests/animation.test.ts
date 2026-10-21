import {describe, expect, it} from "vitest";
import {AnimationTiming, TimedTweenTiming} from "../src/animation.js";
import {DampedSpring} from "../src/damped-spring.js";
import {PRECISION} from "../src/constants.js";
import {stagger} from "../src/stagger.js";
import type {TransitionOptions} from "../src/transition.js";

describe("AnimationTiming.of", () => {
    it("rejects time fields that aren't finite", () => {
        expect(() => AnimationTiming.of({duration: NaN})).toThrow(RangeError);
        expect(() => AnimationTiming.of({visualDuration: Infinity, bounce: 0})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1}, {delay: Infinity})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1}, {repeatDelay: NaN})).toThrow(RangeError);
        expect(() => new TimedTweenTiming([{name: 'a', transition: {duration: 1}, delay: NaN}])).toThrow(RangeError);
        expect(() => new TimedTweenTiming([{name: 'a', transition: {duration: 1}, repeatDelay: Infinity}])).toThrow(RangeError);
        expect(() => new TimedTweenTiming([{name: 'a', transition: {duration: Infinity}}])).toThrow(RangeError);
    });

    it("rejects a repeat count that isn't a number, and a tween's infinite one", () => {
        expect(() => AnimationTiming.of({duration: 1}, {repeat: NaN})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1}, {repeat: Infinity})).not.toThrow();
        expect(() => new TimedTweenTiming([{name: 'a', transition: {duration: 1}, repeat: Infinity}])).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(AnimationTiming.of({duration: 1}, {delay: -1, repeat: -1.5, repeatDelay: -1}).options).toEqual({delay: 0, repeat: 0, repeatDelay: 0});
        expect(AnimationTiming.of({duration: 1}, {repeat: 2.7}).options.repeat).toBe(2);
        const [tween] = new TimedTweenTiming([{name: 'a', transition: {duration: 1}, delay: -2, repeat: 1.5, repeatDelay: -1}]).tweens;
        expect(tween).toMatchObject({delay: 0, repeat: 1, repeatDelay: 0});
    });

    it("rejects negative durations, and spring options no spring can come to rest with", () => {
        expect(() => AnimationTiming.of({duration: -1})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 0})).not.toThrow();
        expect(() => AnimationTiming.of({duration: 0, bounce: 0})).toThrow(RangeError);
        expect(() => AnimationTiming.of({visualDuration: -1, bounce: 0})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1, bounce: 1})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1, bounce: -1})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1, bounce: 0, velocity: NaN})).toThrow(RangeError);
        expect(() => AnimationTiming.of({stiffness: 0, damping: 10})).toThrow(RangeError);
        expect(() => AnimationTiming.of({stiffness: 100, damping: 0})).toThrow(RangeError);
        expect(() => AnimationTiming.of({stiffness: 100, damping: 10, mass: -1})).toThrow(RangeError);
        expect(() => AnimationTiming.of({stiffness: 100, damping: 10, restDelta: 1})).toThrow(RangeError);
        expect(() => AnimationTiming.of({stiffness: 100, damping: 10, restDelta: 0.01})).not.toThrow();
    });

    it("tells the kinds of transition apart by their keys, and rejects keys of another kind", () => {
        expect(AnimationTiming.of({duration: 1, easing: 'easeIn'}).easing.constructor.name).toBe('CubicBezierEasing');
        expect(AnimationTiming.of({duration: 1, bounce: 0.2}).duration).toBe(1);
        expect(AnimationTiming.of({visualDuration: 0.5, bounce: 0.2}).easing.constructor.name).toBe('SpringEasing');
        expect(AnimationTiming.of({stiffness: 100, damping: 10}).easing.constructor.name).toBe('SpringEasing');
        const mixed = (transition: object) => () => AnimationTiming.of(transition as TransitionOptions);
        expect(mixed({duration: 1, easing: 'easeIn', bounce: 0.2})).toThrow(TypeError);
        expect(mixed({duration: 1, stiffness: 100, damping: 10})).toThrow(TypeError);
        expect(mixed({visualDuration: 1, duration: 1, bounce: 0})).toThrow(TypeError);
        expect(mixed({stiffness: 100})).toThrow(TypeError);
        expect(mixed({easing: 'easeIn'})).toThrow(TypeError);
    });
});

describe("AnimationTiming.of with a descriptor", () => {
    it("splits a descriptor into its transition and its options", () => {
        const timing = AnimationTiming.of({duration: 0.6, bounce: 0.2, delay: 0.1, repeat: 2, repeatMode: 'mirror'});
        expect(timing.transition).toEqual({duration: 0.6, bounce: 0.2});
        expect(timing.options).toEqual({delay: 0.1, repeat: 2, repeatMode: 'mirror'});
    });

    it("gives the same timing as the transition and options passed apart", () => {
        const spread = AnimationTiming.of({duration: 0.4, easing: 'easeOut', delay: 0.2});
        const apart = AnimationTiming.of({duration: 0.4, easing: 'easeOut'}, {delay: 0.2});
        expect(spread.transition).toEqual(apart.transition);
        expect(spread.options).toEqual(apart.options);
    });
});

describe("DampedSpring factories", () => {
    it("comes to rest exactly at the duration it's made to rest at", () => {
        for (const [bounce, velocity] of [[0, 0], [0.3, 0], [-0.5, 0], [0.3, 4]] as const)
            expect(DampedSpring.restingAt(0.6, bounce, velocity, PRECISION).restTime(PRECISION)).toBeCloseTo(0.6, 9);
    });

    it("swings once in the visual duration, with the damping ratio of the bounce", () => {
        const spring = DampedSpring.visual(0.5, 0.3, 0);
        expect(spring.naturalFrequency).toBeCloseTo(4 * Math.PI, 12);
        expect(spring.dampingRatio).toBeCloseTo(0.7, 12);
        expect(DampedSpring.visual(0.5, -0.5, 0).dampingRatio).toBeCloseTo(2, 12);
    });
});

describe("stagger", () => {
    it("spaces neighbouring elements by `step`", () => {
        const delays = stagger({step: 0.1});
        expect([0, 1, 2].map(index => delays(index, 3))).toEqual([0, 0.1, 0.2]);
    });

    it("spreads the delays over `spread`, from the origin to the farthest elements", () => {
        const fromCenter = stagger({spread: 0.4, from: 'center'});
        expect([0, 1, 2, 3, 4].map(index => fromCenter(index, 5))).toEqual([0.4, 0.2, 0, 0.2, 0.4]);
        const eased = stagger({spread: 1, easing: [1, 'jumpEnd']});
        expect([0, 1, 2].map(index => eased(index, 3))).toEqual([0, 0, 1]);
        expect(stagger({spread: 1})(0, 1)).toBe(0);
    });

    it("starts the origin at `startDelay`", () => {
        const delays = stagger({step: 0.1, startDelay: 0.5, from: 'last'});
        expect([0, 1, 2].map(index => delays(index, 3))).toEqual([0.7, 0.6, 0.5]);
        expect(stagger({spread: 1, startDelay: 0.25})(0, 1)).toBe(0.25);
    });

    it("takes either `step` or `spread`, as finite numbers", () => {
        expect(() => stagger({} as {step: number})).toThrow(TypeError);
        expect(() => stagger({step: 0.1, spread: 1} as {step: number})).toThrow(TypeError);
        expect(() => stagger({step: Infinity})).toThrow(RangeError);
        expect(() => stagger({spread: NaN})).toThrow(RangeError);
        expect(() => stagger({step: 0.1, startDelay: NaN})).toThrow(RangeError);
    });
});
