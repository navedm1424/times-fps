import {type EasingFunction, linear} from "../easing.js";
import type {Progress, RepeatOptions, Seconds} from "../types.js";
import {type CSSValueResolver, resolveEffectChains} from "./effect-chains.js";
import {type NativeAnimationEffect, nativeEffectOf} from "./native-effects.js";
import {PropertyStops, type StopValue} from "./stops.js";
import {type AnimationTimings, entryPathOf, type EntryPath, type NodeTimings, type SequenceTimings} from "./timings.js";

/** Which of its fills an entry's effects may have. */
export type AllowedFill = Exclude<FillMode, 'auto'>;

/** A target of an animation, with each property's stops, how its effects composite with what's under them, and which fills they may have. */
export interface TargetValues {
    target: Element;
    properties: { [property: string]: { stops: PropertyStops; composite: CompositeOperation; allowedFill: AllowedFill } };
}

/** Each target's properties, each with its effects in the order they're declared, which is the order they show over each other in. */
export type AnimationTracks = Map<Element, { [property: string]: NativeAnimationEffect[] }>;

/** A stretch of a track whose value follows the stops through the easing. */
export interface TrackSpan {
    start: Seconds;
    end: Seconds;
    easing: EasingFunction;
    stops: PropertyStops;
}

/** Spans laid out one after another, without gaps. */
export class TrackRun {
    constructor(readonly spans: readonly TrackSpan[]) {}

    static play(duration: Seconds, easing: EasingFunction, stops: PropertyStops): TrackRun {
        return new TrackRun([{start: 0, end: duration, easing, stops}]);
    }

    /** The runs one after another, each one's end value held until the next starts. */
    static joined(runs: readonly TrackRun[]): TrackRun {
        return new TrackRun(runs.flatMap((run, index) => {
            const previous = runs[index - 1];
            return previous ? [...holdSpans(previous.endValue, previous.end, run.start), ...run.spans] : run.spans;
        }));
    }

    get start(): Seconds {
        return this.spans[0]!.start;
    }

    get end(): Seconds {
        return this.spans.at(-1)!.end;
    }

    /** The value of the stop the run ends on, which is the end of its last span's easing window. */
    get endValue(): StopValue {
        const {easing, stops} = this.spans.at(-1)!;
        return stops.valueOfStopAt(easing.windowEnd);
    }

    /** The value at `time`, which is the next span's start where two meet; the stops must be resolved. */
    valueAt(time: Seconds): number {
        const {stops, progress} = this.progressAt(time);
        return stops.valueAt(progress);
    }

    /** The value at `time` when it's exactly a stop's, as it is at a whole span's ends and through a hold. */
    stopValueAt(time: Seconds): StopValue | undefined {
        const {stops, progress} = this.progressAt(time);
        return stops.stopValueAt(progress);
    }

    private progressAt(time: Seconds): { stops: PropertyStops; progress: Progress } {
        const span = [...this.spans].reverse().find(span => span.start <= time) ?? this.spans[0]!;
        const {start, end, easing, stops} = span;
        if (time >= end) return {stops, progress: easing.endProgress};
        if (time <= start) return {stops, progress: easing.startProgress};
        return {stops, progress: easing.progressAt((time - start) / (end - start))};
    }

    shifted(by: Seconds): TrackRun {
        return new TrackRun(this.spans.map(span => ({...span, start: span.start + by, end: span.end + by})));
    }

    heldUntil(time: Seconds): TrackRun {
        return new TrackRun([...this.spans, ...holdSpans(this.endValue, this.end, time)]);
    }

    /** Holds `value` from `time` until the run starts. */
    heldFrom(time: Seconds, value: StopValue): TrackRun {
        return new TrackRun([...holdSpans(value, time, this.start), ...this.spans]);
    }

    /**
     * The run in the iteration at `index` of a repeat whose iterations last `iterationDuration`, each starting after the previous one and the repeat delay.
     * Every other iteration of a reverse or a mirror flips in time: a reverse runs the easing backwards, a mirror keeps it running forwards through flipped stops.
     */
    iteration(index: number, iterationDuration: Seconds, {repeatDelay = 0, repeatMode = 'loop'}: RepeatOptions): TrackRun {
        const iterationStart = index * (iterationDuration + repeatDelay);
        if (index % 2 === 0 || repeatMode === 'loop') return this.shifted(iterationStart);

        const flipped = this.spans.map(({start, end, easing, stops}): TrackSpan => ({
            start: iterationDuration - end,
            end: iterationDuration - start,
            easing: repeatMode === 'reverse' ? easing.reversed() : easing,
            stops: repeatMode === 'reverse' ? stops : stops.flip()
        }));
        return new TrackRun(flipped.reverse()).shifted(iterationStart);
    }
}

function holdSpans(value: StopValue, start: Seconds, end: Seconds): TrackSpan[] {
    return end > start ? [{start, end, easing: linear, stops: PropertyStops.constant(value)}] : [];
}

/** Which target's property a run or an effect animates, and where its entry is declared, which decides what shows over what. */
interface TrackKey {
    target: Element;
    property: string;
    /** The animation leaf it comes from, which is undefined for an animation on its own. */
    path: EntryPath | undefined;
    /** The stops its entry gives the property, before any repeat flips them. */
    entryStops: PropertyStops;
    composite: CompositeOperation;
    allowedFill: AllowedFill;
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
}

/** What an entry puts on the tracks, in the time of the iteration of the sequence it's in. */
interface Contribution {
    runs: KeyedRun[];
    effects: ScheduledEffect[];
}

type EffectTiming = Pick<ScheduledEffect, 'delay' | 'duration' | 'iterations' | 'direction' | 'run'>;

/**
 * Resolves the timings into tracks in four stages: the repetitions, the fill conflicts, the values, then the easings.
 * Only the outermost repeat runs as WAAPI iterations; the ones inside it are baked into the keyframes, except that an infinite one only gives its first iteration, and an effect continuing it from there.
 */
export class AnimationTracksResolver {
    private constructor(private readonly valuesOf: (path: EntryPath) => readonly TargetValues[]) {}

    static resolve(timings: NodeTimings, valuesOf: (path: EntryPath) => readonly TargetValues[], valueResolver: CSSValueResolver): AnimationTracks {
        const {effects} = new AnimationTracksResolver(valuesOf).resolveRepetitions(timings, undefined, [], false);

        const effectsByTrack = new Map<Element, Map<string, ScheduledEffect[]>>();
        for (const effect of effects) {
            let effectsByProperty = effectsByTrack.get(effect.target);
            if (!effectsByProperty) effectsByTrack.set(effect.target, effectsByProperty = new Map());
            let trackEffects = effectsByProperty.get(effect.property);
            if (!trackEffects) effectsByProperty.set(effect.property, trackEffects = []);
            trackEffects.push(effect);
        }

        return new Map([...effectsByTrack].map(([target, effectsByProperty]) => [target, Object.fromEntries(
            [...effectsByProperty].map(([property, trackEffects]) => {
                const declared = trackEffects.sort((first, second) => compareOrders(first.order, second.order));
                const placed = AnimationTracksResolver.resolveFills(declared);
                return [property, resolveEffectChains(target, property, placed, valueResolver).map(nativeEffectOf)];
            })
        )]));
    }

    private resolveRepetitions(timings: NodeTimings, path: EntryPath | undefined, order: readonly number[], repeatingAncestor: boolean): Contribution {
        switch (timings.type) {
            case 'animation':
                return this.resolveAnimationRepetitions(timings, path, order, repeatingAncestor);
            case 'sequence':
                return this.resolveSequenceRepetitions(timings, path, order, repeatingAncestor);
            case 'staggered-sequence': {
                const lanes = timings.lanes.map(lane => this.resolveSequenceRepetitions(lane, path, order, repeatingAncestor));
                return {runs: lanes.flatMap(({runs}) => runs), effects: lanes.flatMap(({effects}) => effects)};
            }
        }
    }

    private resolveAnimationRepetitions(timings: AnimationTimings, path: EntryPath | undefined, order: readonly number[], repeatingAncestor: boolean): Contribution {
        const contribution: Contribution = {runs: [], effects: []};
        const {animation, playDuration} = timings;
        const values = this.valuesOf(path ?? '');
        for (const {index, start} of timings.targets) {
            const {target, properties} = values[index]!;
            const runs = Object.entries(properties).map(([property, {stops, composite, allowedFill}]): KeyedRun =>
                ({target, property, path, entryStops: stops, composite, allowedFill, order, run: TrackRun.play(playDuration, animation.easing, stops)})
            );
            const repeated = AnimationTracksResolver.repeated({runs, effects: []}, playDuration, animation.options, repeatingAncestor, order.length);
            const placed = AnimationTracksResolver.shifted(repeated, start);
            contribution.runs.push(...placed.runs);
            contribution.effects.push(...placed.effects);
        }
        return contribution;
    }

    private resolveSequenceRepetitions(timings: SequenceTimings, path: EntryPath | undefined, order: readonly number[], repeatingAncestor: boolean): Contribution {
        const {options} = timings.sequence;
        const repeats = (options.repeatCount ?? 0) > 0;
        const children: Contribution = {runs: [], effects: []};
        [...timings.entries].forEach(([name, entryTimings], index) => {
            const child = this.resolveRepetitions(entryTimings, entryPathOf(path, name), [...order, index], repeatingAncestor || repeats);
            children.runs.push(...child.runs);
            children.effects.push(...child.effects);
        });
        const repeated = AnimationTracksResolver.repeated(children, timings.playDuration, options, repeatingAncestor, order.length);
        return AnimationTracksResolver.shifted(repeated, timings.firstStart);
    }

    /**
     * Repeats the runs within iterations of `iterationDuration`: as WAAPI iterations when nothing around repeats, baked into the runs otherwise.
     * An infinite repeat inside another keeps its first iteration and continues in an effect of its own, declared before the runs so that they show over it.
     */
    private static repeated({runs, effects}: Contribution, iterationDuration: Seconds, options: RepeatOptions, repeatingAncestor: boolean, depth: number): Contribution {
        const repeatCount = options.repeatCount ?? 0;
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

    private static shifted({runs, effects}: Contribution, by: Seconds): Contribution {
        return {
            runs: runs.map(keyed => ({...keyed, run: keyed.run.shifted(by)})),
            effects: effects.map(effect => ({...effect, delay: effect.delay + by}))
        };
    }

    /**
     * Effects that are declared earlier and lie within a later one that replaces what's under it never show, so they're dropped.
     * Only the ones that start first fill backwards, and an effect fills forwards unless one declared before it runs on after it ends.
     * Either way, an effect only has the fills its entry allows.
     */
    private static resolveFills(effects: readonly ScheduledEffect[]): PlacedEffect[] {
        const endOf = ({delay, duration, iterations}: ScheduledEffect) => delay + (duration === 0 ? 0 : duration * iterations);
        const shown = effects.filter((effect, index) => !effects.some((later, laterIndex) =>
            laterIndex > index && later.composite === 'replace' && later.delay <= effect.delay && endOf(effect) <= endOf(later)
        ));

        const firstStart = Math.min(...shown.map(({delay}) => delay));
        return shown.map((effect, index) => {
            const backwards = effect.delay === firstStart && (effect.allowedFill === 'backwards' || effect.allowedFill === 'both');
            const forwards = !shown.slice(0, index).some(earlier => endOf(earlier) > endOf(effect))
                && (effect.allowedFill === 'forwards' || effect.allowedFill === 'both');
            const fill: FillMode = backwards && forwards ? 'both' : backwards ? 'backwards' : forwards ? 'forwards' : 'none';
            return {...effect, fill};
        });
    }
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
    const {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = options;
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
    const playCount = (options.repeatCount ?? 0) + 1;
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
