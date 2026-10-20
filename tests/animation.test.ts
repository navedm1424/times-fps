import {describe, expect, it} from "vitest";
import {AnimationTiming, animationTimingOf, TimedTweenAnimation} from "../src/animation.js";
import {stagger} from "../src/stagger.js";
import type {TransitionDescriptor} from "../src/transition.js";

describe("AnimationTiming.of", () => {
    it("rejects time fields that aren't finite", () => {
        expect(() => AnimationTiming.of({duration: NaN})).toThrow(RangeError);
        expect(() => AnimationTiming.of({visualDuration: Infinity, bounce: 0})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1}, {delay: Infinity})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1}, {repeatDelay: NaN})).toThrow(RangeError);
        expect(() => new TimedTweenAnimation([{name: 'a', transition: {duration: 1}, delay: NaN}])).toThrow(RangeError);
        expect(() => new TimedTweenAnimation([{name: 'a', transition: {duration: 1}, repeatDelay: Infinity}])).toThrow(RangeError);
        expect(() => new TimedTweenAnimation([{name: 'a', transition: {duration: Infinity}}])).toThrow(RangeError);
    });

    it("rejects a repeat count that isn't a number, and a tween's infinite one", () => {
        expect(() => AnimationTiming.of({duration: 1}, {repeat: NaN})).toThrow(RangeError);
        expect(() => AnimationTiming.of({duration: 1}, {repeat: Infinity})).not.toThrow();
        expect(() => new TimedTweenAnimation([{name: 'a', transition: {duration: 1}, repeat: Infinity}])).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(AnimationTiming.of({duration: 1}, {delay: -1, repeat: -1.5, repeatDelay: -1}).options).toEqual({delay: 0, repeat: 0, repeatDelay: 0});
        expect(AnimationTiming.of({duration: 1}, {repeat: 2.7}).options.repeat).toBe(2);
        const [tween] = new TimedTweenAnimation([{name: 'a', transition: {duration: 1}, delay: -2, repeat: 1.5, repeatDelay: -1}]).tweens;
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
        const mixed = (transition: object) => () => AnimationTiming.of(transition as TransitionDescriptor);
        expect(mixed({duration: 1, easing: 'easeIn', bounce: 0.2})).toThrow(TypeError);
        expect(mixed({duration: 1, stiffness: 100, damping: 10})).toThrow(TypeError);
        expect(mixed({visualDuration: 1, duration: 1, bounce: 0})).toThrow(TypeError);
        expect(mixed({stiffness: 100})).toThrow(TypeError);
        expect(mixed({easing: 'easeIn'})).toThrow(TypeError);
    });
});

describe("animationTimingOf", () => {
    it("splits a descriptor into its transition and its options", () => {
        const timing = animationTimingOf({duration: 0.6, bounce: 0.2, delay: 0.1, repeat: 2, repeatMode: 'mirror'});
        expect(timing.transition).toEqual({duration: 0.6, bounce: 0.2});
        expect(timing.options).toEqual({delay: 0.1, repeat: 2, repeatMode: 'mirror'});
    });

    it("takes a timing as it is", () => {
        const timing = AnimationTiming.of({duration: 1});
        expect(animationTimingOf(timing)).toBe(timing);
    });
});

describe("stagger", () => {
    it("spaces neighbouring elements by `each`", () => {
        const delays = stagger({each: 0.1});
        expect([0, 1, 2].map(index => delays(index, 3))).toEqual([0, 0.1, 0.2]);
    });

    it("makes the farthest elements wait `amount`", () => {
        const fromCenter = stagger({amount: 0.4, from: 'center'});
        expect([0, 1, 2, 3, 4].map(index => fromCenter(index, 5))).toEqual([0.4, 0.2, 0, 0.2, 0.4]);
        const eased = stagger({amount: 1, easing: [1, 'jumpEnd']});
        expect([0, 1, 2].map(index => eased(index, 3))).toEqual([0, 0, 1]);
        expect(stagger({amount: 1})(0, 1)).toBe(0);
    });

    it("takes either `each` or `amount`, as finite numbers", () => {
        expect(() => stagger({} as {each: number})).toThrow(TypeError);
        expect(() => stagger({each: 0.1, amount: 1} as {each: number})).toThrow(TypeError);
        expect(() => stagger({each: Infinity})).toThrow(RangeError);
        expect(() => stagger({amount: NaN})).toThrow(RangeError);
    });
});
