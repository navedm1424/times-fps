import {describe, it} from "vitest";
import {Animation} from "../animation.js";
import {eased, spring} from "../transition.js";
import {resolveSimpleAnimation} from "./resolver.js";

const target = {} as Element;
const values = {
    opacity: {0: 0, 0.5: 0.8, 1: 1},
    scale: {0.25: 1, 1: 1.2}
};

describe("resolveSimpleAnimation", () => {
    it("resolves a linear transition", () => {
        resolveSimpleAnimation(Animation.of(eased(0.4)), {target, values});
    });

    it("resolves a preset easing", () => {
        resolveSimpleAnimation(Animation.of(eased(0.4, 'easeOut')), {target, values});
    });

    it("resolves a steps easing", () => {
        resolveSimpleAnimation(Animation.of(eased(0.4, [4, 'jumpStart'])), {target, values});
    });

    it("resolves a perceptual spring", () => {
        resolveSimpleAnimation(Animation.of(spring({duration: 0.5, bounce: 0.3})), {target, values});
    });

    it("resolves a physical spring", () => {
        resolveSimpleAnimation(Animation.of(spring({stiffness: 260, damping: 22})), {target, values});
    });

    for (const repeatMode of ['loop', 'mirror', 'reverse'] as const) {
        it(`resolves a ${repeatMode} repeat with a repeat delay`, () => {
            const animation = Animation.of(eased(0.4, 'easeInOut'), {repeatCount: 3, repeatDelay: 0.2, repeatMode});
            resolveSimpleAnimation(animation, {target, values});
        });
    }
});
