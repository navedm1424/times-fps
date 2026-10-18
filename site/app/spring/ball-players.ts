import {animate, createGeneratorEasing, generateLinearEasing, spring as motionSpring} from "motion";
import {AnimationDefinition, type SpringTransition, WAAPIAdapter} from "timesfps";
import {physicsOf} from "./spring-parameters";

export type BallId = "css" | "timesfps" | "motion";

/** Moves the ball across its track, in pixels, and holds it at `to` until `release`. */
interface BallPlayer {
    play(ball: HTMLElement, from: number, to: number, spring: SpringTransition): Promise<void>;
    release(ball: HTMLElement): void;
}

const adapter = new WAAPIAdapter();

function cancelAnimations(ball: HTMLElement): void {
    ball.getAnimations().forEach(animation => animation.cancel());
}

const ballPlayers: { [Id in BallId]: BallPlayer } = {
    /** Samples Motion's spring into a CSS `linear()` easing, as Motion does for WAAPI. */
    css: {
        async play(ball, from, to, spring) {
            // Motion's `Transition` type leaves out the keyframes it reads to scale the velocity.
            const options = {keyframes: [0, 1], ...physicsOf(spring)};
            const {ease, duration} = createGeneratorEasing(options, 100, motionSpring);
            const durationInMilliseconds = duration * 1000;
            await ball.animate(
                {translate: [`${from}px`, `${to}px`]},
                {duration: durationInMilliseconds, easing: generateLinearEasing(ease, durationInMilliseconds), fill: "forwards"}
            ).finished;
        },
        release: cancelAnimations
    },
    timesfps: {
        async play(ball, from, to, spring) {
            const animations = adapter.animate(AnimationDefinition.of(spring), {target: ball, values: {translate: {0: from, 1: to}}});
            await Promise.all(animations.map(animation => animation.finished));
        },
        release: cancelAnimations
    },
    /** Motion steps the spring on animation frames, and each step is written to the ball. */
    motion: {
        async play(ball, from, to, spring) {
            const {velocity, ...physics} = physicsOf(spring);
            const placeBall = (x: number) => ball.style.translate = `${x}px`;
            // The first step comes on the next animation frame.
            placeBall(from);
            await animate(from, to, {type: "spring", ...physics, velocity: velocity * (to - from), onUpdate: placeBall});
        },
        release(ball) {
            ball.style.translate = "";
        }
    }
};

function travelOf(ball: HTMLElement): number {
    return ball.parentElement!.clientWidth - ball.offsetWidth;
}

/** Plays the ball to the end with its own player, after which its CSS, keyed by `data-position`, holds it there. */
export async function playToEnd(id: BallId, ball: HTMLElement, spring: SpringTransition): Promise<void> {
    const player = ballPlayers[id];
    await player.play(ball, 0, travelOf(ball), spring);
    ball.dataset.position = "end";
    player.release(ball);
}

/** Brings the balls back from the end as one animation, so they move as one; their tracks are equally wide. */
export async function returnToStart(balls: HTMLElement[], spring: SpringTransition): Promise<void> {
    const animations = adapter.animate(AnimationDefinition.of(spring), {target: balls, values: {translate: {0: travelOf(balls[0]!), 1: 0}}});
    await Promise.all(animations.map(animation => animation.finished));
    for (const ball of balls) {
        delete ball.dataset.position;
        cancelAnimations(ball);
    }
}
