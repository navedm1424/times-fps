import {animate, createGeneratorEasing, generateLinearEasing, spring as motionSpring, type ValueTransition} from "motion";
import {animation, type SpringTransitionOptions} from "timesfps";
import {physicsOf} from "./spring-parameters";

export type BallId = "css" | "timesfps" | "motion";

/** Moves the ball across its track, in pixels, from `startTime` on the document timeline, and holds it at `to` until `release`. */
interface BallPlayer {
    play(ball: HTMLElement, from: number, to: number, spring: SpringTransitionOptions, startTime: number): Promise<void>;
    release(ball: HTMLElement): void;
}

function cancelAnimations(ball: HTMLElement): void {
    ball.getAnimations().forEach(animation => animation.cancel());
}

/** Motion rounds elapsed time to its clock's whole units; in microseconds, that's finer than the browser keeps time. */
const microsecondsPerMillisecond = 1000;

/** Ticks Motion at each frame's time on the document timeline, which WAAPI samples at, rather than whenever its own frame loop runs. */
const timelineDriver: NonNullable<ValueTransition["driver"]> = update => {
    let frameRequest: number | undefined;
    const step = (timestamp: number) => {
        frameRequest = requestAnimationFrame(step);
        update(timestamp * microsecondsPerMillisecond);
    };
    return {
        start() {
            frameRequest ??= requestAnimationFrame(step);
        },
        stop() {
            if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
            frameRequest = undefined;
        },
        now: () => (document.timeline.currentTime as number) * microsecondsPerMillisecond
    };
};

function microsecondsOf(clock: Animation): number {
    return (clock.currentTime as number) * microsecondsPerMillisecond;
}

/**
 * Ticks Motion on animation frames at the current time of `clock`, a Web Animation, rather than whenever its own frame loop runs,
 * so Motion keeps the time Web Animations play at, even while DevTools slows them.
 */
function driverOf(clock: Animation): NonNullable<ValueTransition["driver"]> {
    return update => {
        let frameRequest: number | undefined;
        const step = () => {
            frameRequest = requestAnimationFrame(step);
            update(microsecondsOf(clock));
        };
        return {
            start() {
                frameRequest ??= requestAnimationFrame(step);
            },
            stop() {
                if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
                frameRequest = undefined;
            },
            now: () => microsecondsOf(clock)
        };
    };
}

const motionWAAPISyncPlayer: BallPlayer = {
    async play(ball, from, to, spring, startTime) {
        const {velocity, ...physics} = physicsOf(spring);
        const placeBall = (x: number) => ball.style.translate = `${x}px`;
        // The first step comes on the next animation frame.
        placeBall(from);
        // Animates nothing; it only keeps Motion's time, starting with the other balls.
        const clock = new Animation(new KeyframeEffect(ball, null, {duration: Infinity}));
        clock.startTime = startTime;
        const animation = animate(from, to, {
            type: "spring",
            ...physics,
            velocity: velocity * (to - from),
            onUpdate: placeBall,
            driver: driverOf(clock),
            startTime: 0
        });
        // Slowing it by the clock's scale plays it in milliseconds; changing the speed moves the start, which the time puts back.
        animation.speed = 1 / microsecondsPerMillisecond;
        animation.time = clock.currentTime as number / 1000;
        await animation;
        clock.cancel();
    },
    release(ball) {
        ball.style.translate = "";
    }
};

const motionTimelineSyncPlayer: BallPlayer = {
    async play(ball, from, to, spring, startTime) {
        const {velocity, ...physics} = physicsOf(spring);
        const placeBall = (x: number) => ball.style.translate = `${x}px`;
        // The first step comes on the next animation frame.
        placeBall(from);
        const animation = animate(from, to, {
            type: "spring",
            ...physics,
            velocity: velocity * (to - from),
            onUpdate: placeBall,
            driver: timelineDriver,
            startTime: startTime * microsecondsPerMillisecond
        });
        // Slowing it by the clock's scale plays it in milliseconds; changing the speed moves the start, which the time puts back.
        animation.speed = 1 / microsecondsPerMillisecond;
        animation.time = (document.timeline.currentTime as number - startTime) / 1000;
        await animation;
    },
    release: motionWAAPISyncPlayer.release
};

const ballPlayers: { [Id in BallId]: BallPlayer } = {
    /** Samples Motion's spring into a CSS `linear()` easing, as Motion does for WAAPI. */
    css: {
        async play(ball, from, to, spring, startTime) {
            // Motion's `Transition` type leaves out the keyframes it reads to scale the velocity.
            const options = {keyframes: [0, 1], ...physicsOf(spring)};
            const {ease, duration} = createGeneratorEasing(options, 100, motionSpring);
            const durationInMilliseconds = duration * 1000;
            const animation = ball.animate(
                {translate: [`${from}px`, `${to}px`]},
                {duration: durationInMilliseconds, easing: generateLinearEasing(ease, durationInMilliseconds), fill: "forwards"}
            );
            animation.startTime = startTime;
            await animation.finished;
        },
        release: cancelAnimations
    },
    timesfps: {
        async play(ball, from, to, spring, startTime) {
            const controls = animation(ball, {translate: {0: from, 1: to}}, spring).play();
            controls.startTime = startTime / 1000;
            await controls.finished;
        },
        release: cancelAnimations
    },
    /** Motion steps the spring on animation frames, and each step is written to the ball. */
    motion: motionTimelineSyncPlayer
};

function travelOf(ball: HTMLElement): number {
    return ball.parentElement!.clientWidth - ball.offsetWidth;
}

/** The time of the next frame on the document timeline, resolved within it, so animations started then begin on it. */
export function nextFrameTime(): Promise<number> {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

/** Plays the ball to the end with its own player, after which its CSS, keyed by `data-position`, holds it there. */
export async function playToEnd(id: BallId, ball: HTMLElement, spring: SpringTransitionOptions, startTime: number): Promise<void> {
    const player = ballPlayers[id];
    await player.play(ball, 0, travelOf(ball), spring, startTime);
    ball.dataset.position = "end";
    player.release(ball);
}

/** Brings the balls back from the end as one animation, so they move as one; their tracks are equally wide. */
export async function returnToStart(balls: HTMLElement[], spring: SpringTransitionOptions): Promise<void> {
    await animation(balls, {translate: {0: travelOf(balls[0]!), 1: 0}}, spring).play().finished;
    for (const ball of balls) {
        delete ball.dataset.position;
        cancelAnimations(ball);
    }
}
