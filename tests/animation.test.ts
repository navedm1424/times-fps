import {describe, expect, it} from "vitest";
import {AnimationDefinition, TimedTweenAnimation} from "../src/animation.js";
import {eased, spring} from "../src/transition.js";

describe("AnimationDefinition.of", () => {
    it("rejects time fields that aren't finite", () => {
        expect(() => AnimationDefinition.of(eased(NaN))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({visualDuration: Infinity, bounce: 0}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(1), {delay: Infinity})).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(1), {repeatDelay: NaN})).toThrow(RangeError);
        expect(() => new TimedTweenAnimation([{name: 'a', transition: eased(1), delay: NaN}])).toThrow(RangeError);
        expect(() => new TimedTweenAnimation([{name: 'a', transition: eased(1), repeatDelay: Infinity}])).toThrow(RangeError);
        expect(() => new TimedTweenAnimation([{name: 'a', transition: eased(Infinity)}])).toThrow(RangeError);
    });

    it("rejects a repeat count that isn't a number, and a tween's infinite one", () => {
        expect(() => AnimationDefinition.of(eased(1), {repeatCount: NaN})).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(1), {repeatCount: Infinity})).not.toThrow();
        expect(() => new TimedTweenAnimation([{name: 'a', transition: eased(1), repeatCount: Infinity}])).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(AnimationDefinition.of(eased(1), {delay: -1, repeatCount: -1.5, repeatDelay: -1}).options).toEqual({delay: 0, repeatCount: 0, repeatDelay: 0});
        expect(AnimationDefinition.of(eased(1), {repeatCount: 2.7}).options.repeatCount).toBe(2);
        const [tween] = new TimedTweenAnimation([{name: 'a', transition: eased(1), delay: -2, repeatCount: 1.5, repeatDelay: -1}]).tweens;
        expect(tween).toMatchObject({delay: 0, repeatCount: 1, repeatDelay: 0});
    });

    it("rejects negative durations, and spring options no spring can come to rest with", () => {
        expect(() => AnimationDefinition.of(eased(-1))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(0))).not.toThrow();
        expect(() => AnimationDefinition.of(spring({duration: 0, bounce: 0}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({visualDuration: -1, bounce: 0}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({duration: 1, bounce: 1}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({duration: 1, bounce: -1}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({duration: 1, bounce: 0, velocity: NaN}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({stiffness: 0, damping: 10}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({stiffness: 100, damping: 0}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({stiffness: 100, damping: 10, mass: -1}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({stiffness: 100, damping: 10, restDelta: 1}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({stiffness: 100, damping: 10, restDelta: 0.01}))).not.toThrow();
    });
});
