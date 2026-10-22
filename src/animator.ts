import type {AnimationTiming, AnimationTimingOptions} from "./animation.ts";
import type {Definition} from "./definitions.ts";
import type {AnimationValues, AnimatorOptions, SequenceMapping, Target} from "./dom/mapping.ts";
import type {SequenceTiming} from "./sequence.ts";
import type {AnimationControls} from "./waapi/controls.ts";
import {WAAPIAnimator} from "./waapi/animator.ts";

/** Animates elements in one scope; each call starts right away, and gives the controls of what it started. */
export interface Animator {
    /** Plays one animation: which elements, which values, and how it moves through them. */
    animate(target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions): AnimationControls;
    /** Plays a sequence timing given with its mapping. */
    animate<Timing extends SequenceTiming>(timing: Timing, mapping: SequenceMapping<Timing>): AnimationControls;
    animate(definition: Definition): AnimationControls;
}

/** An animator whose selectors and target functions look for elements in the scope given. */
export function animator(options: AnimatorOptions = {}): Animator {
    return new WAAPIAnimator(options);
}
