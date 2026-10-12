
import type {Easing} from "./easing.js";
import {Progress, Seconds} from "./types";

export type Transition = EasedTransition | SpringTransition;

/** Duration comes from the animation's ratio, so only transitions shaped by a given duration fit. */
export type StretchableTransition =
    | Omit<EasedTransition, 'duration'>
    | Omit<PerceptualSpringTransition, 'duration'>;

export interface EasedTransition {
    type: 'eased';
    duration: Seconds;
    easing?: Easing;
}

export function eased(duration: Seconds, easing?: Easing): EasedTransition {
    return {type: 'eased', duration, ...(easing && {easing})};
}

/** Works out its own duration. */
export interface PhysicalSpringTransition {
    type: 'spring';
    stiffness: number;
    damping: number;
    mass?: number;
    velocity?: number;         // progress per second
    restDelta?: Progress;
}

export interface PerceptualSpringTransition {
    type: 'spring';
    duration: Seconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

export type SpringTransition = PhysicalSpringTransition | PerceptualSpringTransition;

export function spring(options: Omit<PhysicalSpringTransition, 'type'>): PhysicalSpringTransition;
export function spring(options: Omit<PerceptualSpringTransition, 'type'>): PerceptualSpringTransition;
export function spring(
    options: Omit<PhysicalSpringTransition, 'type'> | Omit<PerceptualSpringTransition, 'type'>
): SpringTransition {
    return {type: 'spring', ...options};
}