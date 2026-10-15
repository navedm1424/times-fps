import {describe, it} from "vitest";
import {Animation} from "../animation.js";
import {eased, spring} from "../transition.js";
import {SimpleAnimationResolver} from "./resolver.js";

const target = {} as Element;
const values = {
    opacity: {0: 0, 0.5: 0.8, 1: 1},
    scale: {0.25: 1, 1: 1.2}
};

describe("SimpleAnimationResolver", () => {
    it("resolves a linear transition", () => {
        new SimpleAnimationResolver(Animation.of(eased(0.4)), {target, values}).resolveEffects();
    });

    it("resolves a preset easing", () => {
        new SimpleAnimationResolver(Animation.of(eased(0.4, 'easeOut')), {target, values}).resolveEffects();
    });

    it("resolves a steps easing", () => {
        new SimpleAnimationResolver(Animation.of(eased(0.4, [4, 'jumpStart'])), {target, values}).resolveEffects();
    });

    it("resolves a perceptual spring", () => {
        new SimpleAnimationResolver(Animation.of(spring({duration: 0.5, bounce: 0.3})), {target, values}).resolveEffects();
    });

    it("resolves a physical spring", () => {
        new SimpleAnimationResolver(Animation.of(spring({stiffness: 260, damping: 22})), {target, values}).resolveEffects();
    });

    for (const repeatMode of ['loop', 'mirror', 'reverse'] as const) {
        it(`resolves a ${repeatMode} repeat with a repeat delay`, () => {
            const animation = Animation.of(eased(0.4, 'easeInOut'), {repeatCount: 3, repeatDelay: 0.2, repeatMode});
            new SimpleAnimationResolver(animation, {target, values}).resolveEffects();
        });
    }
});
