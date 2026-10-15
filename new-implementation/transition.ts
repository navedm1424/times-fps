import type {Easing} from "./easing.js";
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