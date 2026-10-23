import {Animator} from "../animator.ts";
import type {AnimatorOptions} from "../dom/mapping.ts";
import {planOf} from "../resolution/plan.ts";
import type {Definition} from "../sequence.ts";
import {AnimationControls} from "./controls.ts";
import {domValueResolver, keyframePropertyOf} from "./css-values.ts";
import {cssEasingOf} from "./native-easing.ts";
import {type AnimationTracks, AnimationTracksResolver} from "./tracks.ts";

/** An animator whose selectors and target functions look for elements in the scope given. */
export function animator(options: AnimatorOptions = {}): Animator {
    return new WAAPIAnimator(options);
}

/**
 * Plays definitions on elements with WAAPI.
 * It plans the definition, resolving its targets, then resolves the tracks the plan makes, and creates an animation for each track's effects.
 */
export class WAAPIAnimator extends Animator {
    readonly #options: AnimatorOptions;

    constructor(options: AnimatorOptions = {}) {
        super();
        this.#options = options;
    }

    protected animateDefinition(definition: Definition): AnimationControls {
        const plan = planOf(definition, this.#options.scope ?? document.documentElement);
        return new AnimationControls(WAAPIAnimator.nativeAnimationsOf(AnimationTracksResolver.resolve(plan, domValueResolver)));
    }

    /** Creates the effects in their tracks' order, so the ones declared later show over the earlier ones; each is named by its entry's path and its property. */
    private static nativeAnimationsOf(tracks: AnimationTracks): Animation[] {
        return [...tracks].flatMap(([element, effectsByProperty]) => Object.entries(effectsByProperty).flatMap(([property, effects]) => {
            const keyframeProperty = keyframePropertyOf(property);
            return effects.map(({keyframes, easing, delay, duration, iterations, direction, fill, path}) => {
                const animation = element.animate(
                    keyframes.map(keyframe => ({
                        offset: keyframe.offset,
                        [keyframeProperty]: keyframe.value,
                        ...(keyframe.easing && {easing: cssEasingOf(keyframe.easing)})
                    })),
                    {delay: delay * 1000, duration: duration * 1000, iterations, direction, fill, easing: cssEasingOf(easing)}
                );
                animation.id = path ? `${path}:${property}` : property;
                return animation;
            });
        }));
    }
}
