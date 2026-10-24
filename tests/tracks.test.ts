import {describe, expect, it} from "vitest";
import {AnimationTiming} from "../src/animation-timing.ts";
import {animation} from "../src/animation.ts";
import {AnimationValues, resolveTargets} from "../src/dom/mapping.ts";
import {CubicBezierEasing, type Easing, StepsEasing} from "../src/easing.ts";
import {linear, resolveEasing} from "../src/easing-specifier.ts";
import {NumericStops} from "../src/resolution/stops.ts";
import {type AnimationPlan, plan, type SequencePlan} from "../src/resolution/plan.ts";
import {SequenceDefinition} from "../src/sequence.ts";
import {type EntryPath, entryPathOf, SequenceTiming} from "../src/sequence-timing.ts";
import type {PlaybackOptions, RepeatOptions} from "../src/playback-options.ts";
import {stagger} from "../src/stagger.ts";
import {resolveTransition, type TransitionOptions} from "../src/transition.ts";
import {lerp} from "../src/utils/math.ts";
import {sortedEntriesOf} from "../src/utils/records.ts";
import type {NativeAnimationEffect, NativeKeyframe} from "../src/waapi/native-effects.ts";
import {cssEasingOf, type NativeEasing} from "../src/waapi/native-easing.ts";
import type {CSSValueResolver} from "../src/waapi/effect-chains.ts";
import {type AnimationTracks, AnimationTracksResolver} from "../src/waapi/tracks.ts";

const element = {} as Element;
const scope = {} as Element;
const line = {x: {0: 0, 1: 1}};

/** Values are plain numbers without a unit, and every property is 0.25 now. */
const numericResolver: CSSValueResolver = {
    textOf: (_property, value) => String(value),
    currentValueOf: () => '0.25',
    accepts: () => true,
    resolve: (_element, _property, text) => text
};

function numericStopsOf(values: { [offset: number]: number }): NumericStops {
    return new NumericStops(sortedEntriesOf(values).map(([offset, value]) => ({offset, value})));
}

/** The same values played backwards, as a mirrored play shows them. */
function reversedOf(stops: NumericStops): NumericStops {
    return new NumericStops(stops.stops.map(({offset, value}) => ({offset: 1 - offset, value})).reverse());
}

function animationPlanOf(timing: AnimationTiming, elements: readonly Element[], values: AnimationValues = line): AnimationPlan {
    return plan(animation(elements, values, timing), target => resolveTargets(target, scope));
}

/** The timing's definition, with each animation leaf's values and elements by its path; a leaf without elements given has `element`. */
function sequencePlanOf(
    timing: SequenceTiming,
    valuesByPath: { [path: EntryPath]: AnimationValues },
    elementsByPath: { [path: EntryPath]: Element[] } = {}
): SequencePlan {
    const mappingOf = (sequenceTiming: SequenceTiming, path: EntryPath | undefined): object => Object.fromEntries(sequenceTiming.entries.map(entry => {
        const entryPath = entryPathOf(path, entry.name);
        return [entry.name, 'sequence' in entry ? mappingOf(entry.sequence, entryPath) : [elementsByPath[entryPath] ?? [element], valuesByPath[entryPath]]];
    }));
    return plan(SequenceDefinition.of(timing, mappingOf(timing, undefined) as never), target => resolveTargets(target, scope));
}

function animationTracksOf(timing: AnimationTiming, values: AnimationValues = line, elements = [element], resolver = numericResolver): AnimationTracks {
    return AnimationTracksResolver.resolve(animationPlanOf(timing, elements, values), resolver);
}

function sequenceTracksOf(
    timing: SequenceTiming,
    valuesByPath: { [path: EntryPath]: AnimationValues },
    elementsByPath: { [path: EntryPath]: Element[] } = {},
    resolver = numericResolver
): AnimationTracks {
    return AnimationTracksResolver.resolve(sequencePlanOf(timing, valuesByPath, elementsByPath), resolver);
}

function timingOf({delay, duration, iterations, direction, fill}: NativeAnimationEffect) {
    return {delay, duration, iterations, direction, fill};
}

function keyframesOf(effect: NativeAnimationEffect): number[][] {
    return effect.keyframes.map(({offset, value}) => [offset, Number(value)]);
}

function closeTo(rows: number[][]) {
    return rows.map(row => row.map(number => expect.closeTo(number, 9)));
}

/** The easing's output at `x`, as a browser computes it. */
function nativeProgressAt(easing: NativeEasing | undefined, x: number): number {
    if (!easing || easing.type === 'linear') return x;
    if (easing.type === 'cubic-bezier') return new CubicBezierEasing(easing.definition).progressAt(x);
    if (easing.type === 'steps') return new StepsEasing(easing.definition).progressAt(x);

    const {points} = easing;
    if (x >= points.at(-1)!.input) return points.at(-1)!.output;
    const index = points.findLastIndex(point => point.input <= x);
    const from = points[Math.max(index, 0)]!;
    const to = points[Math.max(index, 0) + 1]!;
    return to.input > from.input ? lerp(from.output, to.output, (x - from.input) / (to.input - from.input)) : to.output;
}

function keyframesValueAt(keyframes: readonly NativeKeyframe[], progress: number): number {
    const index = Math.min(Math.max(keyframes.findLastIndex(keyframe => keyframe.offset <= progress), 0), keyframes.length - 2);
    const from = keyframes[index]!;
    const to = keyframes[index + 1]!;
    if (to.offset === from.offset) return Number(to.value);
    return lerp(Number(from.value), Number(to.value), nativeProgressAt(from.easing, (progress - from.offset) / (to.offset - from.offset)));
}

/** The effect's value at `time`, or undefined when it has none then, as a browser computes it. */
function effectValueAt(effect: NativeAnimationEffect, time: number): number | undefined {
    const {delay, duration, iterations, direction, fill} = effect;
    const elapsed = time - delay;
    let iteration: number;
    let x: number;
    if (elapsed < 0) {
        if (fill !== 'backwards' && fill !== 'both') return undefined;
        [iteration, x] = [0, 0];
    } else if (elapsed >= duration * iterations) {
        if (fill !== 'forwards' && fill !== 'both') return undefined;
        [iteration, x] = [iterations - 1, 1];
    } else {
        iteration = Math.floor(elapsed / duration);
        x = elapsed / duration - iteration;
    }
    const backwards = direction === 'reverse'
        || (direction === 'alternate' && iteration % 2 === 1)
        || (direction === 'alternate-reverse' && iteration % 2 === 0);
    return keyframesValueAt(effect.keyframes, nativeProgressAt(effect.easing, backwards ? 1 - x : x));
}

/** The value the track shows at `time`: the last effect that has one, as later effects show over earlier ones. */
function trackValueAt(effects: readonly NativeAnimationEffect[], time: number): number | undefined {
    let value: number | undefined;
    for (const effect of effects) value = effectValueAt(effect, time) ?? value;
    return value;
}

/** The easing's progress at `x`, with its start and end values at its edges. */
function easedProgressAt(easing: Easing, x: number): number {
    if (x <= 0) return easing.startProgress;
    if (x >= 1) return easing.endProgress;
    return easing.progressAt(x);
}

/** What the definition means at `time`: each play through the stops, held through the repeat delays and after the last play. */
function definedValueAt(easing: Easing, stops: NumericStops, playDuration: number, options: RepeatOptions, time: number): number {
    const {repeat: repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = options;
    const iteration = Math.min(Math.floor(time / (playDuration + repeatDelay)), repeatCount);
    const x = Math.min((time - iteration * (playDuration + repeatDelay)) / playDuration, 1);
    if (iteration % 2 === 0 || repeatMode === 'loop') return stops.valueAt(easedProgressAt(easing, x));
    if (repeatMode === 'reverse') return stops.valueAt(easedProgressAt(easing, 1 - x));
    return reversedOf(stops).valueAt(easedProgressAt(easing, x));
}

describe("plans", () => {
    const threeElements = [{} as Element, {} as Element, {} as Element];

    it("places an animation at its position, and ends it after its latest delay", () => {
        const timing = AnimationTiming.of({duration: 1}, {delay: index => 0.25 + index * 0.5, repeat: 1, repeatDelay: 0.5});
        expect(animationPlanOf(timing, threeElements)).toMatchObject({position: 0, playDuration: 1, anchorDuration: 3.75, infinite: false});
    });

    it("counts only the first play of an infinite animation", () => {
        const timing = AnimationTiming.of({duration: 1}, {delay: 0.5, repeat: Infinity});
        expect(animationPlanOf(timing, [element])).toMatchObject({playDuration: 1, anchorDuration: 1.5, infinite: true});
    });

    it("resolves the targets, and gives each its delay", () => {
        const timing = AnimationTiming.of({duration: 1}, {delay: index => index * 0.5});
        expect(animationPlanOf(timing, threeElements).targets).toEqual(threeElements.map((target, index) => ({target, delay: index * 0.5, parentDelay: 0})));
    });

    it("refers to an entry's start before its delay, and repeats the sequence's iteration", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 2}, {delay: 0.25}), 'b', '+0.5')
            .add(AnimationTiming.of({duration: 1}), 'c', 'b<+0')
            .build({delay: 1, repeat: 1, repeatDelay: 0.5});
        const sequencePlan = sequencePlanOf(sequence, {a: line, b: line, c: line});
        expect(sequencePlan.entries.get('b')).toMatchObject({position: 1.5, anchorDuration: 2.25});
        expect(sequencePlan.entries.get('c')).toMatchObject({position: 1.5, anchorDuration: 1});
        expect(sequencePlan).toMatchObject({position: 0, playDuration: 3.75, anchorDuration: 9, infinite: false});
    });

    it("measures a share of an entry from its position, its delay included", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}, {delay: 1}), 'a')
            .add(AnimationTiming.of({duration: 1}), 'b', 'a<+50%')
            .add(AnimationTiming.of({duration: 2}), 'c', 'b>-=50%')
            .build();
        const sequencePlan = sequencePlanOf(sequence, {a: line, b: line, c: line});
        expect(sequencePlan.entries.get('b')).toMatchObject({position: 1});
        expect(sequencePlan.entries.get('c')).toMatchObject({position: 1});
    });

    it("keeps an entry with no targets at its position, taking no time there, however it repeats", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 1}, {delay: 1, repeat: Infinity}), 'b', '>+2')
            .add(AnimationTiming.of({duration: 1}), 'c', 'b>')
            .add(AnimationTiming.of({duration: 1}), 'd', '>>+1')
            .build();
        const sequencePlan = sequencePlanOf(sequence, {a: line, b: line, c: line, d: line}, {b: [], d: []});
        expect(sequencePlan.entries.get('b')).toMatchObject({targets: [], position: 3, playDuration: 0, anchorDuration: 0, infinite: false});
        expect(sequencePlan.entries.get('c')).toMatchObject({position: 3, anchorDuration: 1});
        expect(sequencePlan.entries.get('d')).toMatchObject({position: 5, anchorDuration: 0});
        expect(sequencePlan).toMatchObject({playDuration: 5, anchorDuration: 5});
    });

    it("counts the first play of an infinite entry, and makes its sequence infinite", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}, {repeat: Infinity}), 'a')
            .build({repeat: 1});
        expect(sequencePlanOf(sequence, {a: line})).toMatchObject({playDuration: 1, anchorDuration: 2, infinite: true});
    });

    it("leaves what a sequence's stagger delays its entries by out of their durations, and adds its latest copy's to the sequence's", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'cards')
            .add(AnimationTiming.of({duration: 4}), 'title', 0)
            .add(AnimationTiming.of({duration: 1}), 'after', 'cards>')
            .build({delay: index => index * 0.5});
        const sequencePlan = sequencePlanOf(sequence, {cards: line, title: line, after: line}, {cards: threeElements});
        expect(sequencePlan.entries.get('cards')).toMatchObject({position: 0, anchorDuration: 1});
        expect(sequencePlan.entries.get('after')).toMatchObject({position: 1});
        expect(sequencePlan).toMatchObject({playDuration: 4, anchorDuration: 5});
    });
});

describe("AnimationTracksResolver plans", () => {
    const play = {duration: 1};
    const effectsOf = (timing: AnimationTiming) => animationTracksOf(timing).get(element)!.x!;
    const repeats = (options: PlaybackOptions) => effectsOf(AnimationTiming.of(play, {repeatDelay: 0.5, ...options}));

    it("plays once with the easing on the effect and the stops as keyframes", () => {
        const [effect, ...rest] = effectsOf(AnimationTiming.of({duration: 1, easing: 'easeInOut'}));
        expect(rest).toEqual([]);
        expect(timingOf(effect!)).toEqual({delay: 0, duration: 1, iterations: 1, direction: 'normal', fill: 'both'});
        expect(effect!.easing).toEqual({type: 'cubic-bezier', definition: [0.42, 0, 0.58, 1]});
        expect(keyframesOf(effect!)).toEqual([[0, 0], [1, 1]]);
    });

    it("repeats natively without a repeat delay", () => {
        expect(effectsOf(AnimationTiming.of(play, {repeat: 2, repeatMode: 'loop'})).map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: 3, direction: 'normal', fill: 'both'}]);
        expect(effectsOf(AnimationTiming.of(play, {repeat: 2, repeatMode: 'reverse'})).map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: 3, direction: 'alternate', fill: 'both'}]);
    });

    it("loops as [original+hold] × repeatCount, then original on its own", () => {
        const effects = repeats({repeat: 2, repeatMode: 'loop'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 1.5, iterations: 2, direction: 'normal', fill: 'both'},
            {delay: 3, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[0]!)).toEqual(closeTo([[0, 0], [2 / 3, 1], [1, 1]]));
        expect(keyframesOf(effects[1]!)).toEqual(closeTo([[0, 0], [1, 1]]));
    });

    it("loops forever as [original+hold] × ∞", () => {
        expect(repeats({repeat: Infinity, repeatMode: 'loop'}).map(timingOf))
            .toEqual([{delay: 0, duration: 1.5, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("mirrors an odd play count as [original+hold, backward+hold] × repeatCount/2, then original on its own", () => {
        const effects = repeats({repeat: 2, repeatMode: 'mirror'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 3, iterations: 1, direction: 'normal', fill: 'both'},
            {delay: 3, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[0]!)).toEqual(closeTo([[0, 0], [1 / 3, 1], [0.5, 1], [5 / 6, 0], [1, 0]]));
    });

    it("mirrors an even play count as [original+hold, backward+hold] × (playCount−2)/2, then [original+hold, backward] once", () => {
        const effects = repeats({repeat: 3, repeatMode: 'mirror'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 3, iterations: 1, direction: 'normal', fill: 'both'},
            {delay: 3, duration: 2.5, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[1]!)).toEqual(closeTo([[0, 0], [0.4, 1], [0.6, 1], [1, 0]]));
    });

    it("mirrors two plays as [original+hold, backward] once", () => {
        expect(repeats({repeat: 1, repeatMode: 'mirror'}).map(timingOf))
            .toEqual([{delay: 0, duration: 2.5, iterations: 1, direction: 'normal', fill: 'both'}]);
    });

    it("mirrors forever as [original+hold, backward+hold] × ∞", () => {
        expect(repeats({repeat: Infinity, repeatMode: 'mirror'}).map(timingOf))
            .toEqual([{delay: 0, duration: 3, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("puts each keyframe's easing on the way to the next one", () => {
        const [repeating] = animationTracksOf(AnimationTiming.of({duration: 1, easing: 'easeIn'}, {repeat: 1, repeatDelay: 0.5})).get(element)!.x!;
        expect(repeating!.keyframes.map(({easing}) => easing?.type)).toEqual(['cubic-bezier', undefined, undefined]);
    });

    it("jumps to the end values for a play without duration", () => {
        const effects = effectsOf(AnimationTiming.of({duration: 0}));
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 0, iterations: 1, direction: 'normal', fill: 'both'}]);
        expect(keyframesOf(effects[0]!)).toEqual([[0, 0], [1, 1]]);
    });

    it("ends a mirrored play without duration where its last play ends", () => {
        const effects = effectsOf(AnimationTiming.of({duration: 0}, {repeat: 1, repeatDelay: 0.5, repeatMode: 'mirror'}));
        expect(trackValueAt(effects, 0.25)).toBe(1);
        expect(trackValueAt(effects, 1)).toBe(0);
    });

    it("adds each element's staggered delay to its effects", () => {
        const elements = [{} as Element, {} as Element, {} as Element];
        const timing = AnimationTiming.of({duration: 1}, {repeat: 2, repeatDelay: 0.5, repeatMode: 'loop', delay: index => index * 0.25});
        const tracks = animationTracksOf(timing, line, elements);
        expect(elements.map(element => tracks.get(element)!.x!.map(({delay}) => delay))).toEqual([[0, 3], [0.25, 3.25], [0.5, 3.5]]);
    });
});

const valuesWithStop = {x: {0: 0, 0.4: 0.7, 1: 1}};
const stopsWithStop = numericStopsOf(valuesWithStop.x);
const transitions: [string, TransitionOptions, number][] = [
    ['a cubic Bézier easing', {duration: 1, easing: 'easeInOut'}, 1e-6],
    ['an overshooting cubic Bézier easing', {duration: 1, easing: [0.3, 1.6, 0.6, 1]}, 1e-6],
    ['a jump-start steps easing', {duration: 1, easing: [4, 'jumpStart']}, 1e-6],
    ['a jump-end steps easing', {duration: 1, easing: [3, 'jumpEnd']}, 1e-6],
    ['a spring', {duration: 1, bounce: 0.4}, 2e-3]
];

/**
 * Compares the track with the defined value from the track's first start on, at times that miss the round ones, where steps and repeats jump.
 * Before it, a fill backwards shows a jump right at the start as already made, which only an effect's own steps easing avoids.
 */
function expectTrackToFollow(effects: readonly NativeAnimationEffect[], definedAt: (time: number) => number, tolerance: number, span: number, label = '') {
    const sampleCount = 1999;
    const firstStart = Math.min(...effects.map(({delay}) => delay));
    for (let sample = 0; sample < sampleCount; sample++) {
        const time = firstStart + (sample + 0.37) / sampleCount * span;
        expect(Math.abs(trackValueAt(effects, time)! - definedAt(time)), `${label} at ${time}`).toBeLessThan(tolerance);
    }
}

describe("AnimationTracksResolver values", () => {
    const repeatings: RepeatOptions[] = [
        {},
        {repeat: 2, repeatMode: 'loop'},
        ...(['loop', 'reverse', 'mirror'] as const).flatMap(repeatMode => [
            {repeat: 2, repeatDelay: 0.5, repeatMode},
            {repeat: 3, repeatDelay: 0.5, repeatMode},
            {repeat: Infinity, repeatDelay: 0.5, repeatMode}
        ])
    ];

    for (const [name, transition, tolerance] of transitions) {
        it(`follows ${name} through every repeat`, () => {
            for (const options of repeatings) {
                const timing = AnimationTiming.of(transition, options);
                const {duration, easing} = resolveTransition(timing.transition);
                const effects = animationTracksOf(timing, valuesWithStop).get(element)!.x!;
                const definedAt = (time: number) => definedValueAt(easing, stopsWithStop, duration, options, time);
                expectTrackToFollow(effects, definedAt, tolerance, 10, JSON.stringify(options));
            }
        });
    }
});

describe("AnimationTracksResolver sequence values", () => {
    const position = 0.2;
    const sequenceRepeat = {repeat: 3, repeatDelay: 0.3} as const;

    for (const [name, transition, tolerance] of transitions) {
        it(`follows ${name} through a sequence's loops and reverses, with the entry's own repeats baked in`, () => {
            const entryRepeat = {repeat: 1, repeatDelay: 0.25, repeatMode: 'reverse'} as const;
            for (const repeatMode of ['loop', 'reverse'] as const) {
                const timing = AnimationTiming.of(transition, entryRepeat);
                const {duration, easing} = resolveTransition(timing.transition);
                const sequence = SequenceTiming.builder()
                    .add(timing, 'a', position)
                    .add(AnimationTiming.of({duration: 1.5}), 'b', 0)
                    .build({...sequenceRepeat, repeatMode});
                const effects = sequenceTracksOf(sequence, {a: valuesWithStop, b: {y: line.x}}).get(element)!.x!;
                const iterationDuration = position + 2 * duration + entryRepeat.repeatDelay;
                const entryValueAt = (time: number) =>
                    definedValueAt(easing, stopsWithStop, duration, entryRepeat, Math.max(time - position, 0));
                const definedAt = (time: number) => {
                    const iteration = Math.min(Math.floor(time / (iterationDuration + sequenceRepeat.repeatDelay)), sequenceRepeat.repeat);
                    const local = Math.min(time - iteration * (iterationDuration + sequenceRepeat.repeatDelay), iterationDuration);
                    return entryValueAt(repeatMode === 'reverse' && iteration % 2 === 1 ? iterationDuration - local : local);
                };
                expectTrackToFollow(effects, definedAt, tolerance, 12, repeatMode);
            }
        });

        it(`follows ${name} through a sequence's mirrors, its easing running forwards`, () => {
            const timing = AnimationTiming.of(transition);
            const {duration, easing} = resolveTransition(timing.transition);
            const sequence = SequenceTiming.builder()
                .add(timing, 'a', position)
                .build({...sequenceRepeat, repeatMode: 'mirror'});
            const effects = sequenceTracksOf(sequence, {a: valuesWithStop}).get(element)!.x!;
            const iterationDuration = position + duration;
            const definedAt = (time: number) => {
                const iteration = Math.min(Math.floor(time / (iterationDuration + sequenceRepeat.repeatDelay)), sequenceRepeat.repeat);
                const local = Math.min(time - iteration * (iterationDuration + sequenceRepeat.repeatDelay), iterationDuration);
                if (iteration % 2 === 0) return stopsWithStop.valueAt(easedProgressAt(easing, (local - position) / duration));
                const playedBack = (iterationDuration - local - position) / duration;
                return reversedOf(stopsWithStop).valueAt(easedProgressAt(easing, 1 - playedBack));
            };
            expectTrackToFollow(effects, definedAt, tolerance, 6);
        });
    }
});
describe("AnimationTracksResolver sequences", () => {
    const sample = (effects: readonly NativeAnimationEffect[], times: number[]) => times.map(time => trackValueAt(effects, time));

    it("repeats the outermost repeating sequence natively, holding each entry through the rest of the iteration", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 1}), 'b')
            .build({repeat: 2, repeatDelay: 0.5});
        const tracks = sequenceTracksOf(sequence, {a: {x: line.x}, b: {y: line.x}}).get(element)!;
        expect(tracks.x!.map(timingOf)).toEqual([
            {delay: 0, duration: 2.5, iterations: 2, direction: 'normal', fill: 'both'},
            {delay: 5, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(tracks.y!.map(timingOf)).toEqual([
            {delay: 1, duration: 2.5, iterations: 2, direction: 'normal', fill: 'both'},
            {delay: 6, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(sample(tracks.y!, [0.5, 1.5, 3, 4, 7.5])).toEqual(closeTo([[0, 0.5, 1, 0.5, 1]])[0]);
    });

    it("reverses a sequence's iteration in time", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 1}), 'b', '+0')
            .build({repeat: 1, repeatDelay: 0.5, repeatMode: 'reverse'});
        const effects = sequenceTracksOf(sequence, {a: {x: line.x}, b: {y: line.x}}).get(element)!.x!;
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 4.5, iterations: 1, direction: 'normal', fill: 'both'}]);
        expect(sample(effects, [0.5, 2, 3.75, 4.25, 5])).toEqual(closeTo([[0.5, 1, 0.75, 0.25, 0]])[0]);
    });

    it("bakes the repeats inside the outermost one", () => {
        const nested = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1, easing: 'easeIn'}), 'a')
            .build({repeat: 1, repeatDelay: 0.5, repeatMode: 'mirror'});
        const sequence = SequenceTiming.builder().add(nested, 'nested').build({repeat: 1});
        const effects = sequenceTracksOf(sequence, {'nested>a': {x: line.x}}).get(element)!.x!;
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 2.5, iterations: 2, direction: 'normal', fill: 'both'}]);

        const easeIn = resolveEasing('easeIn');
        expect(sample(effects, [0.5, 1.25, 2, 3, 4.5])).toEqual(closeTo([[easeIn.progressAt(0.5), 1, 1 - easeIn.progressAt(0.5), easeIn.progressAt(0.5), 1 - easeIn.progressAt(0.5)]])[0]);
    });

    it("continues an infinite entry in a finitely repeating sequence after its first play, under the sequence's effects", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}, {repeat: Infinity, repeatDelay: 0.5}), 'a')
            .add(AnimationTiming.of({duration: 1}), 'b', '+0')
            .build({repeat: 1});
        const effects = sequenceTracksOf(sequence, {a: {x: line.x}, b: {y: line.x}}).get(element)!.x!;
        expect(effects.map(timingOf)).toEqual([
            {delay: 1, duration: 1.5, iterations: Infinity, direction: 'normal', fill: 'forwards'},
            {delay: 0, duration: 2, iterations: 1, direction: 'normal', fill: 'backwards'},
            {delay: 2, duration: 1, iterations: 1, direction: 'normal', fill: 'none'}
        ]);
        expect(sample(effects, [0.5, 1.5, 2.5, 3.25, 4, 4.75])).toEqual(closeTo([[0.5, 1, 0.5, 0.25, 1, 0.25]])[0]);
    });

    it("drops an infinite entry's continuation in an infinitely repeating sequence", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}, {repeat: Infinity, repeatDelay: 0.5}), 'a')
            .build({repeat: Infinity});
        expect(sequenceTracksOf(sequence, {a: {x: line.x}}).get(element)!.x!.map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("fills only the first-starting effect backwards, and forwards only what nothing earlier outlasts", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 2}), 'a', 0.5)
            .add(AnimationTiming.of({duration: 1}), 'b', 0)
            .build();
        expect(sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: line.x}}).get(element)!.x!.map(({delay, fill}) => ({delay, fill})))
            .toEqual([{delay: 0.5, fill: 'forwards'}, {delay: 0, fill: 'backwards'}]);
    });

    it("sets an entry without duration at its position, between the entries around it", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 0}), 'b', '+0.5')
            .add(AnimationTiming.of({duration: 1}), 'c', '+0.5')
            .build();
        const effects = sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: {0: 0.25, 1: 0.75}}, c: {x: {0: 0.75, 1: 0}}}).get(element)!.x!;
        expect(sample(effects, [1.25, 1.75, 2.5, 3.5])).toEqual(closeTo([[1, 0.75, 0.375, 0]])[0]);
    });

    it("drops an effect declared earlier that lies within a later one", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 0.5}), 'a', 0.25)
            .add(AnimationTiming.of({duration: 1}), 'b', 0)
            .build();
        expect(sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: line.x}}).get(element)!.x!.map(({delay, fill}) => ({delay, fill})))
            .toEqual([{delay: 0, fill: 'both'}]);
    });
});

describe("AnimationTracksResolver staggered sequences", () => {
    const cards = [{} as Element, {} as Element, {} as Element];
    const icons = [{} as Element, {} as Element, {} as Element];
    const startsOf = (tracks: AnimationTracks, elements: Element[], property: string) =>
        elements.map(element => tracks.get(element)![property]![0]!.delay);

    it("plays the sequence once per element index, chaining each copy's entries on their own", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'lift')
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: index => index * 0.25});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons});
        expect(startsOf(tracks, cards, 'x')).toEqual([0, 0.25, 0.5]);
        expect(startsOf(tracks, icons, 'y')).toEqual([1, 1.25, 1.5]);
    });

    it("plays every copy's entries where they'd be without the sequence's stagger, so an entry's own stagger pushes the next entry on in every copy", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}, {delay: index => index * 0.5}), 'lift')
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: index => index * 0.25});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons});
        expect(startsOf(tracks, cards, 'x')).toEqual([0, 0.75, 1.5]);
        expect(startsOf(tracks, icons, 'y')).toEqual([2, 2.25, 2.5]);
    });

    it("repeats every copy with the same iteration, from its own delay", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}, {delay: index => index * 0.5}), 'lift')
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: index => index * 0.25, repeat: 1});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons});
        expect(cards.map(card => tracks.get(card)!.x!.map(({delay}) => delay))).toEqual([[0, 3], [0.75, 3.75], [1.5, 4.5]]);
    });

    it("lines up the first elements of animations with fewer elements, without a stagger origin", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'lift')
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: index => index * 0.25});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons.slice(0, 2)});
        expect(startsOf(tracks, icons.slice(0, 2), 'y')).toEqual([1, 1.25]);
    });

    it("lines up the share of the elements at the stagger's origin, sampling the stagger between two elements", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'lift')
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: stagger(0.1, {from: 'center'})});
        const fourCards = [...cards, {} as Element];
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: fourCards, glow: icons});
        expect(startsOf(tracks, fourCards, 'x')).toEqual([0.15, 0.05, 0.05, 0.15].map(delay => expect.closeTo(delay, 9)));
        expect(startsOf(tracks, icons, 'y')).toEqual([1.1, 1, 1.1].map(delay => expect.closeTo(delay, 9)));

        const fromLast = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'lift')
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: stagger(0.1, {from: 'last'})});
        const lastTracks = sequenceTracksOf(fromLast, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons.slice(0, 1)});
        expect(startsOf(lastTracks, icons.slice(0, 1), 'y')).toEqual([1]);
    });
    it("delays a subsequence as one copy, and leaves its elements to its own stagger", () => {
        const details = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'glow')
            .build({delay: index => index * 0.1});
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'lift')
            .add(details, 'details')
            .build({delay: index => 0.5 - index * 0.25});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, 'details>glow': {y: line.x}}, {lift: cards, 'details>glow': icons});
        expect(startsOf(tracks, cards, 'x')).toEqual([0.5, 0.25, 0]);
        expect(startsOf(tracks, icons, 'y')).toEqual([1.5, 1.6, 1.7]);
    });

    it("counts a subsequence as one copy toward the largest count", () => {
        const details = SequenceTiming.builder().add(AnimationTiming.of({duration: 1}), 'glow').build();
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'title')
            .add(details, 'details', 0)
            .build({delay: (_index, total) => total * 0.5});
        const tracks = sequenceTracksOf(sequence, {title: {x: line.x}, 'details>glow': {y: line.x}}, {'details>glow': icons});
        expect(startsOf(tracks, [element], 'x')).toEqual([0.5]);
        expect(startsOf(tracks, icons, 'y')).toEqual([0.5, 0.5, 0.5]);
    });
});

describe("AnimationTracksResolver effect chains", () => {
    const sample = (effects: readonly NativeAnimationEffect[], times: number[]) => times.map(time => trackValueAt(effects, time));

    it("starts an entry without a value at 0 from the value the track shows as it starts", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 1}), 'b', '-0.5')
            .build();
        const effects = sequenceTracksOf(sequence, {a: {x: {0: 0, 1: 1}}, b: {x: {1: 2}}}).get(element)!.x!;
        expect(sample(effects, [0.25, 0.75, 1.5])).toEqual(closeTo([[0.25, 0.5 + 0.25 * 1.5, 2]])[0]);
    });

    it("starts a chain without a value at 0 from the property's current value", () => {
        const effects = animationTracksOf(AnimationTiming.of({duration: 1}), {x: {1: 1}}).get(element)!.x!;
        expect(keyframesOf(effects[0]!)).toEqual([[0, 0.25], [1, 1]]);
    });
});

describe("AnimationTracksResolver values passed through", () => {
    /** Takes any text, and resolves only plain numbers; colours have no number. */
    const textResolver: CSSValueResolver = {...numericResolver, currentValueOf: () => 'none'};
    const textsOf = (effect: NativeAnimationEffect) => effect.keyframes.map(({value}) => value);
    const resolvedWith = (timing: AnimationTiming, values: AnimationValues) => animationTracksOf(timing, values, [element], textResolver).get(element)!;

    it("passes values through as text when the easing is on the effect", () => {
        const [effect] = resolvedWith(AnimationTiming.of({duration: 1, easing: 'easeOut'}), {color: {0: 'red', 0.5: 'white', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'white', 'blue']);
    });

    it("passes values through when each span is one whole native easing between two stops", () => {
        const [effect] = resolvedWith(AnimationTiming.of({duration: 1, easing: 'easeOut'}, {repeat: 1, repeatDelay: 0.5}), {color: {0: 'red', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'blue', 'blue']);
    });

    it("passes values through a reversed play whose easing needn't be split", () => {
        const timing = AnimationTiming.of({duration: 1, easing: 'easeOut'}, {repeat: 1, repeatDelay: 0.5, repeatMode: 'reverse'});
        const [effect] = resolvedWith(timing, {color: {0: 'red', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'blue', 'blue', 'red']);
        expect(effect!.keyframes[2]!.easing).toEqual({type: 'cubic-bezier', definition: [1 - 0.58, 0, 1, 1]});
    });

    it("passes values through an overshooting Bézier between two stops in a repeat", () => {
        const timing = AnimationTiming.of({duration: 1, easing: [0.3, 1.6, 0.6, 1]}, {repeat: 1, repeatDelay: 0.5, repeatMode: 'mirror'});
        const [effect] = resolvedWith(timing, {color: {0: 'red', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'blue', 'blue', 'red']);
    });

    it("starts from the current value as it is", () => {
        const [effect] = resolvedWith(AnimationTiming.of({duration: 1}), {translate: {1: '10px'}}).translate!;
        expect(textsOf(effect!)).toEqual(['none', '10px']);
    });

    it("starts an entry from the stop the track holds as it starts", () => {
        const sequence = SequenceTiming.builder()
            .add(AnimationTiming.of({duration: 1}), 'a')
            .add(AnimationTiming.of({duration: 1}), 'b', '+0.5')
            .build();
        const [, b] = sequenceTracksOf(sequence, {a: {color: {0: 'red', 1: 'blue'}}, b: {color: {1: 'green'}}}, {}, textResolver).get(element)!.color!;
        expect(textsOf(b!)).toEqual(['blue', 'green']);
    });

    it("needs numbers for a spring", () => {
        expect(() => resolvedWith(AnimationTiming.of({duration: 1, bounce: 0.3}), {color: {0: 'red', 1: 'blue'}})).toThrow();
        const [effect] = resolvedWith(AnimationTiming.of({duration: 1, bounce: 0.3}), {x: {0: '0', 1: '1'}}).x!;
        expect(effect!.keyframes.length).toBeGreaterThan(2);
    });
});

describe("cssEasingOf", () => {
    it("writes each native easing as CSS", () => {
        expect(cssEasingOf({type: 'steps', definition: [4, 'jumpStart']})).toBe('steps(4, jump-start)');
        expect(cssEasingOf({type: 'linear-points', points: [{input: 0, output: 0}, {input: 0.5, output: 0}, {input: 0.5, output: 1}, {input: 1, output: 1}]}))
            .toBe('linear(0 0%, 0 50%, 1 50%, 1 100%)');
    });
});

describe("Easing windows", () => {
    it("gives the progress of the window without rescaling it, and runs it backwards when reversed", () => {
        const easing = linear.windowed(0.25, 0.75);
        expect([easing.progressAt(0), easing.progressAt(1), easing.reversed().progressAt(0)]).toEqual([0.25, 0.75, 0.75]);
        expect(easing.offsetsAt(0.5)).toEqual([0.5]);
    });
});
