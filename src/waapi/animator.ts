import type {AnimationTiming, AnimationTimingOptions} from "../animation.ts";
import {animation, AnimationDefinition, type Definition, sequence, SequenceDefinition} from "../definitions.ts";
import type {Animator} from "../animator.ts";
import {layoutOf} from "../resolution/layout.ts";
import {entryPathOf, type EntryPath, SequenceTiming} from "../sequence.ts";
import {AnimationControls} from "./controls.ts";
import {domValueResolver, keyframePropertyOf, resolveElementValues} from "./css-values.ts";
import {
    type AnimationMapping,
    type AnimationValues,
    type AnimatorOptions,
    resolveTargets,
    type SequenceMapping,
    type Target
} from "../dom/mapping.ts";
import {cssEasingOf} from "./native-easing.ts";
import {type AnimationTracks, AnimationTracksResolver, type ElementValues} from "./tracks.ts";

type AnimationArgs = [target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions];
type SequenceArgs = [timing: SequenceTiming, mapping: SequenceMapping];
type DefinitionArgs = [definition: Definition];

/**
 * Plays definitions on elements with WAAPI.
 * It resolves the targets and values of the definition, the layout of its timing, and the tracks those make, then creates an animation for each track's effects.
 */
export class WAAPIAnimator implements Animator {
    readonly #options: AnimatorOptions;

    constructor(options: AnimatorOptions = {}) {
        this.#options = options;
    }

    animate(target: Target, values: AnimationValues, timing: AnimationTiming | AnimationTimingOptions): AnimationControls;
    animate<Timing extends SequenceTiming>(timing: Timing, mapping: SequenceMapping<Timing>): AnimationControls;
    animate(definition: Definition): AnimationControls;
    animate(...args: AnimationArgs | SequenceArgs | DefinitionArgs): AnimationControls {
        const definition = WAAPIAnimator.definitionOf(args);
        const scope = this.#options.scope ?? document.documentElement;
        const tracks = definition instanceof SequenceDefinition
            ? WAAPIAnimator.sequenceTracks(definition.timing, definition.mapping, scope)
            : WAAPIAnimator.animationTracks(definition.timing, [definition.target, definition.values], scope);
        return new AnimationControls(WAAPIAnimator.nativeAnimationsOf(tracks));
    }

    /** A definition as given, or the one `animation` or `sequence` makes of the arguments. */
    private static definitionOf(args: AnimationArgs | SequenceArgs | DefinitionArgs): Definition {
        const [first] = args;
        if (first instanceof AnimationDefinition || first instanceof SequenceDefinition) return first;
        if (first instanceof SequenceTiming) return sequence(first, (args as SequenceArgs)[1]);
        return animation(...args as AnimationArgs);
    }

    private static animationTracks(timing: AnimationTiming, mapping: AnimationMapping, scope: Element): AnimationTracks {
        const elementValues = WAAPIAnimator.elementValuesOf(mapping, scope);
        return AnimationTracksResolver.resolve(layoutOf(timing, elementValues.length), () => elementValues, domValueResolver);
    }

    private static sequenceTracks(sequence: SequenceTiming, mapping: SequenceMapping, scope: Element): AnimationTracks {
        const valuesByPath = new Map<EntryPath, ElementValues[]>();
        WAAPIAnimator.resolveSequenceValues(sequence, mapping, undefined, scope, valuesByPath);
        const elementCounts = new Map([...valuesByPath].map(([path, elementValues]) => [path, elementValues.length]));
        return AnimationTracksResolver.resolve(layoutOf(sequence, elementCounts), path => valuesByPath.get(path)!, domValueResolver);
    }

    private static resolveSequenceValues(
        sequence: SequenceTiming,
        mapping: SequenceMapping,
        path: EntryPath | undefined,
        scope: Element,
        valuesByPath: Map<EntryPath, ElementValues[]>
    ): void {
        for (const entry of sequence.entries) {
            const entryPath = entryPathOf(path, entry.name);
            const entryMapping = mapping[entry.name]!;
            if ('sequence' in entry)
                WAAPIAnimator.resolveSequenceValues(entry.sequence, entryMapping as SequenceMapping, entryPath, scope, valuesByPath);
            else
                valuesByPath.set(entryPath, WAAPIAnimator.elementValuesOf(entryMapping as AnimationMapping, scope));
        }
    }

    private static elementValuesOf([target, values]: AnimationMapping, scope: Element): ElementValues[] {
        return resolveElementValues(resolveTargets(target, scope), values);
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
