import {describe, expect, it} from "vitest";
import {AnimationTiming} from "../src/animation.js";
import {type At, parsePositionDescriptor, resolvePosition} from "../src/at.js";
import {animation, sequence} from "../src/definitions.js";
import {layoutOf, type SequenceLayout} from "../src/resolution/layout.js";
import {SequenceTiming} from "../src/sequence.js";
import {progressStopsOf, resolveTargets} from "../src/dom/mapping.js";

const second = AnimationTiming.of({duration: 1});

const offset = (seconds: number, referenceFraction = 0, selfFraction = 0) => ({seconds, referenceFraction, selfFraction});

describe("parsePositionDescriptor", () => {
    it("reads the previous entry's end and start, the start of the sequence, and the end of everything so far", () => {
        expect(parsePositionDescriptor('')).toEqual({reference: {kind: 'previous-entry'}, anchor: 'end', offset: offset(0)});
        expect(parsePositionDescriptor('>')).toEqual({reference: {kind: 'previous-entry'}, anchor: 'end', offset: offset(0)});
        expect(parsePositionDescriptor('-0.3' as At<never>)).toEqual({reference: {kind: 'previous-entry'}, anchor: 'end', offset: offset(-0.3)});
        expect(parsePositionDescriptor('<+0.1' as At<never>)).toEqual({reference: {kind: 'previous-entry'}, anchor: 'start', offset: offset(0.1)});
        expect(parsePositionDescriptor('<<')).toEqual({reference: {kind: 'everything-so-far'}, anchor: 'start', offset: offset(0)});
        expect(parsePositionDescriptor('>>+0.5' as At<never>)).toEqual({reference: {kind: 'everything-so-far'}, anchor: 'end', offset: offset(0.5)});
    });

    it("reads a number as an offset in seconds from the start of the sequence", () => {
        expect(parsePositionDescriptor(1.5)).toEqual(parsePositionDescriptor('<<+1.5' as At<never>));
    });

    it("reads names, with or without an anchor", () => {
        expect(parsePositionDescriptor<'title'>('title')).toEqual({reference: {kind: 'entry', name: 'title'}, anchor: 'end', offset: offset(0)});
        expect(parsePositionDescriptor<'title'>('title<+50%' as At<'title'>)).toEqual({reference: {kind: 'entry', name: 'title'}, anchor: 'start', offset: offset(0, 0.5)});
    });

    it("reads one offset of each kind: a share of the reference, a share of the entry's own duration, then seconds", () => {
        expect(parsePositionDescriptor('<+50%+=50%-1').offset).toEqual(offset(-1, 0.5, 0.5));
        expect(parsePositionDescriptor('-=25%+1e-1').offset).toEqual(offset(0.1, 0, -0.25));
    });

    it("rejects what isn't a position", () => {
        for (const at of ['+=1', '<0.2', 'title>>', 'title<<', '<+-1', '>-+50%', '+abc', '+1abc', '1.5', '<<<', '<+1-1', '<+50%-25%', '+=5%-=5%', '<-1+50%', '+=50%+50%'])
            expect(() => parsePositionDescriptor(at as At<'title'>), at).toThrow(SyntaxError);
    });
});

describe("resolvePosition", () => {
    const spans = new Map([['a', {start: 1, duration: 2}], ['b', {start: 0, duration: 1}]]);
    const resolve = (at: string, selfDuration = 4) => resolvePosition(parsePositionDescriptor(at as At<'a' | 'b'>), spans, selfDuration);

    it("measures from the previous entry, a named one, the start of the sequence, or the end of everything so far", () => {
        expect(resolve('')).toBe(1);
        expect(resolve('<')).toBe(0);
        expect(resolve('a')).toBe(3);
        expect(resolve('a<+50%')).toBe(2);
        expect(resolve('<<+50%')).toBe(1.5);
        expect(resolve('>>-50%')).toBe(1.5);
    });

    it("adds every offset, including shares of the inserted entry's duration", () => {
        expect(resolve('a<+50%+=50%-1')).toBe(3);
        expect(resolve('>-=50%')).toBe(-1);
    });

    it("starts from the start of the sequence with no entry before", () => {
        expect(resolvePosition(parsePositionDescriptor('>+1' as At<never>), new Map(), 2)).toBe(1);
        expect(resolvePosition(parsePositionDescriptor('>>+50%' as At<never>), new Map(), 2)).toBe(0);
    });
});

describe("SequenceTimingBuilder", () => {
    const builder = () => SequenceTiming.builder().add('a', second);

    it("rejects time fields that aren't finite and a repeat count that isn't a number", () => {
        expect(() => builder().build({delay: Infinity})).toThrow(RangeError);
        expect(() => builder().build({repeatDelay: NaN})).toThrow(RangeError);
        expect(() => builder().build({repeat: NaN})).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(builder().build({delay: -3, repeat: -2.5, repeatDelay: -1}).options).toEqual({delay: 0, repeat: 0, repeatDelay: 0});
        expect(builder().build({repeat: 2.7}).options.repeat).toBe(2);
    });

    it("takes a transition together with its timing's options", () => {
        const timing = SequenceTiming.builder().add('a', {duration: 1, delay: 0.5, repeat: 2}).build();
        expect(timing.entries.a.timing.options).toEqual({delay: 0.5, repeat: 2});
        expect(timing.entries.a.timing.duration).toBe(1);
    });

    it("rejects positions it can't parse, whose time isn't finite, or that refer to a later entry", () => {
        expect(() => SequenceTiming.builder().add('a', second, 'b>' as '>')).toThrow();
        expect(() => SequenceTiming.builder().add('a', second, Infinity)).toThrow(RangeError);
        expect(() => SequenceTiming.builder().add('a', second, '+Infinity' as '+0')).toThrow(RangeError);
    });

    it("rejects names used twice or with other characters", () => {
        expect(() => builder().add('a', second)).toThrow();
        expect(() => SequenceTiming.builder().add('a-b', second)).toThrow();
    });

    it("gives a new builder from every add, so branches don't share entries", () => {
        const trunk = builder();
        const branch = trunk.add('b', second);
        expect(trunk.build().names).toEqual(['a']);
        expect(branch.build().names).toEqual(['a', 'b']);
        expect(() => SequenceTiming.builder().build()).toThrow();
    });
});

describe("SequenceTiming", () => {
    it("can only be made by its builder", () => {
        expect(() => new (SequenceTiming as unknown as new (...args: unknown[]) => SequenceTiming)(['a'], {})).toThrow();
        expect(() => new (SequenceTiming.builder().constructor as new () => unknown)()).toThrow();
    });
});

describe("positions", () => {
    const startsOf = (timing: SequenceTiming, names: string[]) => {
        const layout = layoutOf(timing, new Map(names.map(name => [name, 1]))) as SequenceLayout;
        return Object.fromEntries(names.map(name => [name, layout.entries.get(name)!.firstStart]));
    };

    it("places entries after the end of everything so far", () => {
        const timing = SequenceTiming.builder()
            .add('a', AnimationTiming.of({duration: 2}))
            .add('b', second, 0)
            .add('c', second, '>>+0.5')
            .build();
        expect(startsOf(timing, ['a', 'b', 'c'])).toEqual({a: 0, b: 0, c: 2.5});
    });

    it("measures shares of the referenced entry, of everything so far, and of the inserted entry", () => {
        const timing = SequenceTiming.builder()
            .add('a', AnimationTiming.of({duration: 2}, {repeat: 1}))
            .add('b', second, 'a<+25%')
            .add('c', AnimationTiming.of({duration: 2}), '-=25%')
            .add('d', second, '>>-25%')
            .build();
        expect(startsOf(timing, ['a', 'b', 'c', 'd'])).toEqual({a: 0, b: 1, c: 1.5, d: 3});
    });

    it("starts the first entry from the start of the sequence, and clamps positions before it", () => {
        const timing = SequenceTiming.builder().add('a', second, '-50%').add('b', second, '<-1').build();
        expect(startsOf(timing, ['a', 'b'])).toEqual({a: 0, b: 0});
    });
});

describe("targets", () => {
    const [first, second] = [{} as Element, {} as Element];
    const scope = {} as Element;

    it("takes an element, or any iterable of them, directly or from a function, each element once", () => {
        expect(resolveTargets(first, scope)).toEqual([first]);
        expect(resolveTargets([first, second, first], scope)).toEqual([first, second]);
        expect(resolveTargets(new Set([second, first]), scope)).toEqual([second, first]);
        expect(resolveTargets(() => new Set([first]), scope)).toEqual([first]);
        expect(resolveTargets(() => second, scope)).toEqual([second]);
    });

    it("rejects a target with no elements", () => {
        expect(() => resolveTargets([], scope)).toThrow("The target has no elements.");
    });
});

describe("value forms", () => {
    it("reads one value or a single-value list as the last, and lists as spread evenly", () => {
        expect(progressStopsOf('x', 5)).toEqual([[1, 5]]);
        expect(progressStopsOf('x', [5])).toEqual([[1, 5]]);
        expect(progressStopsOf('x', [0, 5, 10])).toEqual([[0, 0], [0.5, 5], [1, 10]]);
        expect(progressStopsOf('x', {1: 2, 0.5: 1})).toEqual([[0.5, 1], [1, 2]]);
    });

    it("leaves out null at the ends, and rejects it between them", () => {
        expect(progressStopsOf('x', [0, null])).toEqual([[0, 0]]);
        expect(progressStopsOf('x', [null, 1])).toEqual([[1, 1]]);
        expect(() => progressStopsOf('x', [0, null, 1])).toThrow();
        expect(() => progressStopsOf('x', [])).toThrow();
        expect(() => progressStopsOf('x', [null])).toThrow();
        expect(() => progressStopsOf('x', {1.5: 1})).toThrow(RangeError);
    });
});

describe("animation", () => {
    it("splits timings per property into entries that start together, on the same target", () => {
        const definition = animation('.card', {translate: [40, 0], opacity: [0, 1]}, {
            translate: {duration: 0.6, bounce: 0.2},
            opacity: {duration: 0.2}
        });
        const {timing, mapping} = definition.mappedTiming;
        expect(timing).toBeInstanceOf(SequenceTiming);
        expect((timing as SequenceTiming).names).toEqual(['a', 'b']);
        expect(mapping).toEqual({
            entries: {
                a: {target: '.card', values: {translate: [40, 0]}},
                b: {target: '.card', values: {opacity: [0, 1]}}
            },
            splitsProperties: true
        });
    });

    it("needs a timing for each property and no other", () => {
        expect(() => animation('.card', {translate: [40, 0], opacity: [0, 1]}, {translate: {duration: 1}} as never)).toThrow();
        expect(() => animation('.card', {opacity: [0, 1]}, {opacity: {duration: 1}, scale: {duration: 1}} as never)).toThrow();
    });

    it("takes a property named like a transition key as a property", () => {
        const definition = animation('.card', {duration: [0, 1]}, {duration: {duration: 1}});
        expect(definition.mappedTiming.timing).toBeInstanceOf(SequenceTiming);
    });
});

describe("sequence", () => {
    const fade = {duration: 1};

    it("names unnamed entries by their order, from a to z and on to aa", () => {
        let builder = sequence();
        for (let index = 0; index < 27; index++) builder = builder.add('.dot', {opacity: [0, 1]}, fade);
        const {timing, mapping} = builder.build().mappedTiming;
        expect((timing as SequenceTiming).names.slice(0, 2)).toEqual(['a', 'b']);
        expect((timing as SequenceTiming).names.slice(-2)).toEqual(['z', 'aa']);
        expect((mapping as {entries: object}).entries).toMatchObject({aa: {target: '.dot', values: {opacity: [0, 1]}}});
    });

    it("names unnamed entries around the names given", () => {
        const definition = sequence()
            .add('h1', {opacity: [0, 1]}, fade)
            .add('h2', {opacity: [0, 1]}, fade, {name: 'a'})
            .add('h3', {opacity: [0, 1]}, fade)
            .build();
        expect((definition.mappedTiming.timing as SequenceTiming).names).toEqual(['b', 'a', 'c']);
    });

    it("takes definitions, named or not, and positions that refer to the names given", () => {
        const fadeIn = animation('.note', {opacity: [0, 1]}, fade);
        const nested = sequence().add('#cta', {scale: [0.8, 1]}, fade).build({repeat: 1});
        const definition = sequence()
            .add('h1', {opacity: [0, 1]}, {...fade, delay: 0.1}, {name: 'title'})
            .add(fadeIn, {at: 'title<+0.2'})
            .add(nested, {name: 'cta', at: 'title>'})
            .build();
        const {timing, mapping} = definition.mappedTiming as {timing: SequenceTiming; mapping: {entries: {[name: string]: unknown}}};
        expect(timing.names).toEqual(['title', 'a', 'cta']);
        expect(timing.entries.a!.position).toEqual({reference: {kind: 'entry', name: 'title'}, anchor: 'start', offset: offset(0.2)});
        expect(mapping.entries.title).toEqual({target: 'h1', values: {opacity: [0, 1]}});
        expect(mapping.entries.cta).toEqual({entries: {a: {target: '#cta', values: {scale: [0.8, 1]}}}, splitsProperties: false});
    });

    it("gives a new builder from every add", () => {
        const trunk = sequence().add('h1', {opacity: [0, 1]}, fade);
        trunk.add('h2', {opacity: [0, 1]}, fade);
        expect((trunk.build().mappedTiming.timing as SequenceTiming).names).toEqual(['a']);
    });

    it("only lets positions refer to the names given before them, which its sequence timing checks as it's built", () => {
        // @ts-expect-error: no entry is named "title" yet.
        expect(() => sequence().add('h1', {opacity: [0, 1]}, fade, {at: 'title>'}).build()).toThrow();
        // @ts-expect-error: an unnamed entry can't be referred to.
        sequence().add('h1', {opacity: [0, 1]}, fade).add('h2', {opacity: [0, 1]}, fade, {at: 'a>'});
        expect(() => sequence().add('h1', {opacity: [0, 1]}, fade, {name: 'title'}).add('h2', {opacity: [0, 1]}, fade, {name: 'title'}).build()).toThrow();
        expect(() => sequence().build()).toThrow();
    });

    it("binds a sequence timing to a mapping of the same shape", () => {
        const inner = SequenceTiming.builder().add('glow', fade).build();
        const timing = SequenceTiming.builder().add('title', fade).add('card', inner).build();
        const definition = sequence(timing, {
            title: {target: 'h1', values: {opacity: [0, 1]}},
            card: {glow: {target: '.card', values: {opacity: [0, 1]}}}
        });
        expect(definition.mappedTiming.mapping).toEqual({
            entries: {
                title: {target: 'h1', values: {opacity: [0, 1]}},
                card: {entries: {glow: {target: '.card', values: {opacity: [0, 1]}}}, splitsProperties: false}
            },
            splitsProperties: false
        });
        expect(() => sequence(timing, {title: {target: 'h1', values: {opacity: 1}}} as never)).toThrow('No mapping present for "card".');
        expect(() => sequence(timing, {title: {target: 'h1', values: {opacity: 1}}, card: {}} as never)).toThrow('No mapping present for "card>glow".');
    });
});
