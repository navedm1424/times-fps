import {describe, expect, it} from "vitest";
import {AnimationControls} from "../src/waapi/controls.js";

describe("AnimationControls", () => {
    it("calls a finish listener once every animation has finished, until it's removed", () => {
        const animations = [new EventTarget(), new EventTarget()] as unknown as Animation[];
        const controls = new AnimationControls(animations);
        let calls = 0;
        const remove = controls.onFinish(() => calls++);
        animations[0]!.dispatchEvent(new Event('finish'));
        expect(calls).toBe(0);
        animations[1]!.dispatchEvent(new Event('finish'));
        expect(calls).toBe(1);
        remove();
        animations.forEach(animation => animation.dispatchEvent(new Event('finish')));
        expect(calls).toBe(1);
    });
});
