import type {AnimationTiming} from "../animation.js";
import {computeTimings, entryPathOf, type EntryPath} from "../resolution/timings.js";
import {SequenceTiming} from "../sequence.js";
import {AnimationControls} from "./controls.js";
import {domValueResolver, keyframePropertyOf, resolveTargetValues} from "./css-values.js";
import {type AnimationMapping, type MappingTree, resolveTargets, type SequenceMappingNode} from "./mapping.js";
import {cssEasingOf} from "./native-easing.js";
import {type AnimationTracks, AnimationTracksResolver, type TargetValues} from "./tracks.js";

export interface PlayOptions {
    /** Where selectors and target functions look for elements; the document's root element by default. */
    scope?: Element;
}

/** Each animation leaf's values, and the path its animations are named by. */
interface Leaves {
    valuesByPath: Map<EntryPath, TargetValues[]>;
    idPathByPath: Map<EntryPath, EntryPath | undefined>;
}

/** The tracks, and the path each leaf's animations are named by. */
interface NamedTracks {
    tracks: AnimationTracks;
    idPathByPath: ReadonlyMap<EntryPath, EntryPath | undefined>;
}

/**
 * Plays timings on elements with WAAPI.
 * It resolves the targets and values of the mapping, the timings, and the tracks those make, then creates an animation for each track's effects.
 */
export class WAAPIAnimator {
    static play(
        timing: AnimationTiming | SequenceTiming,
        mapping: MappingTree,
        {scope = document.documentElement}: PlayOptions = {}
    ): AnimationControls {
        const namedTracks = timing instanceof SequenceTiming
            ? WAAPIAnimator.sequenceTracks(timing, mapping as SequenceMappingNode, scope)
            : WAAPIAnimator.animationTracks(timing, mapping as AnimationMapping, scope);
        return new AnimationControls(WAAPIAnimator.animate(namedTracks));
    }

    private static animationTracks(timing: AnimationTiming, mapping: AnimationMapping, scope: Element): NamedTracks {
        const targetValues = WAAPIAnimator.targetValuesOf(mapping, scope);
        const tracks = AnimationTracksResolver.resolve(computeTimings(timing, targetValues.length), () => targetValues, domValueResolver);
        return {tracks, idPathByPath: new Map()};
    }

    private static sequenceTracks(sequence: SequenceTiming, mapping: SequenceMappingNode, scope: Element): NamedTracks {
        const leaves: Leaves = {valuesByPath: new Map(), idPathByPath: new Map()};
        WAAPIAnimator.resolveSequenceValues(sequence, mapping, undefined, undefined, scope, leaves);
        const {valuesByPath, idPathByPath} = leaves;
        const targetCounts = new Map([...valuesByPath].map(([path, targetValues]) => [path, targetValues.length]));
        const tracks = AnimationTracksResolver.resolve(computeTimings(sequence, targetCounts), path => valuesByPath.get(path)!, domValueResolver);
        return {tracks, idPathByPath};
    }

    private static resolveSequenceValues(
        sequence: SequenceTiming,
        mapping: SequenceMappingNode,
        path: EntryPath | undefined,
        idPath: EntryPath | undefined,
        scope: Element,
        leaves: Leaves
    ): void {
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const entryPath = entryPathOf(path, name);
            const entryIdPath = mapping.splitsProperties ? idPath : entryPathOf(idPath, name);
            const entryMapping = mapping.entries[name]!;
            if ('sequence' in entry)
                WAAPIAnimator.resolveSequenceValues(entry.sequence, entryMapping as SequenceMappingNode, entryPath, entryIdPath, scope, leaves);
            else {
                leaves.valuesByPath.set(entryPath, WAAPIAnimator.targetValuesOf(entryMapping as AnimationMapping, scope));
                leaves.idPathByPath.set(entryPath, entryIdPath);
            }
        }
    }

    private static targetValuesOf({target, values}: AnimationMapping, scope: Element): TargetValues[] {
        return resolveTargetValues(resolveTargets(target, scope), values);
    }

    /** Creates the effects in their tracks' order, so the ones declared later show over the earlier ones; each is named by its entry's path and its property. */
    private static animate({tracks, idPathByPath}: NamedTracks): Animation[] {
        return [...tracks].flatMap(([target, effectsByProperty]) => Object.entries(effectsByProperty).flatMap(([property, effects]) => {
            const keyframeProperty = keyframePropertyOf(property);
            return effects.map(({keyframes, easing, delay, duration, iterations, direction, fill, path}) => {
                const animation = target.animate(
                    keyframes.map(keyframe => ({
                        offset: keyframe.offset,
                        [keyframeProperty]: keyframe.value,
                        ...(keyframe.easing && {easing: cssEasingOf(keyframe.easing)})
                    })),
                    {delay: delay * 1000, duration: duration * 1000, iterations, direction, fill, easing: cssEasingOf(easing)}
                );
                const idPath = path === undefined ? undefined : idPathByPath.get(path);
                animation.id = idPath ? `${idPath}:${property}` : property;
                return animation;
            });
        }));
    }
}
