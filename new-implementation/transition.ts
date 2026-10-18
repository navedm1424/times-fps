import {DampedSpring} from "./damped-spring.js";
import {type Easing, type EasingFunction, linear, resolveEasing, SpringEasing} from "./easing.js";
import type {Progress, Seconds} from "./types.js";

export type Transition = EasedTransition | SpringTransition;

// /** Duration comes from the animation's ratio, so only transitions shaped by a given duration fit. */
// export type StretchableTransition =
//     | Omit<EasedTransition, 'duration'>
//     | Omit<PerceptualSpringTransition, 'duration'>;

export interface EasedTransition {
    type: 'eased';
    duration: Seconds;
    easing?: Easing;
}

export function eased(duration: Seconds, easing?: Easing): EasedTransition {
    return {type: 'eased', duration, ...(easing && {easing})};
}

/** How far from its target a spring may be to count as at rest, and how closely a curve fitted to a spring must follow it. */
export const progressPrecision: Progress = 0.001;

/** Works out its own duration. */
export interface PhysicalSpringTransition {
    type: 'spring';
    stiffness: number;
    damping: number;
    mass?: number;
    velocity?: number;         // progress per second
    restDelta?: Progress;      // defaults to `progressPrecision`
}

/** Shaped by `bounce` and stretched so it comes to rest at the end of `duration`. */
export interface PerceptualSpringTransition {
    type: 'spring';
    duration: Seconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

/** Shaped by `bounce`, with `visualDuration` setting how fast it swings; it runs on past it until it comes to rest. */
export interface VisualSpringTransition {
    type: 'spring';
    visualDuration: Seconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

export type SpringTransition = PhysicalSpringTransition | PerceptualSpringTransition | VisualSpringTransition;

export function spring(options: Omit<PhysicalSpringTransition, 'type'>): PhysicalSpringTransition;
export function spring(options: Omit<PerceptualSpringTransition, 'type'>): PerceptualSpringTransition;
export function spring(options: Omit<VisualSpringTransition, 'type'>): VisualSpringTransition;
export function spring(
    options: Omit<PhysicalSpringTransition, 'type'> | Omit<PerceptualSpringTransition, 'type'> | Omit<VisualSpringTransition, 'type'>
): SpringTransition {
    return {type: 'spring', ...options};
}

/** How long one play of the transition lasts, and the easing it runs. */
export function resolveTransition(transition: Transition): { duration: Seconds; easing: EasingFunction } {
    if (transition.type === 'eased')
        return {duration: transition.duration, easing: transition.easing ? resolveEasing(transition.easing) : linear};

    const {spring, duration} = resolveSpring(transition);
    return {duration, easing: new SpringEasing(spring, duration)};
}

/** The spring a transition describes, and how long it runs until it's at rest. */
export function resolveSpring(transition: SpringTransition): { spring: DampedSpring; duration: Seconds } {
    const velocity = transition.velocity ?? 0;
    if ('stiffness' in transition) {
        const spring = DampedSpring.physical(transition.stiffness, transition.damping, transition.mass ?? 1, velocity);
        return {spring, duration: spring.restTime(transition.restDelta ?? progressPrecision)};
    }

    const dampingRatio = dampingRatioOfBounce(transition.bounce);
    if ('visualDuration' in transition) {
        const spring = new DampedSpring(2 * Math.PI / transition.visualDuration, dampingRatio, velocity);
        return {spring, duration: spring.restTime(progressPrecision)};
    }
    return {spring: springRestingAfter(transition.duration, dampingRatio, velocity), duration: transition.duration};
}

/** Apple's mapping: a positive bounce lowers the damping ratio from 1, and a negative one raises it past 1. */
function dampingRatioOfBounce(bounce: number): number {
    return bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
}

const maxRestingRounds = 16;

/**
 * The spring of the damping ratio that comes to rest exactly at `duration`.
 * Its rest time shrinks in proportion as its natural frequency grows, except that the velocity, in progress per second, changes meaning with it; a few rounds settle that.
 */
function springRestingAfter(duration: Seconds, dampingRatio: number, velocity: number): DampedSpring {
    const naturalFrequencyFor = (naturalFrequency: number) =>
        new DampedSpring(1, dampingRatio, velocity / naturalFrequency).restTime(progressPrecision) / duration;

    let naturalFrequency = new DampedSpring(1, dampingRatio).restTime(progressPrecision) / duration;
    for (let round = 0; round < maxRestingRounds; round++) {
        const next = naturalFrequencyFor(naturalFrequency);
        if (Math.abs(next - naturalFrequency) <= naturalFrequency * 1e-12) break;
        naturalFrequency = next;
    }
    return new DampedSpring(naturalFrequency, dampingRatio, velocity);
}
