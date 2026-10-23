import type {AnimationTiming, AnimationTimingOptions} from "./animation-timing.ts";
import {animation, AnimationDefinition} from "./animation.ts";
import type {AnimationValues, SequenceMapping, Target} from "./dom/mapping.ts";
import {type Definition, SequenceDefinition} from "./sequence.ts";
import {SequenceTiming} from "./sequence-timing.ts";
import type {AnimationControls} from "./waapi/controls.ts";

type AnimationArgs = [target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions];
type SequenceArgs = [timing: SequenceTiming, mapping: SequenceMapping];
type DefinitionArgs = [definition: Definition];

/** Animates elements in one scope; each call starts right away, and gives the controls of what it started. */
export abstract class Animator {
    /** Plays one animation: which elements, which values, and how it moves through them. */
    animate(target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions): AnimationControls;
    /** Plays a sequence timing given with its mapping. */
    animate<Timing extends SequenceTiming>(timing: Timing, mapping: SequenceMapping<Timing>): AnimationControls;
    animate(definition: Definition): AnimationControls;
    animate(...args: AnimationArgs | SequenceArgs | DefinitionArgs): AnimationControls {
        const [first] = args;
        if (first instanceof AnimationDefinition || first instanceof SequenceDefinition) return this.animateDefinition(first);
        if (first instanceof SequenceTiming) return this.animateDefinition(SequenceDefinition.of(first, (args as SequenceArgs)[1]));
        return this.animateDefinition(animation(...args as AnimationArgs));
    }

    protected abstract animateDefinition(definition: Definition): AnimationControls;
}
