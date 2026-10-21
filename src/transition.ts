import {DampedSpring} from "./damped-spring.js";
import {type EasingDescriptor, type EasingFunction, linear, resolveEasing, SpringEasing} from "./easing.js";
import {PRECISION} from "./constants.js";
import type {Progress, Seconds} from "./types.js";
import {checkNumber, checkPositive} from "./utils/validation.js";

type ElementOf<A extends readonly string[]> = A extends readonly (infer Element)[] ? Element : never;

const groupedTransitionKeys = {
    eased: ['duration', 'easing'],
    durationSpring: ['duration', 'bounce', 'velocity'],
    visualSpring: ['visualDuration', 'bounce', 'velocity'],
    physicalSpring: ['stiffness', 'damping', 'mass', 'velocity', 'restDelta']
} as const satisfies {
    [kind: string]: string[];
};

type TransitionKind = keyof typeof groupedTransitionKeys;
type TransitionKey<Kind extends TransitionKind = TransitionKind> = ElementOf<typeof groupedTransitionKeys[Kind]>;

type OtherKeysExcluded<Kind extends TransitionKind> = { [Key in Exclude<TransitionKey, TransitionKey<Kind>>]?: never; };

/** A timed transition with an easing; it's the kind a `duration` without a `bounce` is. */
export interface EasedTransitionOptions extends OtherKeysExcluded<"eased"> {
    duration: Seconds;
    easing?: EasingDescriptor;
}

/** Shaped by `bounce` and stretched so it comes to rest at the end of `duration`. */
export interface DurationSpringTransitionOptions extends OtherKeysExcluded<"durationSpring"> {
    duration: Seconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

/** Shaped by `bounce`, with `visualDuration` setting how fast it swings; it runs on past it until it comes to rest. */
export interface VisualSpringTransitionOptions extends OtherKeysExcluded<"visualSpring"> {
    visualDuration: Seconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

/** Works out its own duration. */
export interface PhysicalSpringTransitionOptions extends OtherKeysExcluded<"physicalSpring"> {
    stiffness: number;
    damping: number;
    mass?: number;
    velocity?: number;         // progress per second
    restDelta?: Progress;      // defaults to `PRECISION`
}

export type SpringTransitionOptions = DurationSpringTransitionOptions | VisualSpringTransitionOptions | PhysicalSpringTransitionOptions;

export type TransitionOptions = EasedTransitionOptions | SpringTransitionOptions;

// /** Duration comes from the animation's ratio, so only transitions shaped by a given duration fit. */
// export type StretchableTransition =
//     | Omit<EasedTransitionDescriptor, 'duration'>
//     | Omit<DurationSpringTransitionDescriptor, 'duration'>;

const transitionKeyEntries = Object.entries(groupedTransitionKeys);
const transitionKeySetByKind = Object.fromEntries(
    transitionKeyEntries.map(([k, v]) => [k, new Set(v)])
) as { [K in TransitionKind]: Set<string>; };
const transitionKeySet = new Set<string>(transitionKeyEntries.flatMap(([, k]) => k));

/** The keys a transition can have, which never overlap a timing's options. */
export function isTransitionKey(key: string): boolean {
    return transitionKeySet.has(key);
}

/** Physical with `stiffness` or `damping`, visual with `visualDuration`, a duration spring with `bounce`, and eased otherwise. */
function transitionKindOf(transition: TransitionOptions): TransitionKind {
    if (transition.stiffness !== undefined || transition.damping !== undefined) return 'physicalSpring';
    if (transition.visualDuration !== undefined) return 'visualSpring';
    if (transition.bounce !== undefined) return 'durationSpring';
    return 'eased';
}

/** Rejects keys of another kind, what no play can run, and every spring that can't come to rest, before it reaches the spring's own checks. */
export function checkTransitionOptions(transition: TransitionOptions, label: string): void {
    const kind = transitionKindOf(transition);
    const kindKeys = transitionKeySetByKind[kind];
    const strayKey = Object.keys(transition).find(key =>
        isTransitionKey(key) && !kindKeys.has(key) && transition[key as TransitionKey] !== undefined
    );
    if (strayKey !== undefined)
        throw new TypeError(`${label} has "${strayKey}", which a transition with ${[...kindKeys].map(key => `"${key}"`).join(', ')} doesn't take.`);

    checkNumber(transition.velocity, `${label}'s velocity`);
    switch (kind) {
        case 'eased':
            requireNumber(transition.duration, `${label}'s duration`);
            if (checkNumber(transition.duration, `${label}'s duration`) < 0)
                throw new RangeError(`${label}'s duration can't be negative, not ${transition.duration}.`);
            return;
        case 'physicalSpring': {
            requireNumber(transition.stiffness, `${label}'s stiffness`);
            requireNumber(transition.damping, `${label}'s damping`);
            checkPositive(transition.stiffness, `${label}'s stiffness`);
            checkPositive(transition.damping, `${label}'s damping`);
            checkPositive(transition.mass, `${label}'s mass`);
            const {restDelta} = transition;
            if (checkNumber(restDelta, `${label}'s rest delta`) !== undefined && !(restDelta! > 0 && restDelta! < 1))
                throw new RangeError(`${label}'s rest delta must be between 0 and 1, not ${restDelta}.`);
            return;
        }
        case 'visualSpring':
            checkBounce(transition.bounce, label);
            checkPositive(transition.visualDuration, `${label}'s visual duration`);
            return;
        case 'durationSpring':
            checkBounce(transition.bounce, label);
            requireNumber(transition.duration, `${label}'s duration`);
            checkPositive(transition.duration, `${label}'s duration`);
            return;
    }
}

function checkBounce(bounce: number | undefined, label: string): void {
    if (!(bounce! > -1 && bounce! < 1))
        throw new RangeError(`${label}'s bounce must be between -1 and 1, not ${bounce}.`);
}

function requireNumber(value: number | undefined, label: string): asserts value is number {
    if (typeof value !== 'number') throw new TypeError(`${label} is required.`);
}

/** How long one play of the transition lasts, and the easing it runs. */
export function resolveTransition(transition: TransitionOptions): { duration: Seconds; easing: EasingFunction } {
    if (transitionKindOf(transition) === 'eased') {
        const {duration, easing} = transition as EasedTransitionOptions;
        return {duration, easing: easing ? resolveEasing(easing) : linear};
    }

    const {spring, duration} = resolveSpring(transition as SpringTransitionOptions);
    return {duration, easing: new SpringEasing(spring, duration)};
}

/** The spring a transition describes, and how long it runs until it's at rest. */
export function resolveSpring(transition: SpringTransitionOptions): { spring: DampedSpring; duration: Seconds } {
    const velocity = transition.velocity ?? 0;
    // Physical spring
    if (transition.stiffness !== undefined) {
        const spring = DampedSpring.physical(transition.stiffness, transition.damping, transition.mass ?? 1, velocity);
        return {spring, duration: spring.restTime(transition.restDelta ?? PRECISION)};
    }
    // Visual spring
    const dampingRatio = dampingRatioOfBounce(transition.bounce);
    if (transition.visualDuration !== undefined) {
        const spring = new DampedSpring(2 * Math.PI / transition.visualDuration, dampingRatio, velocity);
        return {spring, duration: spring.restTime(PRECISION)};
    }
    // Duration spring
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
        new DampedSpring(1, dampingRatio, velocity / naturalFrequency).restTime(PRECISION) / duration;

    let naturalFrequency = new DampedSpring(1, dampingRatio).restTime(PRECISION) / duration;
    for (let round = 0; round < maxRestingRounds; round++) {
        const next = naturalFrequencyFor(naturalFrequency);
        if (Math.abs(next - naturalFrequency) <= naturalFrequency * 1e-12) break;
        naturalFrequency = next;
    }
    return new DampedSpring(naturalFrequency, dampingRatio, velocity);
}
