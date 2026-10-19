import {describe, expect, it} from "vitest";
import {AnimationDefinition, type AnimationOptions, type SimpleAnimation} from "../src/animation.js";
import {CubicBezierEasing, type EasingFunction, linear, StepsEasing} from "../src/easing.js";
import {Sequence} from "../src/sequence.js";
import {eased, spring, type Transition} from "../src/transition.js";
import type {RepeatOptions} from "../src/types.js";
import {lerp} from "../src/utils/math.js";
import type {NativeAnimationEffect, NativeKeyframe} from "../src/waapi/native-effects.js";
import {cssEasingOf, type NativeEasing} from "../src/waapi/native-easing.js";
import type {CSSValueResolver} from "../src/waapi/effect-chains.js";
import {PropertyStops, type NumericValueStops} from "../src/waapi/stops.js";
import {type EntryPath, resolveTimings, type SequenceTimings} from "../src/waapi/timings.js";
import {type AllowedFill, type AnimationTracks, AnimationTracksResolver, type TargetValues} from "../src/waapi/tracks.js";

const target = {} as Element;
const line = {x: {0: 0, 1: 1}};

/** Values are plain numbers without a unit, and every property is 0.25 now. */
const numericResolver: CSSValueResolver = {
    currentValueOf: () => '0.25',
    accepts: () => true,
    resolve: (_target, _property, text) => text
};

function targetValuesOf(
    element: Element,
    values: { [property: string]: { [progress: number]: number | string } },
    composite: CompositeOperation = 'replace',
    allowedFill: AllowedFill = 'both'
): TargetValues {
    return {
        target: element,
        properties: Object.fromEntries(Object.entries(values).map(([property, stops]) => [property, {stops: PropertyStops.of(property, stops, composite), composite, allowedFill}]))
    };
}

/** The stops with their values resolved as plain numbers. */
function resolvedStopsOf(values: NumericValueStops): PropertyStops {
    const stops = PropertyStops.of('x', values);
    for (const value of stops.values) value.resolve(Number(value.text));
    return stops;
}

function animationTracksOf(animation: SimpleAnimation, values: { [property: string]: NumericValueStops } = line, targets = [target]): AnimationTracks {
    const targetValues = targets.map(element => targetValuesOf(element, values));
    return AnimationTracksResolver.resolve(resolveTimings(animation, targets.length), () => targetValues, numericResolver);
}

function sequenceTracksOf(
    sequence: Sequence,
    valuesByPath: { [path: EntryPath]: { [property: string]: { [progress: number]: number | string } } },
    targetsByPath: { [path: EntryPath]: Element[] } = {},
    compositesByPath: { [path: EntryPath]: CompositeOperation } = {}
): AnimationTracks {
    const targetValues = new Map(Object.entries(valuesByPath).map(([path, values]) =>
        [path, (targetsByPath[path] ?? [target]).map(element => targetValuesOf(element, values, compositesByPath[path]))]
    ));
    const targetCounts = new Map([...targetValues].map(([path, values]) => [path, values.length]));
    return AnimationTracksResolver.resolve(resolveTimings(sequence, targetCounts), path => targetValues.get(path)!, numericResolver);
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
function easedProgressAt(easing: EasingFunction, x: number): number {
    if (x <= 0) return easing.startProgress;
    if (x >= 1) return easing.endProgress;
    return easing.progressAt(x);
}

/** What the definition means at `time`: each play through the stops, held through the repeat delays and after the last play. */
function definedValueAt(easing: EasingFunction, stops: PropertyStops, playDuration: number, options: RepeatOptions, time: number): number {
    const {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = options;
    const iteration = Math.min(Math.floor(time / (playDuration + repeatDelay)), repeatCount);
    const x = Math.min((time - iteration * (playDuration + repeatDelay)) / playDuration, 1);
    if (iteration % 2 === 0 || repeatMode === 'loop') return stops.valueAt(easedProgressAt(easing, x));
    if (repeatMode === 'reverse') return stops.valueAt(easedProgressAt(easing, 1 - x));
    return stops.flip().valueAt(easedProgressAt(easing, x));
}

describe("resolveTimings", () => {
    it("starts an animation at its shortest staggered delay and ends it after its latest", () => {
        const animation = AnimationDefinition.of(eased(1), {delay: index => 0.25 + index * 0.5, repeatCount: 1, repeatDelay: 0.5});
        expect(resolveTimings(animation, 3)).toMatchObject({
            firstStart: 0.25, playDuration: 1, totalDuration: 2.5, end: 3.75, lastReferenceableEnd: 3.75
        });
    });

    it("leaves an infinite animation without an end, referenceable after its first play", () => {
        const animation = AnimationDefinition.of(eased(1), {delay: 0.5, repeatCount: Infinity});
        expect(resolveTimings(animation, 1)).toMatchObject({firstStart: 0.5, end: undefined, lastReferenceableEnd: 1.5, totalDuration: Infinity});
    });

    it("places entries in their sequence's iteration and repeats the iteration", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(2), {delay: 0.25}), '+0.5')
            .add('c', AnimationDefinition.of(eased(1)), 'b<+0')
            .build({delay: 1, repeatCount: 1, repeatDelay: 0.5});
        const timings = resolveTimings(sequence, new Map([['a', 1], ['b', 1], ['c', 1]])) as SequenceTimings;
        expect(timings.entries.get('b')).toMatchObject({firstStart: 1.75, end: 3.75, lastReferenceableEnd: 3.75});
        expect(timings.entries.get('c')).toMatchObject({firstStart: 1.75, end: 2.75});
        expect(timings).toMatchObject({firstStart: 1, playDuration: 3.75, totalDuration: 8, end: 9, lastReferenceableEnd: 9});
    });

    it("leaves a sequence with an infinite entry without an end", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1), {repeatCount: Infinity}))
            .build({repeatCount: 1});
        expect(resolveTimings(sequence, new Map([['a', 1]]))).toMatchObject({playDuration: 1, end: undefined, totalDuration: Infinity, lastReferenceableEnd: 2});
    });
});

describe("AnimationTracksResolver layouts", () => {
    const play = eased(1);
    const effectsOf = (animation: SimpleAnimation) => animationTracksOf(animation).get(target)!.x!;
    const repeats = (options: AnimationOptions) => effectsOf(AnimationDefinition.of(play, {repeatDelay: 0.5, ...options}));

    it("plays once with the easing on the effect and the stops as keyframes", () => {
        const [effect, ...rest] = effectsOf(AnimationDefinition.of(eased(1, 'easeInOut')));
        expect(rest).toEqual([]);
        expect(timingOf(effect!)).toEqual({delay: 0, duration: 1, iterations: 1, direction: 'normal', fill: 'both'});
        expect(effect!.easing).toEqual({type: 'cubic-bezier', definition: [0.42, 0, 0.58, 1]});
        expect(keyframesOf(effect!)).toEqual([[0, 0], [1, 1]]);
    });

    it("repeats natively without a repeat delay", () => {
        expect(effectsOf(AnimationDefinition.of(play, {repeatCount: 2, repeatMode: 'loop'})).map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: 3, direction: 'normal', fill: 'both'}]);
        expect(effectsOf(AnimationDefinition.of(play, {repeatCount: 2, repeatMode: 'reverse'})).map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: 3, direction: 'alternate', fill: 'both'}]);
    });

    it("loops as [original+hold] × repeatCount, then original on its own", () => {
        const effects = repeats({repeatCount: 2, repeatMode: 'loop'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 1.5, iterations: 2, direction: 'normal', fill: 'both'},
            {delay: 3, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[0]!)).toEqual(closeTo([[0, 0], [2 / 3, 1], [1, 1]]));
        expect(keyframesOf(effects[1]!)).toEqual(closeTo([[0, 0], [1, 1]]));
    });

    it("loops forever as [original+hold] × ∞", () => {
        expect(repeats({repeatCount: Infinity, repeatMode: 'loop'}).map(timingOf))
            .toEqual([{delay: 0, duration: 1.5, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("mirrors an odd play count as [original+hold, backward+hold] × repeatCount/2, then original on its own", () => {
        const effects = repeats({repeatCount: 2, repeatMode: 'mirror'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 3, iterations: 1, direction: 'normal', fill: 'both'},
            {delay: 3, duration: 1, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[0]!)).toEqual(closeTo([[0, 0], [1 / 3, 1], [0.5, 1], [5 / 6, 0], [1, 0]]));
    });

    it("mirrors an even play count as [original+hold, backward+hold] × (playCount−2)/2, then [original+hold, backward] once", () => {
        const effects = repeats({repeatCount: 3, repeatMode: 'mirror'});
        expect(effects.map(timingOf)).toEqual([
            {delay: 0, duration: 3, iterations: 1, direction: 'normal', fill: 'both'},
            {delay: 3, duration: 2.5, iterations: 1, direction: 'normal', fill: 'forwards'}
        ]);
        expect(keyframesOf(effects[1]!)).toEqual(closeTo([[0, 0], [0.4, 1], [0.6, 1], [1, 0]]));
    });

    it("mirrors two plays as [original+hold, backward] once", () => {
        expect(repeats({repeatCount: 1, repeatMode: 'mirror'}).map(timingOf))
            .toEqual([{delay: 0, duration: 2.5, iterations: 1, direction: 'normal', fill: 'both'}]);
    });

    it("mirrors forever as [original+hold, backward+hold] × ∞", () => {
        expect(repeats({repeatCount: Infinity, repeatMode: 'mirror'}).map(timingOf))
            .toEqual([{delay: 0, duration: 3, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("puts each keyframe's easing on the way to the next one", () => {
        const [repeating] = animationTracksOf(AnimationDefinition.of(eased(1, 'easeIn'), {repeatCount: 1, repeatDelay: 0.5})).get(target)!.x!;
        expect(repeating!.keyframes.map(({easing}) => easing?.type)).toEqual(['cubic-bezier', undefined, undefined]);
    });

    it("jumps to the end values for a play without duration", () => {
        const effects = effectsOf(AnimationDefinition.of(eased(0)));
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 0, iterations: 1, direction: 'normal', fill: 'both'}]);
        expect(keyframesOf(effects[0]!)).toEqual([[0, 0], [1, 1]]);
    });

    it("ends a mirrored play without duration where its last play ends", () => {
        const effects = effectsOf(AnimationDefinition.of(eased(0), {repeatCount: 1, repeatDelay: 0.5, repeatMode: 'mirror'}));
        expect(trackValueAt(effects, 0.25)).toBe(1);
        expect(trackValueAt(effects, 1)).toBe(0);
    });

    it("adds each target's staggered delay to its effects", () => {
        const targets = [{} as Element, {} as Element, {} as Element];
        const animation = AnimationDefinition.of(eased(1), {repeatCount: 2, repeatDelay: 0.5, repeatMode: 'loop', delay: index => index * 0.25});
        const tracks = animationTracksOf(animation, line, targets);
        expect(targets.map(element => tracks.get(element)!.x!.map(({delay}) => delay))).toEqual([[0, 3], [0.25, 3.25], [0.5, 3.5]]);
    });
});

const valuesWithStop = {x: {0: 0, 0.4: 0.7, 1: 1}};
const stopsWithStop = resolvedStopsOf(valuesWithStop.x);
const transitions: [string, Transition, number][] = [
    ['a cubic Bézier easing', eased(1, 'easeInOut'), 1e-6],
    ['an overshooting cubic Bézier easing', eased(1, [0.3, 1.6, 0.6, 1]), 1e-6],
    ['a jump-start steps easing', eased(1, [4, 'jumpStart']), 1e-6],
    ['a jump-end steps easing', eased(1, [3, 'jumpEnd']), 1e-6],
    ['a spring', spring({duration: 1, bounce: 0.4}), 2e-3]
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
        {repeatCount: 2, repeatMode: 'loop'},
        ...(['loop', 'reverse', 'mirror'] as const).flatMap(repeatMode => [
            {repeatCount: 2, repeatDelay: 0.5, repeatMode},
            {repeatCount: 3, repeatDelay: 0.5, repeatMode},
            {repeatCount: Infinity, repeatDelay: 0.5, repeatMode}
        ])
    ];

    for (const [name, transition, tolerance] of transitions) {
        it(`follows ${name} through every repeat`, () => {
            for (const options of repeatings) {
                const animation = AnimationDefinition.of(transition, options);
                const effects = animationTracksOf(animation, valuesWithStop).get(target)!.x!;
                const definedAt = (time: number) => definedValueAt(animation.easing, stopsWithStop, animation.duration, options, time);
                expectTrackToFollow(effects, definedAt, tolerance, 10, JSON.stringify(options));
            }
        });
    }
});

describe("AnimationTracksResolver sequence values", () => {
    const position = 0.2;
    const sequenceRepeat = {repeatCount: 3, repeatDelay: 0.3} as const;

    for (const [name, transition, tolerance] of transitions) {
        it(`follows ${name} through a sequence's loops and reverses, with the entry's own repeats baked in`, () => {
            const entryRepeat = {repeatCount: 1, repeatDelay: 0.25, repeatMode: 'reverse'} as const;
            for (const repeatMode of ['loop', 'reverse'] as const) {
                const animation = AnimationDefinition.of(transition, entryRepeat);
                const sequence = Sequence.builder()
                    .add('a', animation, position)
                    .add('b', AnimationDefinition.of(eased(1.5)), 0)
                    .build({...sequenceRepeat, repeatMode});
                const effects = sequenceTracksOf(sequence, {a: valuesWithStop, b: {y: line.x}}).get(target)!.x!;
                const iterationDuration = position + 2 * animation.duration + entryRepeat.repeatDelay;
                const entryValueAt = (time: number) =>
                    definedValueAt(animation.easing, stopsWithStop, animation.duration, entryRepeat, Math.max(time - position, 0));
                const definedAt = (time: number) => {
                    const iteration = Math.min(Math.floor(time / (iterationDuration + sequenceRepeat.repeatDelay)), sequenceRepeat.repeatCount);
                    const local = Math.min(time - iteration * (iterationDuration + sequenceRepeat.repeatDelay), iterationDuration);
                    return entryValueAt(repeatMode === 'reverse' && iteration % 2 === 1 ? iterationDuration - local : local);
                };
                expectTrackToFollow(effects, definedAt, tolerance, 12, repeatMode);
            }
        });

        it(`follows ${name} through a sequence's mirrors, its easing running forwards`, () => {
            const animation = AnimationDefinition.of(transition);
            const sequence = Sequence.builder()
                .add('a', animation, position)
                .build({...sequenceRepeat, repeatMode: 'mirror'});
            const effects = sequenceTracksOf(sequence, {a: valuesWithStop}).get(target)!.x!;
            const iterationDuration = position + animation.duration;
            const definedAt = (time: number) => {
                const iteration = Math.min(Math.floor(time / (iterationDuration + sequenceRepeat.repeatDelay)), sequenceRepeat.repeatCount);
                const local = Math.min(time - iteration * (iterationDuration + sequenceRepeat.repeatDelay), iterationDuration);
                if (iteration % 2 === 0) return stopsWithStop.valueAt(easedProgressAt(animation.easing, (local - position) / animation.duration));
                const playedBack = (iterationDuration - local - position) / animation.duration;
                return stopsWithStop.flip().valueAt(easedProgressAt(animation.easing, 1 - playedBack));
            };
            expectTrackToFollow(effects, definedAt, tolerance, 6);
        });
    }
});
describe("AnimationTracksResolver sequences", () => {
    const sample = (effects: readonly NativeAnimationEffect[], times: number[]) => times.map(time => trackValueAt(effects, time));

    it("repeats the outermost repeating sequence natively, holding each entry through the rest of the iteration", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)))
            .build({repeatCount: 2, repeatDelay: 0.5});
        const tracks = sequenceTracksOf(sequence, {a: {x: line.x}, b: {y: line.x}}).get(target)!;
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
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)), '+0')
            .build({repeatCount: 1, repeatDelay: 0.5, repeatMode: 'reverse'});
        const effects = sequenceTracksOf(sequence, {a: {x: line.x}, b: {y: line.x}}).get(target)!.x!;
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 4.5, iterations: 1, direction: 'normal', fill: 'both'}]);
        expect(sample(effects, [0.5, 2, 3.75, 4.25, 5])).toEqual(closeTo([[0.5, 1, 0.75, 0.25, 0]])[0]);
    });

    it("bakes the repeats inside the outermost one", () => {
        const nested = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1, 'easeIn')))
            .build({repeatCount: 1, repeatDelay: 0.5, repeatMode: 'mirror'});
        const sequence = Sequence.builder().add('nested', nested).build({repeatCount: 1});
        const effects = sequenceTracksOf(sequence, {'nested>a': {x: line.x}}).get(target)!.x!;
        expect(effects.map(timingOf)).toEqual([{delay: 0, duration: 2.5, iterations: 2, direction: 'normal', fill: 'both'}]);

        const easeIn = AnimationDefinition.of(eased(1, 'easeIn')).easing;
        expect(sample(effects, [0.5, 1.25, 2, 3, 4.5])).toEqual(closeTo([[easeIn.progressAt(0.5), 1, 1 - easeIn.progressAt(0.5), easeIn.progressAt(0.5), 1 - easeIn.progressAt(0.5)]])[0]);
    });

    it("continues an infinite entry in a finitely repeating sequence after its first play, under the sequence's effects", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1), {repeatCount: Infinity, repeatDelay: 0.5}))
            .add('b', AnimationDefinition.of(eased(1)), '+0')
            .build({repeatCount: 1});
        const effects = sequenceTracksOf(sequence, {a: {x: line.x}, b: {y: line.x}}).get(target)!.x!;
        expect(effects.map(timingOf)).toEqual([
            {delay: 1, duration: 1.5, iterations: Infinity, direction: 'normal', fill: 'forwards'},
            {delay: 0, duration: 2, iterations: 1, direction: 'normal', fill: 'backwards'},
            {delay: 2, duration: 1, iterations: 1, direction: 'normal', fill: 'none'}
        ]);
        expect(sample(effects, [0.5, 1.5, 2.5, 3.25, 4, 4.75])).toEqual(closeTo([[0.5, 1, 0.5, 0.25, 1, 0.25]])[0]);
    });

    it("drops an infinite entry's continuation in an infinitely repeating sequence", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1), {repeatCount: Infinity, repeatDelay: 0.5}))
            .build({repeatCount: Infinity});
        expect(sequenceTracksOf(sequence, {a: {x: line.x}}).get(target)!.x!.map(timingOf))
            .toEqual([{delay: 0, duration: 1, iterations: Infinity, direction: 'normal', fill: 'both'}]);
    });

    it("fills only the first-starting effect backwards, and forwards only what nothing earlier outlasts", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(2)), 0.5)
            .add('b', AnimationDefinition.of(eased(1)), 0)
            .build();
        expect(sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: line.x}}).get(target)!.x!.map(({delay, fill}) => ({delay, fill})))
            .toEqual([{delay: 0.5, fill: 'forwards'}, {delay: 0, fill: 'backwards'}]);
    });

    it("sets an entry without duration at its position, between the entries around it", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(0)), '+0.5')
            .add('c', AnimationDefinition.of(eased(1)), '+0.5')
            .build();
        const effects = sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: {0: 0.25, 1: 0.75}}, c: {x: {0: 0.75, 1: 0}}}).get(target)!.x!;
        expect(sample(effects, [1.25, 1.75, 2.5, 3.5])).toEqual(closeTo([[1, 0.75, 0.375, 0]])[0]);
    });

    it("drops an effect declared earlier that lies within a later one", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(0.5)), 0.25)
            .add('b', AnimationDefinition.of(eased(1)), 0)
            .build();
        expect(sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: line.x}}).get(target)!.x!.map(({delay, fill}) => ({delay, fill})))
            .toEqual([{delay: 0, fill: 'both'}]);
    });
});

describe("AnimationTracksResolver staggered sequences", () => {
    const cards = [{} as Element, {} as Element, {} as Element];
    const icons = [{} as Element, {} as Element, {} as Element];
    const startsOf = (tracks: AnimationTracks, elements: Element[], property: string) =>
        elements.map(element => tracks.get(element)![property]![0]!.delay);

    it("plays the sequence once per target index, chaining each copy's entries on their own", () => {
        const sequence = Sequence.builder()
            .add('lift', AnimationDefinition.of(eased(1)))
            .add('glow', AnimationDefinition.of(eased(1)))
            .build({delay: index => index * 0.25});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons});
        expect(startsOf(tracks, cards, 'x')).toEqual([0, 0.25, 0.5]);
        expect(startsOf(tracks, icons, 'y')).toEqual([1, 1.25, 1.5]);
    });

    it("pushes an entry of one copy on by its own stagger, as it would one target", () => {
        const sequence = Sequence.builder()
            .add('lift', AnimationDefinition.of(eased(1), {delay: index => index * 0.5}))
            .add('glow', AnimationDefinition.of(eased(1)))
            .build({delay: index => index * 0.25});
        const tracks = sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons});
        expect(startsOf(tracks, cards, 'x')).toEqual([0, 0.75, 1.5]);
        expect(startsOf(tracks, icons, 'y')).toEqual([1, 1.75, 2.5]);
    });

    it("rejects animations with different numbers of targets", () => {
        const sequence = Sequence.builder()
            .add('lift', AnimationDefinition.of(eased(1)))
            .add('glow', AnimationDefinition.of(eased(1)))
            .build({delay: index => index * 0.25});
        expect(() => sequenceTracksOf(sequence, {lift: {x: line.x}, glow: {y: line.x}}, {lift: cards, glow: icons.slice(1)})).toThrow();
    });
});

describe("AnimationTracksResolver effect chains", () => {
    const sample = (effects: readonly NativeAnimationEffect[], times: number[]) => times.map(time => trackValueAt(effects, time));

    it("starts an entry without a value at 0 from the value the track shows as it starts", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)), '-0.5')
            .build();
        const effects = sequenceTracksOf(sequence, {a: {x: {0: 0, 1: 1}}, b: {x: {1: 2}}}).get(target)!.x!;
        expect(sample(effects, [0.25, 0.75, 1.5])).toEqual(closeTo([[0.25, 0.5 + 0.25 * 1.5, 2]])[0]);
    });

    it("starts a chain without a value at 0 from the property's current value", () => {
        const effects = animationTracksOf(AnimationDefinition.of(eased(1)), {x: {1: 1}}).get(target)!.x!;
        expect(keyframesOf(effects[0]!)).toEqual([[0, 0.25], [1, 1]]);
    });

    it("starts an entry that adds to what's under it from its first value, and never makes it a start for another", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)), 0.5)
            .add('c', AnimationDefinition.of(eased(1)), 0.75)
            .build();
        const tracks = sequenceTracksOf(sequence, {a: {x: {0: 0, 1: 1}}, b: {x: {0.5: 3, 1: 3}}, c: {x: {1: 2}}}, {}, {b: 'add'});
        const [a, b, c] = tracks.get(target)!.x!;
        expect(b!.composite).toBe('add');
        expect(keyframesOf(b!)).toEqual([[0, 3], [0.5, 3], [1, 3]]);
        expect(keyframesOf(c!)).toEqual(closeTo([[0, 0.75], [1, 2]]));
        expect(a!.composite).toBe('replace');
    });

    it("keeps an earlier effect that lies within a later one that adds to it", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(0.5)), 0.25)
            .add('b', AnimationDefinition.of(eased(1)), 0)
            .build();
        expect(sequenceTracksOf(sequence, {a: {x: line.x}, b: {x: line.x}}, {}, {b: 'add'}).get(target)!.x!).toHaveLength(2);
    });
});

describe("AnimationTracksResolver values passed through", () => {
    /** Takes any text, and resolves only plain numbers; colours have no number. */
    const textResolver: CSSValueResolver = {...numericResolver, currentValueOf: () => 'none'};
    const textsOf = (effect: NativeAnimationEffect) => effect.keyframes.map(({value}) => value);
    const resolvedWith = (animation: SimpleAnimation, values: { [property: string]: { [progress: number]: string } }, allowedFill: AllowedFill = 'both') =>
        AnimationTracksResolver.resolve(resolveTimings(animation, 1), () => [targetValuesOf(target, values, 'replace', allowedFill)], textResolver).get(target)!;

    it("passes values through as text when the easing is on the effect", () => {
        const [effect] = resolvedWith(AnimationDefinition.of(eased(1, 'easeOut')), {color: {0: 'red', 0.5: 'white', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'white', 'blue']);
    });

    it("passes values through when each span is one whole native easing between two stops", () => {
        const [effect] = resolvedWith(AnimationDefinition.of(eased(1, 'easeOut'), {repeatCount: 1, repeatDelay: 0.5}), {color: {0: 'red', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'blue', 'blue']);
    });

    it("passes values through a reversed play whose easing needn't be split", () => {
        const animation = AnimationDefinition.of(eased(1, 'easeOut'), {repeatCount: 1, repeatDelay: 0.5, repeatMode: 'reverse'});
        const [effect] = resolvedWith(animation, {color: {0: 'red', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'blue', 'blue', 'red']);
        expect(effect!.keyframes[2]!.easing).toEqual({type: 'cubic-bezier', definition: [1 - 0.58, 0, 1, 1]});
    });

    it("passes values through an overshooting Bézier between two stops in a repeat", () => {
        const animation = AnimationDefinition.of(eased(1, [0.3, 1.6, 0.6, 1]), {repeatCount: 1, repeatDelay: 0.5, repeatMode: 'mirror'});
        const [effect] = resolvedWith(animation, {color: {0: 'red', 1: 'blue'}}).color!;
        expect(textsOf(effect!)).toEqual(['red', 'blue', 'blue', 'red']);
    });

    it("starts from the current value as it is", () => {
        const [effect] = resolvedWith(AnimationDefinition.of(eased(1)), {translate: {1: '10px'}}).translate!;
        expect(textsOf(effect!)).toEqual(['none', '10px']);
    });

    it("starts an entry from the stop the track holds as it starts", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)), '+0.5')
            .build();
        const valuesByPath = new Map([['a', [targetValuesOf(target, {color: {0: 'red', 1: 'blue'}})]], ['b', [targetValuesOf(target, {color: {1: 'green'}})]]]);
        const timings = resolveTimings(sequence, new Map([['a', 1], ['b', 1]]));
        const [, b] = AnimationTracksResolver.resolve(timings, path => valuesByPath.get(path)!, textResolver).get(target)!.color!;
        expect(textsOf(b!)).toEqual(['blue', 'green']);
    });

    it("needs numbers for a spring", () => {
        expect(() => resolvedWith(AnimationDefinition.of(spring({duration: 1, bounce: 0.3})), {color: {0: 'red', 1: 'blue'}})).toThrow();
        const [effect] = resolvedWith(AnimationDefinition.of(spring({duration: 1, bounce: 0.3})), {x: {0: '0', 1: '1'}}).x!;
        expect(effect!.keyframes.length).toBeGreaterThan(2);
    });

    it("keeps only the fills the mapping allows", () => {
        expect(resolvedWith(AnimationDefinition.of(eased(1)), {x: {0: '0', 1: '1'}}, 'backwards').x![0]!.fill).toBe('backwards');
        expect(resolvedWith(AnimationDefinition.of(eased(1)), {x: {0: '0', 1: '1'}}, 'none').x![0]!.fill).toBe('none');
    });
});

describe("cssEasingOf", () => {
    it("writes each native easing as CSS", () => {
        expect(cssEasingOf({type: 'steps', definition: [4, 'jumpStart']})).toBe('steps(4, jump-start)');
        expect(cssEasingOf({type: 'linear-points', points: [{input: 0, output: 0}, {input: 0.5, output: 0}, {input: 0.5, output: 1}, {input: 1, output: 1}]}))
            .toBe('linear(0 0%, 0 50%, 1 50%, 1 100%)');
    });
});

describe("EasingFunction windows", () => {
    it("gives the progress of the window without rescaling it, and runs it backwards when reversed", () => {
        const easing = linear.windowed(0.25, 0.75);
        expect([easing.progressAt(0), easing.progressAt(1), easing.reversed().progressAt(0)]).toEqual([0.25, 0.75, 0.75]);
        expect(easing.offsetsAt(0.5)).toEqual([0.5]);
    });
});
