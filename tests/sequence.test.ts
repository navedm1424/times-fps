import {describe, expect, it} from "vitest";
import {AnimationDefinition} from "../src/animation.js";
import {Sequence} from "../src/sequence.js";
import {eased} from "../src/transition.js";

describe("SequenceBuilder.build", () => {
    const builder = () => Sequence.builder().add('a', AnimationDefinition.of(eased(1)));

    it("rejects time fields that aren't finite and a repeat count that isn't a number", () => {
        expect(() => builder().build({delay: Infinity})).toThrow(RangeError);
        expect(() => builder().build({repeatDelay: NaN})).toThrow(RangeError);
        expect(() => builder().build({repeatCount: NaN})).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(builder().build({delay: -3, repeatCount: -2.5, repeatDelay: -1}).options).toEqual({delay: 0, repeatCount: 0, repeatDelay: 0});
        expect(builder().build({repeatCount: 2.7}).options.repeatCount).toBe(2);
    });
});
