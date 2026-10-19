import {describe, expect, it} from "vitest";
import {AnimationDefinition} from "../src/animation.js";
import {Sequence} from "../src/sequence.js";
import type {SimpleAnimationEntry} from "../src/types.js";
import {eased} from "../src/transition.js";
import {type MappedSequenceBuilder, sequence} from "../src/waapi/animator.js";

describe("SequenceBuilder.build", () => {
    const builder = () => Sequence.builder().add('a', AnimationDefinition.of(eased(1)));

    it("rejects time fields that aren't finite and a repeat count that isn't a number", () => {
        expect(() => builder().build({delay: Infinity})).toThrow(RangeError);
        expect(() => builder().build({repeatDelay: NaN})).toThrow(RangeError);
        expect(() => builder().build({repeatCount: NaN})).toThrow(RangeError);
    });

    it("clamps negative delays and repeats to 0 and rounds fractional repeat counts down", () => {
        expect(builder().build({delay: -3, repeatCount: -2.5, repeatDelay: -1}).options).toEqual({delay: 0, repeatCount: 0, repeatDelay: 0});
        expect(builder().build({repeatCount: 2.7}).options.repeatCount).toBe(2);
    });
});

describe("SequenceBuilder.add", () => {
    it("parses positions as entries are added, reading a lone '<' as '<+0'", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)), '<')
            .add('c', AnimationDefinition.of(eased(1)), 'a<-0.5')
            .build();
        expect(sequence.entries.a.at).toEqual({kind: 'relative', reference: undefined, anchor: 'end', offset: 0});
        expect(sequence.entries.b.at).toEqual({kind: 'relative', reference: undefined, anchor: 'start', offset: 0});
        expect(sequence.entries.c.at).toEqual({kind: 'relative', reference: 'a', anchor: 'start', offset: -0.5});
    });

    it("reads a name followed by '<' alone as that entry's start", () => {
        const sequence = Sequence.builder()
            .add('a', AnimationDefinition.of(eased(1)))
            .add('b', AnimationDefinition.of(eased(1)), 'a<')
            .build();
        expect(sequence.entries.b.at).toEqual({kind: 'relative', reference: 'a', anchor: 'start', offset: 0});
    });

    it("rejects a reference to an entry that isn't an earlier one", () => {
        expect(() => Sequence.builder().add('a', AnimationDefinition.of(eased(1)), 'b+0' as '+0')).toThrow();
    });

    it("takes a transition together with its animation's options", () => {
        const sequence = Sequence.builder().add('a', {...eased(1), delay: 0.5, repeatCount: 2}).build();
        expect(sequence.entries.a.animation.options).toEqual({delay: 0.5, repeatCount: 2});
        expect(sequence.entries.a.animation.duration).toBe(1);
    });

    it("rejects a position it can't parse, or whose time isn't finite", () => {
        expect(() => Sequence.builder().add('a', AnimationDefinition.of(eased(1)), '>+0' as '+0')).toThrow();
        expect(() => Sequence.builder().add('a', AnimationDefinition.of(eased(1)), Infinity)).toThrow(RangeError);
        expect(() => Sequence.builder().add('a', AnimationDefinition.of(eased(1)), '+Infinity' as '+0')).toThrow(RangeError);
    });
});

describe("SequenceBuilder.build", () => {
    it("rejects a sequence without entries", () => {
        expect(() => Sequence.builder().build()).toThrow();
    });

    it("leaves the sequences it built alone as the builder goes on", () => {
        const builder = Sequence.builder().add('a', AnimationDefinition.of(eased(1)));
        const built = builder.build();
        builder.add('b', AnimationDefinition.of(eased(1)));
        expect(built.names).toEqual(['a']);
        expect(Object.keys(built.entries)).toEqual(['a']);
    });
});

describe("Sequence", () => {
    it("validates entries and options made without a builder", () => {
        const entry = {animation: AnimationDefinition.of(eased(1)), at: {kind: 'relative', reference: 'b', anchor: 'end', offset: 0}} as const;
        expect(() => new Sequence([], {})).toThrow();
        expect(() => new Sequence(['a'], {a: entry})).toThrow();
        expect(() => new Sequence(['a-b'], {'a-b': {...entry, at: {kind: 'absolute', time: 0}}})).toThrow();
        expect(new Sequence(['a'], {a: {...entry, at: {kind: 'absolute', time: 0}}}, {delay: -1}).options).toEqual({delay: 0});
    });
});

describe("sequence", () => {
    const built = (builder: MappedSequenceBuilder<string>) => builder['build']();

    it("names unnamed entries by their order, from a to z and on to aa", () => {
        const builder = sequence();
        for (let index = 0; index < 27; index++) builder.add('.dot', {opacity: [0, 1]}, eased(1));
        const {sequence: built27, mapping} = built(builder);
        expect(built27.names.slice(0, 2)).toEqual(['a', 'b']);
        expect(built27.names.slice(-2)).toEqual(['z', 'aa']);
        expect(mapping.aa).toEqual({target: '.dot', values: {opacity: [0, 1]}});
    });

    it("takes names, for positions to refer to, and nested sequences, named or not", () => {
        const nested = sequence({repeatCount: 1}).add('#cta', {scale: [0.8, 1]}, eased(0.3));
        const builder = sequence()
            .add('title', 'h1', {opacity: [0, 1]}, {...eased(0.6), delay: 0.1})
            .add('h2', {opacity: [0, 1]}, eased(0.4), 'title<+0.2')
            .add('cta', nested, 'title+0')
            .add(sequence().add('p', {opacity: [0, 1]}, eased(0.2)), '<');
        const {sequence: page, mapping} = built(builder);
        expect(page.names).toEqual(['title', 'a', 'cta', 'b']);
        expect(page.entries.a!.at).toEqual({kind: 'relative', reference: 'title', anchor: 'start', offset: 0.2});
        expect(mapping.cta).toEqual({a: {target: '#cta', values: {scale: [0.8, 1]}}});
        expect((page.entries.title as SimpleAnimationEntry).animation.options).toEqual({delay: 0.1});
    });

    it("names unnamed entries around the names given", () => {
        const builder = sequence()
            .add('h1', {opacity: [0, 1]}, eased(1))
            .add('a', 'h2', {opacity: [0, 1]}, eased(1))
            .add('h3', {opacity: [0, 1]}, eased(1));
        expect(built(builder).sequence.names).toEqual(['b', 'a', 'c']);
    });

    it("takes the composite and fill with the transition", () => {
        const builder = sequence().add('h1', {opacity: [0, 1]}, {...eased(1), delay: 0.2, composite: 'add', fill: 'none'});
        const {sequence: built1, mapping} = built(builder);
        expect(mapping.a).toEqual({target: 'h1', values: {opacity: [0, 1]}, composite: 'add', fill: 'none'});
        expect((built1.entries.a as SimpleAnimationEntry).animation.options).toEqual({delay: 0.2});
    });

    it("takes the composite and fill with an animation", () => {
        const fadeIn = AnimationDefinition.of(eased(1));
        const {sequence: built1, mapping} = built(sequence().add('h1', {opacity: [0, 1]}, {animation: fadeIn, composite: 'accumulate', fill: 'forwards'}));
        expect(mapping.a).toEqual({target: 'h1', values: {opacity: [0, 1]}, composite: 'accumulate', fill: 'forwards'});
        expect((built1.entries.a as SimpleAnimationEntry).animation).toBe(fadeIn);
    });

    it("only lets positions refer to the names given before them", () => {
        // @ts-expect-error: no entry is named "title" yet.
        expect(() => sequence().add('h1', {opacity: [0, 1]}, eased(1), 'title+0')).toThrow();
        // @ts-expect-error: an unnamed entry can't be referred to.
        expect(() => sequence().add('h1', {opacity: [0, 1]}, eased(1)).add('h2', {opacity: [0, 1]}, eased(1), 'a+0')).toThrow();
        expect(() => sequence().add('h1', {opacity: [0, 1]}, eased(1), 'title+0' as '+0')).toThrow();
    });
});
