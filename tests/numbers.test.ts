import {describe, it, expect} from "vitest";
import {invLerp, lerp, remap, saturate} from "../src/index.js";

describe("numbers", () => {
    describe("saturate", () => {
        it("returns value when in [0, 1]", () => {
            expect(saturate(0)).toBe(0);
            expect(saturate(0.5)).toBe(0.5);
            expect(saturate(1)).toBe(1);
        });
        it("clamps to 1 when value > 1", () => {
            expect(saturate(1.5)).toBe(1);
            expect(saturate(100)).toBe(1);
        });
        it("clamps to 0 when value < 0", () => {
            expect(saturate(-0.5)).toBe(0);
            expect(saturate(-100)).toBe(0);
        });
    });

    describe("lerp", () => {
        it("interpolates between start and end", () => {
            expect(lerp(0, 10, 0)).toBe(0);
            expect(lerp(0, 10, 1)).toBe(10);
            expect(lerp(0, 10, 0.5)).toBe(5);
            expect(lerp(0, 10, 0.3)).toBe(3);
        });
        it("clamps result to [start, end]", () => {
            expect(lerp(0, 10, -0.5)).toBe(0);
            expect(lerp(0, 10, 1.5)).toBe(10);
        });
    });

    describe("invLerp", () => {
        it("returns 0 when v === start", () => {
            expect(invLerp(0, 10, 0)).toBe(0);
        });
        it("returns 1 when v === end", () => {
            expect(invLerp(0, 10, 10)).toBe(1);
        });
        it("returns 0.5 when v is midpoint", () => {
            expect(invLerp(0, 10, 5)).toBe(0.5);
        });
        it("saturates to [0, 1]", () => {
            expect(invLerp(0, 10, -5)).toBe(0);
            expect(invLerp(0, 10, 15)).toBe(1);
        });
    });

    describe("remap", () => {
        it("returns value when ranges are same", () => {
            expect(remap(5, 0, 10, 0, 10)).toBe(5);
        });
        it("maps from current range to new range", () => {
            expect(remap(5, 0, 10, 0, 100)).toBe(50);
            expect(remap(0, 0, 10, 100, 200)).toBe(100);
            expect(remap(10, 0, 10, 100, 200)).toBe(200);
        });
        it("clamps when value outside current range", () => {
            expect(remap(-5, 0, 10, 0, 100)).toBe(0);
            expect(remap(15, 0, 10, 0, 100)).toBe(100);
        });
    });
});