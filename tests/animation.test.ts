import {describe, expect, it} from "vitest";
import {AnimationDefinition} from "../src/animation.js";
import {eased, spring} from "../src/transition.js";

describe("AnimationDefinition.of", () => {
    it("rejects time fields that aren't finite", () => {
        expect(() => AnimationDefinition.of(eased(NaN))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(spring({visualDuration: Infinity, bounce: 0}))).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(1), {delay: Infinity})).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(1), {repeatDelay: NaN})).toThrow(RangeError);
        expect(() => AnimationDefinition.of([{name: 'a', transition: eased(1), delay: NaN}])).toThrow(RangeError);
        expect(() => AnimationDefinition.of([{name: 'a', transition: eased(1), repeatDelay: Infinity}])).toThrow(RangeError);
        expect(() => AnimationDefinition.of([{name: 'a', transition: eased(Infinity)}])).toThrow(RangeError);
    });

    it("rejects a repeat count that isn't a number, and a tween's infinite one", () => {
        expect(() => AnimationDefinition.of(eased(1), {repeatCount: NaN})).toThrow(RangeError);
        expect(() => AnimationDefinition.of(eased(1), {repeatCount: Infinity})).not.toThrow();
        expect(() => AnimationDefinition.of([{name: 'a', transition: eased(1), repeatCount: Infinity}])).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(AnimationDefinition.of(eased(1), {delay: -1, repeatCount: -1.5, repeatDelay: -1}).options).toEqual({delay: 0, repeatCount: 0, repeatDelay: 0});
        expect(AnimationDefinition.of(eased(1), {repeatCount: 2.7}).options.repeatCount).toBe(2);
        const [tween] = AnimationDefinition.of([{name: 'a', transition: eased(1), delay: -2, repeatCount: 1.5, repeatDelay: -1}]).tweens;
        expect(tween).toMatchObject({delay: 0, repeatCount: 1, repeatDelay: 0});
    });
});
