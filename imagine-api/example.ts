import type {Adapter} from "./adaptation.js";
import {
    Sequence,
    eased,
    spring,
    Animation
} from "../new-implementation/index.js";

type WAAPIEffect = [keyframes: Keyframe[], options: KeyframeAnimationOptions];
declare const waapi: Adapter<WAAPIEffect[]>;
declare const backdrop: Element, card: Element, badge: Element, cta: Element, arrow: Element;

const fadeIn = Animation.of(eased(0.2, 'ease-out'));

const rise = Animation.of(spring({ stiffness: 260, damping: 22 }));

// Each tween owns its time
const heartbeat = Animation.of(
    [
        { name: 'grow', transition: spring({ duration: 0.3, bounce: 0.4 }) },
        { name: 'settle', transition: eased(0.25, 'ease-in-out'), delay: 0.08 },
    ],
    { repeatCount: Infinity, repeatDelay: 0.9 }
);

// The animation owns the time and the tweens share it
const nudge = Animation.of(
    eased(0.48, 'ease-out'),
    [
        { name: 'away', ratio: 0.2 },
        { name: 'back', ratio: 0.3, transition: { type: 'eased', easing: 'ease-in-out' } },
        { name: 'home', transition: { type: 'spring', bounce: 0.5 } },  // the remaining 0.5
    ]
);

const reveal = Sequence.builder()
.add('backdrop', fadeIn)
.add('card', rise, '>+0.08')
.build();

const intro = Sequence.builder()
.add('reveal', reveal)
.add('badge', heartbeat, '+0.3')
.add('cta', fadeIn, '+0')  // after the first beat
.add('hint', nudge, '>+0')
.build();

// Adaptation phase
const effects = waapi.adapt(intro, {
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
        to: { grow: { scale: 1.15 }, settle: { scale: 1 } },
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
        to: {
            away: { translate: '-6px 0' },
            back: { translate: '8px 0' },
            // back: { translate: { values: ['4px 0', '8px 0'], offsets: [0.5, 1] } },
            home: { translate: '0 0' },
        },
    },
});