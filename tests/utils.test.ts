import { describe, it, expect } from "vitest";
import {assignReadonlyProperties, makePropertiesReadonly} from "../src/utils/objects.runtime.js";

describe("object", () => {
    describe("assignReadonlyProperties", () => {
        it("assigns multiple properties as readonly", () => {
            const o: { a?: number; b?: string } = {};
            assignReadonlyProperties(o, { a: 1, get b() { return "x"; } });
            expect(o.a).toBe(1);
            expect(o.b).toBe("x");
            expect(() => { o.a = 2; }).toThrow();
            expect(() => Object.defineProperty(o, "a", { value: 2 })).toThrow();
            expect(() => Object.defineProperty(o, "b", { get() { return "y"; }})).toThrow();
        });
        it("makes properties non-configurable", () => {
            const o: { a?: number } = {};
            assignReadonlyProperties(o, { a: 1 });
            expect(() => delete o.a).toThrow();
        });
    });

    describe("makePropertiesReadonly", () => {
        it("makes existing properties readonly", () => {
            const o: { a: number; b: number } = { a: 1, b: 2 };
            makePropertiesReadonly(o, "a", "b");
            expect(o.a).toBe(1);
            expect(o.b).toBe(2);
            expect(() => { o.a = 99; }).toThrow();
            expect(() => Object.defineProperty(o, "a", { value: 99 })).toThrow();
        });
    });
});