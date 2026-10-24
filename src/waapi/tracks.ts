import type {AnimationPlan, PlanNode, SequencePlan} from "../resolution/plan.ts";
import {entryPathOf, type EntryPath} from "../sequence-timing.ts";
import {TrackRun} from "../resolution/track-runs.ts";
import type {TweenStops} from "../tween-stops.ts";
import type {Seconds} from "../types.ts";
import {type CSSValueResolver, type EntryValues, resolveEffectChains} from "./effect-chains.ts";
import {type NativeAnimationEffect, nativeEffectOf} from "./native-effects.ts";
import type {RepeatOptions} from "../playback-options.ts";

/** Each element's properties, each with its effects in the order they're declared, which is the order they show over each other in. */
export type AnimationTracks = Map<Element, { [property: string]: NativeAnimationEffect[] }>;

/** Which element's property a run or an effect animates, and where its entry is declared, which decides what shows over what. */
interface TrackKey {
    element: Element;
    property: string;
    /** The animation leaf it comes from, which is undefined for an animation on its own. */
    path: EntryPath | undefined;
    /** The stops its entry gives the property, before any repeat flips them. */
    entryStops: TweenStops;
    order: readonly number[];
}

/** Plays that the sequences around them haven't repeated yet. */
interface KeyedRun extends TrackKey {
    run: TrackRun;
}

/** One effect's plays, placed in time, before its fill and its easings. */
export interface ScheduledEffect extends TrackKey {
    delay: Seconds;
    duration: Seconds;
    iterations: number;
    direction: PlaybackDirection;
    /** In the time of one iteration, from 0 to `duration`. */
    run: TrackRun;
}

export interface PlacedEffect extends ScheduledEffect {
    fill: FillMode;
}

/** An effect whose values are numbers in `unit`, or pass through to WAAPI as CSS text when it has none. */
export interface ResolvedEffect extends PlacedEffect {
    unit: string | undefined;
    values: EntryValues;
}

/** What an entry puts on the tracks, in the time of the iteration of the sequence it's in. */
interface Contribution {
    runs: KeyedRun[];
    effects: ScheduledEffect[];
}

type EffectTiming = Pick<ScheduledEffect, 'delay' | 'duration' | 'iterations' | 'direction' | 'run'>;

/**
 * Resolves the plan into tracks in four stages: the repetitions, the fill conflicts, the values, then the easings.
 * Only the outermost repeat runs as WAAPI iterations; the ones inside it are baked into the keyframes, except that an infinite one only gives its first iteration, and an effect continuing it from there.
 */
export class AnimationTracksResolver {
    static resolve(plan: PlanNode, valueResolver: CSSValueResolver): AnimationTracks {
        const {effects} = AnimationTracksResolver.scheduleRepetitions(plan, undefined, [], false);

        const effectsByTrack = new Map<Element, Map<string, ScheduledEffect[]>>();
        for (const effect of effects) {
            let effectsByProperty = effectsByTrack.get(effect.element);
            if (!effectsByProperty) effectsByTrack.set(effect.element, effectsByProperty = new Map());
            let trackEffects = effectsByProperty.get(effect.property);
            if (!trackEffects) effectsByProperty.set(effect.property, trackEffects = []);
            trackEffects.push(effect);
        }

        return new Map([...effectsByTrack].map(([element, effectsByProperty]) => [element, Object.fromEntries(
            [...effectsByProperty].map(([property, trackEffects]) => {
                const declared = trackEffects.sort((first, second) => compareOrders(first.order, second.order));
                const placed = AnimationTracksResolver.placeFills(declared);
                return [property, resolveEffectChains(element, property, placed, valueResolver).map(nativeEffectOf)];
            })
        )]));
    }

    private static scheduleRepetitions(plan: PlanNode, path: EntryPath | undefined, order: readonly number[], repeatingAncestor: boolean): Contribution {
        switch (plan.type) {
            case 'animation':
                return AnimationTracksResolver.resolveAnimationRepetitions(plan, path, order, repeatingAncestor);
            case 'sequence':
                return AnimationTracksResolver.resolveSequenceRepetitions(plan, path, order, repeatingAncestor);
        }
    }

    private static resolveAnimationRepetitions(plan: AnimationPlan, path: EntryPath | undefined, order: readonly number[], repeatingAncestor: boolean): Contribution {
        const {definition, easing, playDuration} = plan;
        const runs = plan.targets.flatMap(({target}) => Object.entries(definition.stopsByProperty).map(([property, stops]): KeyedRun =>
            ({element: target, property, path, entryStops: stops, order, run: TrackRun.play(playDuration, easing, stops)})
        ));
        const repeated = AnimationTracksResolver.repeated({runs, effects: []}, playDuration, definition.timing.playback, repeatingAncestor, order.length);
        const delays = new Map(plan.targets.map(({target, delay}) => [target, delay]));
        return AnimationTracksResolver.shifted(repeated, ({element}) => plan.position + delays.get(element)!);
    }

    private static resolveSequenceRepetitions(plan: SequencePlan, path: EntryPath | undefined, order: readonly number[], repeatingAncestor: boolean): Contribution {
        const {playback} = plan.definition.timing;
        const repeats = (playback.repeat ?? 0) > 0;
        const children: Contribution = {runs: [], effects: []};
        [...plan.entries].forEach(([name, entryPlan], index) => {
            const child = AnimationTracksResolver.scheduleRepetitions(entryPlan, entryPathOf(path, name), [...order, index], repeatingAncestor || repeats);
            const repeated = AnimationTracksResolver.repeated(child, plan.playDuration, playback, repeatingAncestor, order.length);
            const copyDelayed = AnimationTracksResolver.shifted(repeated, copyDelayOf(entryPlan));
            children.runs.push(...copyDelayed.runs);
            children.effects.push(...copyDelayed.effects);
        });
        return AnimationTracksResolver.shifted(children, () => plan.position);
    }

    /**
     * Repeats the runs within iterations of `iterationDuration`: as WAAPI iterations when nothing around repeats, baked into the runs otherwise.
     * An infinite repeat inside another keeps its first iteration and continues in an effect of its own, declared before the runs so that they show over it.
     */
    private static repeated({runs, effects}: Contribution, iterationDuration: Seconds, options: RepeatOptions, repeatingAncestor: boolean, depth: number): Contribution {
        const repeatCount = options.repeat ?? 0;
        if (!repeatingAncestor) {
            const repeatedEffects = runs.flatMap(({run, ...key}) => nativelyRepeated(run, iterationDuration, options)
                .map((timing, index): ScheduledEffect => ({...key, order: [...key.order, index], ...timing}))
            );
            return {runs: [], effects: [...effects, ...repeatedEffects]};
        }

        if (repeatCount === 0) return {runs, effects};

        if (!Number.isFinite(repeatCount)) {
            const continuingEffects = runs.map(({run, ...key}): ScheduledEffect =>
                ({...key, order: [...key.order, -(depth + 1)], ...continued(run, iterationDuration, options)})
            );
            return {runs, effects: [...effects, ...continuingEffects]};
        }

        return {runs: runs.map(keyed => ({...keyed, run: baked(keyed.run, iterationDuration, options)})), effects};
    }

    /** Moves each run and effect later by `startOf` its track. */
    private static shifted({runs, effects}: Contribution, startOf: (key: TrackKey) => Seconds): Contribution {
        return {
            runs: runs.map(keyed => ({...keyed, run: keyed.run.shifted(startOf(keyed))})),
            effects: effects.map(effect => ({...effect, delay: effect.delay + startOf(effect)}))
        };
    }

    /**
     * Effects that are declared earlier and lie within a later one never show, so they're dropped.
     * Only the ones that start first fill backwards, and an effect fills forwards unless one declared before it runs on after it ends.
     */
    private static placeFills(effects: readonly ScheduledEffect[]): PlacedEffect[] {
        const endOf = ({delay, duration, iterations}: ScheduledEffect) => delay + (duration === 0 ? 0 : duration * iterations);
        const shown = effects.filter((effect, index) => !effects.some((later, laterIndex) =>
            laterIndex > index && later.delay <= effect.delay && endOf(effect) <= endOf(later)
        ));

        const firstStart = Math.min(...shown.map(({delay}) => delay));
        return shown.map((effect, index) => {
            const backwards = effect.delay === firstStart;
            const forwards = !shown.slice(0, index).some(earlier => endOf(earlier) > endOf(effect));
            const fill: FillMode = backwards && forwards ? 'both' : backwards ? 'backwards' : forwards ? 'forwards' : 'none';
            return {...effect, fill};
        });
    }
}

/** What its sequence delays each copy of the entry by, after the sequence's repeats: each element of an animation, or a subsequence as a whole. */
function copyDelayOf(plan: PlanNode): (key: TrackKey) => Seconds {
    if (plan.type === 'sequence') return () => plan.parentDelay;
    const parentDelays = new Map(plan.targets.map(({target, parentDelay}) => [target, parentDelay]));
    return ({element}) => parentDelays.get(element)!;
}

/** Earlier entries come first, and an entry's own parts in their order. */
function compareOrders(first: readonly number[], second: readonly number[]): number {
    for (let index = 0; index < Math.min(first.length, second.length); index++) {
        if (first[index] !== second[index]) return first[index]! - second[index]!;
    }
    return first.length - second.length;
}

function timingOf(run: TrackRun, iterations = 1, direction: PlaybackDirection = 'normal'): EffectTiming {
    return {run: run.shifted(-run.start), delay: run.start, duration: run.end - run.start, iterations, direction};
}

/** The repeat as WAAPI iterations, the first effect starting at the run's start. */
function nativelyRepeated(run: TrackRun, iterationDuration: Seconds, options: RepeatOptions): EffectTiming[] {
    const {repeat: repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = options;
    const period = iterationDuration + repeatDelay;
    const repeatsForever = !Number.isFinite(repeatCount);
    const playCount = repeatCount + 1;
    const iteration = (index: number) => run.iteration(index, iterationDuration, options);

    // run
    if (repeatCount === 0)
        return [timingOf(run)];

    // run × playCount, alternating for 'reverse'
    if (repeatMode !== 'mirror' && repeatDelay === 0 && run.start === 0 && run.end === iterationDuration)
        return [timingOf(run, playCount, repeatMode === 'reverse' ? 'alternate' : 'normal')];

    // [run+hold] × repeatCount, then run on its own; [run+hold] × ∞ when repeating forever
    if (repeatMode === 'loop') {
        const repeating = timingOf(run.heldUntil(run.start + period), repeatCount);
        return repeatsForever ? [repeating] : [repeating, timingOf(iteration(repeatCount))];
    }

    const repeatingPairs = (iterations: number) =>
        timingOf(TrackRun.joined([iteration(0), iteration(1)]).heldUntil(run.start + 2 * period), iterations);

    // [run+hold, flipped+hold] × ∞
    if (repeatsForever)
        return [repeatingPairs(Infinity)];

    // [run+hold, flipped+hold] × repeatCount/2, then run on its own
    if (playCount % 2 === 1)
        return [repeatingPairs(repeatCount / 2), timingOf(iteration(repeatCount))];

    const finalPair = timingOf(TrackRun.joined([iteration(repeatCount - 1), iteration(repeatCount)]));

    // [run+hold, flipped] on its own
    if (playCount === 2)
        return [finalPair];

    // [run+hold, flipped+hold] × (repeatCount−1)/2, then [run+hold, flipped] on its own
    return [repeatingPairs((repeatCount - 1) / 2), finalPair];
}

/** Every iteration of a finite repeat in the run, one after another. */
function baked(run: TrackRun, iterationDuration: Seconds, options: RepeatOptions): TrackRun {
    const playCount = (options.repeat ?? 0) + 1;
    return TrackRun.joined(Array.from({length: playCount}, (_, index) => run.iteration(index, iterationDuration, options)));
}

/**
 * An infinite repeat after its first iteration, from the moment that iteration ends:
 * [hold, run] × ∞, or [hold, flipped, hold, run] × ∞ for a reverse or a mirror.
 */
function continued(run: TrackRun, iterationDuration: Seconds, options: RepeatOptions): EffectTiming {
    const iteration = (index: number) => run.iteration(index, iterationDuration, options);
    const iterations = options.repeatMode === 'loop' || options.repeatMode === undefined ? [iteration(1)] : [iteration(1), iteration(2)];
    return timingOf(TrackRun.joined(iterations).heldFrom(run.end, run.endValue), Infinity);
}
