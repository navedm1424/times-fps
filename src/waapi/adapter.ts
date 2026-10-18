import type {SimpleAnimation} from "../animation.js";
import {Sequence} from "../sequence.js";
import type {SequenceEntries} from "../types.js";
import {keyframePropertyOf, resolveTargetValues} from "./css-values.js";
import {type AnimationMapping, resolveTargets, type SequenceMapping} from "./mapping.js";
import {cssEasingOf} from "./native-easing.js";
import {entryPathOf, type EntryPath, resolveTimings} from "./timings.js";
import {type AnimationTracks, AnimationTracksResolver, type TargetValues} from "./tracks.js";

/**
 * Plays definitions on elements with WAAPI.
 * It resolves the targets and values of the mapping, the timings of the definition, and the tracks those make, then creates an animation for each track's effects.
 */
export class WAAPIAdapter {
    /** `scope` is where selectors and target functions look for elements. */
    animate(animation: SimpleAnimation, mapping: AnimationMapping, scope?: Element): Animation[];
    animate<SE extends SequenceEntries>(sequence: Sequence<SE>, mapping: SequenceMapping<SE>, scope?: Element): Animation[];
    animate(
        definition: SimpleAnimation | Sequence,
        mapping: AnimationMapping | SequenceMapping,
        scope: Element = document.documentElement
    ): Animation[] {
        const tracks = definition instanceof Sequence
            ? WAAPIAdapter.sequenceTracks(definition, mapping as SequenceMapping, scope)
            : WAAPIAdapter.animationTracks(definition, mapping as AnimationMapping, scope);
        return WAAPIAdapter.play(tracks);
    }

    private static animationTracks(animation: SimpleAnimation, mapping: AnimationMapping, scope: Element): AnimationTracks {
        const targetValues = resolveTargetValues(resolveTargets(mapping.target, scope), mapping.values);
        return AnimationTracksResolver.resolve(resolveTimings(animation, targetValues.length), () => targetValues);
    }

    private static sequenceTracks(sequence: Sequence, mapping: SequenceMapping, scope: Element): AnimationTracks {
        const valuesByPath = new Map<EntryPath, TargetValues[]>();
        WAAPIAdapter.resolveSequenceValues(sequence, mapping, undefined, scope, valuesByPath);
        const targetCounts = new Map([...valuesByPath].map(([path, targetValues]) => [path, targetValues.length]));
        return AnimationTracksResolver.resolve(resolveTimings(sequence, targetCounts), path => valuesByPath.get(path)!);
    }

    private static resolveSequenceValues(
        sequence: Sequence,
        mapping: SequenceMapping | undefined,
        path: EntryPath | undefined,
        scope: Element,
        valuesByPath: Map<EntryPath, TargetValues[]>
    ): void {
        if (!mapping) throw new Error(path ? `No mapping present for "${path}".` : "No mapping present.");
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const entryPath = entryPathOf(path, name);
            const entryMapping = mapping[name];
            if (!entryMapping) throw new Error(`No mapping present for "${entryPath}".`);

            if ('sequence' in entry)
                WAAPIAdapter.resolveSequenceValues(entry.sequence, entryMapping as SequenceMapping, entryPath, scope, valuesByPath);
            else if (entry.animation.type === 'simple') {
                const {target, values} = entryMapping as AnimationMapping;
                valuesByPath.set(entryPath, resolveTargetValues(resolveTargets(target, scope), values));
            } else
                throw new Error(`Entry "${entryPath}" is a timed tween animation, which isn't supported yet.`);
        }
    }

    /** Creates the effects in their tracks' order, so the ones declared later show over the earlier ones. */
    private static play(tracks: AnimationTracks): Animation[] {
        return [...tracks].flatMap(([target, effectsByProperty]) => Object.entries(effectsByProperty).flatMap(([property, effects]) => {
            const keyframeProperty = keyframePropertyOf(property);
            return effects.map(({keyframes, unit, easing, delay, duration, iterations, direction, fill}) => target.animate(
                keyframes.map(keyframe => ({
                    offset: keyframe.offset,
                    [keyframeProperty]: `${keyframe.value}${unit}`,
                    ...(keyframe.easing && {easing: cssEasingOf(keyframe.easing)})
                })),
                {delay: delay * 1000, duration: duration * 1000, iterations, direction, fill, easing: cssEasingOf(easing)}
            ));
        }));
    }
}
