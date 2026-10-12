import type {Adaptor} from "./adaptation.js";
import {
    Sequence,
    tween,
    spring,
    Animation
} from "./sequence.js";

type WAAPIEffect = [keyframes: Keyframe[], options: KeyframeAnimationOptions];
declare const waapi: Adaptor<WAAPIEffect[]>;
declare const backdrop: Element, card: Element, badge: Element, cta: Element, arrow: Element;

const fadeIn = Animation.of(tween(200, 'ease-out'));

const rise = Animation.of(spring({ stiffness: 260, damping: 22 }));

// Each tween owns its time
const heartbeat = Animation.of(
    [
        { name: 'grow', transition: spring({ duration: 300, bounce: 0.4 }) },
        { name: 'settle', transition: tween(250, 'ease-in-out'), delay: 80 },
    ],
    { count: Infinity, delay: 900 }
);

// The animation owns the time and the tweens share it
const nudge = Animation.of(
    tween(480, 'ease-out'),
    [
        { name: 'away', ratio: 0.2 },
        { name: 'back', ratio: 0.3, transition: { type: 'tween', easing: 'ease-in-out' } },
        { name: 'home', transition: { type: 'spring', bounce: 0.5 } },  // the remaining 0.5
    ]
);

const reveal = Sequence.builder()
.entry('backdrop', fadeIn)
.entry('card', rise, '>+80')
.build();

const intro = Sequence.builder()
.entry('reveal', reveal)
.entry('badge', heartbeat, '+300')
.entry('cta', fadeIn, '+0')  // after the first beat
.entry('hint', nudge, '>+0')
.build();

// Adaptation phase
const plan = waapi.adapt(intro, {
    reveal: {
        backdrop: {
            target: backdrop,
            from: { opacity: 0 },
            to: { opacity: 1 }
            // keyframes: { opacity: [0, 1] }
        },
        card: {
            target: card,
            from: { opacity: 0, translate: "0 24px" },
            to: { opacity: 1, translate: "0 0" }
            // keyframes: {
            //     opacity: [0, 1],
            //     translate: { values: ['0 24px', '0 -4px', '0 0'], offsets: [0, 0.7, 1] },
            // },
        },
    },
    badge: {
        target: badge,
        from: { scale: 1 },
        tweens: { grow: { scale: 1.15 }, settle: { scale: 1 } },
    },
    cta: {
        target: cta,
        from: { opacity: 0 },
        to: { opacity: 1 },
        // keyframes: { opacity: [0, 1] }
    },
    hint: {
        target: arrow,
        from: { translate: '0 0' },
        tweens: {
            away: { translate: '-6px 0' },
            back: { translate: '8px 0' },
            // back: { translate: { values: ['4px 0', '8px 0'], offsets: [0.5, 1] } },
            home: { translate: '0 0' },
        },
    },
});