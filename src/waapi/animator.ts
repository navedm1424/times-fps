import type {AnimationTiming} from "../animation.ts";
import {layoutOf, entryPathOf, type EntryPath} from "../resolution/layout.ts";
import {SequenceTiming} from "../sequence.ts";
import {AnimationControls} from "./controls.ts";
import {domValueResolver, keyframePropertyOf, resolveElementValues} from "./css-values.ts";
import {type AnimationMapping, type MappingTree, type PlayOptions, resolveTargets, type SequenceMappingNode} from "../dom/mapping.ts";
import {cssEasingOf} from "./native-easing.ts";
import {type AnimationTracks, AnimationTracksResolver, type ElementValues} from "./tracks.ts";

/** Each animation leaf's values, and the path its animations are named by. */
interface Leaves {
    valuesByPath: Map<EntryPath, ElementValues[]>;
    idPathByPath: Map<EntryPath, EntryPath | undefined>;
}

/** The tracks, and the path each leaf's animations are named by. */
interface NamedTracks {
    tracks: AnimationTracks;
    idPathByPath: ReadonlyMap<EntryPath, EntryPath | undefined>;
}

/**
 * Plays timings on elements with WAAPI.
 * It resolves the targets and values of the mapping, the layout of the timing, and the tracks those make, then creates an animation for each track's effects.
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
        const elementValues = WAAPIAnimator.elementValuesOf(mapping, scope);
        const tracks = AnimationTracksResolver.resolve(layoutOf(timing, elementValues.length), () => elementValues, domValueResolver);
        return {tracks, idPathByPath: new Map()};
    }

    private static sequenceTracks(sequence: SequenceTiming, mapping: SequenceMappingNode, scope: Element): NamedTracks {
        const leaves: Leaves = {valuesByPath: new Map(), idPathByPath: new Map()};
        WAAPIAnimator.resolveSequenceValues(sequence, mapping, undefined, undefined, scope, leaves);
        const {valuesByPath, idPathByPath} = leaves;
        const elementCounts = new Map([...valuesByPath].map(([path, elementValues]) => [path, elementValues.length]));
        const tracks = AnimationTracksResolver.resolve(layoutOf(sequence, elementCounts), path => valuesByPath.get(path)!, domValueResolver);
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
                leaves.valuesByPath.set(entryPath, WAAPIAnimator.elementValuesOf(entryMapping as AnimationMapping, scope));
                leaves.idPathByPath.set(entryPath, entryIdPath);
            }
        }
    }

    private static elementValuesOf({target, values}: AnimationMapping, scope: Element): ElementValues[] {
        return resolveElementValues(resolveTargets(target, scope), values);
    }

    /** Creates the effects in their tracks' order, so the ones declared later show over the earlier ones; each is named by its entry's path and its property. */
    private static animate({tracks, idPathByPath}: NamedTracks): Animation[] {
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
                const idPath = path === undefined ? undefined : idPathByPath.get(path);
                animation.id = idPath ? `${idPath}:${property}` : property;
                return animation;
            });
        }));
    }
}
