import {describe, it} from "vitest";
import {animation, AnimationTiming, cubicBezier, type Definition, sequence, SequenceTiming, stagger, steps} from "../src/index.ts";

declare const heading: Element, first: Element, second: Element, featuredList: Element, archiveList: Element, element: Element, scope: Element;
declare const definition: Definition;
const timing = {duration: 0.4};

describe("the README's examples", () => {
    it("type-check as the entry points show them", () => {
        animation('.card', {opacity: [0, 1], scale: [0.95, 1]}, {duration: 0.4, easing: 'easeOut'}).play();
        animation('.dot', {scale: [1, 1.4]}, {
            visualDuration: 0.3, bounce: 0.4,
            delay: stagger({step: 0.05, from: 'center'}),
            repeat: Infinity, repeatMode: 'mirror', repeatDelay: 0.6
        }).play();
        sequence()
            .add('h1', {opacity: [0, 1], translate: [-40, 0]}, {duration: 0.6, bounce: 0.2}, {name: 'title'})
            .add('h2', {opacity: [0, 1]}, {duration: 0.4, easing: 'easeOut'}, {at: '-0.3'})
            .add('#cta', {scale: [0.8, 1]}, {stiffness: 300, damping: 20}, {at: 'title<+50%'})
            .build({repeat: 1, repeatMode: 'reverse'})
            .play();
        const cards = sequence()
            .add('.card', {translate: [40, 0]}, {duration: 0.6, bounce: 0.2}, {name: 'lift'})
            .add('.card .icon', {opacity: [0, 1]}, {duration: 0.3}, {at: 'lift<+25%'})
            .build({delay: stagger({step: 0.1})});
        cards.play({scope: featuredList});
        cards.play({scope: archiveList});
    });

    it("type-check as `animation` shows its targets, values and timing", () => {
        animation(heading, {opacity: 1}, timing);
        animation([first, second], {opacity: 1}, timing);
        animation(scope => scope.querySelectorAll('li'), {opacity: 1}, timing);
        animation('.card', {opacity: 1, scale: [0.9, 1.05, 1], translate: {0: -40, 0.7: 8, 1: 0}}, timing);
        animation('.card', {opacity: [0, null], width: [null, 1]}, timing);
        animation('.card', {'--y': {0: '20px', 1: '0px'}}, {duration: 0.6, bounce: 0.2});
        animation('.card', {opacity: [0, 1]}, {duration: 0.4, easing: 'easeOut', delay: 0.1, repeat: 2, repeatMode: 'reverse'});

        const transitions = [
            {duration: 0.4}, {duration: 0.4, easing: 'easeInOut'}, {duration: 0.6, easing: [0.3, 1.6, 0.6, 1]},
            {duration: 1, easing: [4, 'jumpStart']}, {duration: 0},
            {duration: 0.6, easing: cubicBezier(0.3, 1.6, 0.6, 1)}, {duration: 1, easing: steps(4, 'jumpStart')},
            {duration: 0.6, bounce: 0.3}, {visualDuration: 0.4, bounce: 0.2}, {stiffness: 260, damping: 22, mass: 1}
        ] as const;
        for (const transition of transitions) AnimationTiming.of(transition);

        stagger({step: 0.05});
        stagger({spread: 0.4, from: 'center'});
        stagger({step: 0.05, startDelay: 0.2});
        stagger({step: 0.05, from: 'last', easing: 'easeOut'});

        animation('.card', {translate: [40, 0], opacity: [0, 1]}, {
            translate: {duration: 0.6, bounce: 0.2},
            opacity: {duration: 0.2}
        }).play();
    });

    it("type-check as `sequence` shows its entries, positions, nesting and staggers", () => {
        const fadeIn = animation('.note', {opacity: [0, 1]}, {duration: 0.3});
        const intro = sequence()
            .add('h1', {opacity: [0, 1]}, {duration: 0.6, bounce: 0.2}, {name: 'title'})
            .add(fadeIn, {at: 'title<+0.2'})
            .build();
        const card = sequence()
            .add('.card', {scale: [1, 1.05]}, {duration: 0.3, easing: 'easeOut'})
            .add('.card .icon', {opacity: [0.6, 1]}, {duration: 0.5}, {at: '<'})
            .build({repeat: 2, repeatDelay: 0.5, repeatMode: 'reverse'});
        sequence()
            .add(intro, {name: 'intro'})
            .add(card, {at: '-0.2'})
            .build();
        sequence()
            .add('.card', {scale: [1, 1.05]}, {duration: 0.3}, {name: 'lift'})
            .add('.card .icon', {opacity: [0, 1]}, {duration: 0.5})
            .build({delay: stagger({step: 0.1})})
            .play();

        const positions = [
            '', '>', '<', '<<', '>>', 1.5, '+0.2', '<-0.1', '<+25%', '-25%', '<<+50%', '>>-25%', '-=25%', '>>+=10%', '<+50%-=50%+0.1'
        ] as const;
        for (const at of positions) sequence().add('h1', {opacity: 1}, timing, {at});
        sequence()
            .add('h1', {opacity: 1}, timing, {name: 'title'})
            .add('h2', {opacity: 1}, timing, {at: 'title'})
            .add('h2', {opacity: 1}, timing, {at: 'title>'})
            .add('h2', {opacity: 1}, timing, {at: 'title<'})
            .add('h2', {opacity: 1}, timing, {at: 'title+0.2'})
            .add('h2', {opacity: 1}, timing, {at: 'title<+50%'});
    });

    it("type-check as the reusable timings and the controls show them", () => {
        const rise = AnimationTiming.of({duration: 0.6, bounce: 0.2}, {delay: 0.1, repeat: 1});
        animation('.card', {translate: [40, 0]}, rise);
        animation('.panel', {opacity: [0, 1]}, rise);
        const reveal = SequenceTiming.builder()
            .add('title', rise)
            .add('subtitle', {duration: 0.4, easing: 'easeOut'}, '-0.3')
            .add('cta', {stiffness: 300, damping: 20}, 'title<+50%')
            .build({repeat: 1, repeatMode: 'reverse'});
        sequence(reveal, {
            title: {target: 'h1', values: {opacity: [0, 1], translate: [-40, 0]}},
            subtitle: {target: 'h2', values: {opacity: [0, 1]}},
            cta: {target: '#cta', values: {scale: [0.8, 1]}}
        }).play();

        definition.play({scope});
        animation(element, {opacity: [0, 1]}, {duration: 0.4, easing: 'easeOut', repeat: 2, repeatMode: 'reverse'}).play();
    });

    it("reject what the README says the types reject", () => {
        // @ts-expect-error: keys from two kinds of transition
        AnimationTiming.of({duration: 1, easing: 'easeIn', bounce: 0.2});
        // @ts-expect-error: no earlier entry is named "later"
        sequence().add('h1', {opacity: 1}, timing, {at: 'later<'});
        // @ts-expect-error: two offsets of one kind
        sequence().add('h1', {opacity: 1}, timing, {at: '<+1-1'});
        // @ts-expect-error: offsets out of order
        sequence().add('h1', {opacity: 1}, timing, {at: '<-1+50%'});
        // @ts-expect-error: every property needs a timing
        animation('.card', {translate: [40, 0], opacity: [0, 1]}, {translate: {duration: 0.6}});
        const reveal = SequenceTiming.builder().add('title', timing).add('subtitle', timing).build();
        // @ts-expect-error: the mapping names every entry
        sequence(reveal, {title: {target: 'h1', values: {opacity: 1}}});
        // @ts-expect-error: a stagger takes step or spread, not both
        stagger({step: 0.1, spread: 1});
    });
});
