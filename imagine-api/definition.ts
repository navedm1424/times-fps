// ── Time ───────────────────────────────────────────────────

type Seconds = number;
type Ratio = number;     // share of the animation's duration, 0–1
export type Progress = number;  // position on the 0→1 change axis

// ── How the change happens ─────────────────────────────────

type CubicBezierDefinition = readonly [x1: number, y1: number, x2: number, y2: number];
type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | CubicBezierDefinition;

interface EasedTransition {
    type: 'eased';
    duration: Seconds;
    easing?: Easing;
}

/** Works out its own duration. */
interface PhysicalSpringTransition {
    type: 'spring';
    stiffness: number;
    damping: number;
    mass?: number;
    velocity?: number;         // progress per second
    restDelta?: Progress;
}

interface PerceptualSpringTransition {
    type: 'spring';
    duration: Seconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

type SpringTransition = PhysicalSpringTransition | PerceptualSpringTransition;
type Transition = EasedTransition | SpringTransition;

export declare function eased(duration: Seconds, easing?: Easing): EasedTransition;

export declare function spring(options: Omit<PhysicalSpringTransition, 'type'>): PhysicalSpringTransition;
export declare function spring(options: Omit<PerceptualSpringTransition, 'type'>): PerceptualSpringTransition;

/** Duration comes from the animation's ratio, so only transitions shaped by a given duration fit. */
type StretchableTransition =
    | Omit<EasedTransition, 'duration'>
    | Omit<PerceptualSpringTransition, 'duration'>;

// ── How often ──────────────────────────────────────────────

type RepeatMode = 'loop' | 'reverse' | 'mirror';

interface Repeat {
    count: number;             // repetitions after the first play
    delay?: Seconds;
    mode?: RepeatMode;
}

// ── Tweens ─────────────────────────────────────────────────

interface TimedTween<Name extends string = string> {
    name: Name;
    transition: Transition;
    delay?: Seconds;
    repeat?: Repeat;           // count must be finite
}

interface RatioTween<Name extends string = string> {
    name: Name;
    ratio?: Ratio;             // omitted = equal share of what's left
    transition?: StretchableTransition;
}

// ── Animations ─────────────────────────────────────────────

export declare class Animation {
    readonly repeat?: Repeat;
    static of(transition: Transition, repeat?: Repeat): SimpleAnimation;
    static of<T extends string[]>(transition: Transition, tweens: { [I in keyof T]: RatioTween<T[I]>; }, repeat?: Repeat): SelfTimedAnimation<T>;
    static of<T extends string[]>(tweens: { [I in keyof T]: TimedTween<T[I]>; }, repeat?: Repeat): TweenTimedAnimation<T>;
}

export interface SimpleAnimation extends Animation {
    readonly type: "simple";
    readonly transition: Transition;
}

export interface SelfTimedAnimation<T extends string[]> extends Animation {
    readonly type: "self-timed";
    readonly transition: Transition;
    readonly tweens: {
        [I in keyof T]: RatioTween<T[I]>;
    };
}

export interface TweenTimedAnimation<T extends string[]> extends Animation {
    readonly type: "tween-timed";
    readonly tweens: {
        [I in keyof T]: TimedTween<T[I]>;
    };
    // easing?: Easing;           // compounds with each tween's easing
}

export type MultiTweenAnimation<T extends string[]> = SelfTimedAnimation<T> | TweenTimedAnimation<T>;

// ── Sequences ──────────────────────────────────────────────

type AtOperator = '+' | '-' | '>+' | '>-';

/**
 * A number is absolute time.
 * `+n` / `-n` is relative to the previous entry's last referenceable point: for an infinite repeat, the end of its first iteration.
 * `>+n` / `>-n` is relative to the previous entry's start.
 */
type At<N extends string> = Seconds | `${AtOperator}${number}` | `${N}${AtOperator}${number}`;

// interface Stagger {
//     each: Seconds;
//     from?:
//     easing?: Easing;
// }
type Stagger = (index: number, total: number) => Seconds;
declare function stagger(each: Seconds, options?: {
    from?: 'first' | 'last' | 'center' | number;
    easing?: Easing;
}): Stagger;

// interface AnimationEntry {
//     animation: Animation;
//     at?: Position;
//     stagger?: Stagger;
// }
//
// interface SequenceEntry<S extends SequenceShape> {
//     sequence: Sequence<S>;
//     at?: Position;
// }

export declare class Sequence<SE extends SequenceEntries = {}> {
    // entries: readonly (AnimationEntry | SequenceEntry)[];
    readonly entries: SE;
    readonly repeat?: Repeat;
    static builder(): SequenceBuilder;
}

export interface SimpleAnimationEntry<N extends string = string> {
    animation: SimpleAnimation;
    at?: At<N>;
    stagger?: Stagger;
}
export interface MultiTweenAnimationEntry<A extends MultiTweenAnimation<string[]> = MultiTweenAnimation<string[]>, N extends string = string> {
    animation: A;
    at?: At<N>;
    stagger?: Stagger;
}
export interface NestedSequenceEntry<NS extends Sequence = Sequence, N extends string = string> {
    sequence: NS;
    at?: At<N>;
}

type SequenceEntries = {
    [name: string]: SimpleAnimationEntry | MultiTweenAnimationEntry | NestedSequenceEntry;
};

export declare class SequenceBuilder<SE extends SequenceEntries = {}> {
    add<N extends string>(
        name: N,
        animation: SimpleAnimation,
        at?: SimpleAnimationEntry<keyof SE & string>["at"],
        stagger?: Stagger
    ): SequenceBuilder<SE & { [_ in N]: SimpleAnimationEntry<keyof SE & string> }>;

    add<N extends string, A extends MultiTweenAnimation<string[]>>(
        name: N,
        animation: A,
        at?: MultiTweenAnimationEntry<A, keyof SE & string>["at"],
        stagger?: Stagger
    ): SequenceBuilder<SE & { [_ in N]: MultiTweenAnimationEntry<A, keyof SE & string> }>;

    add<N extends string, NS extends Sequence>(
        name: N,
        sequence: NS,
        at?: NestedSequenceEntry<NS, keyof SE & string>["at"]
    ): SequenceBuilder<SE & { [_ in N]: NestedSequenceEntry<NS, keyof SE & string>; }>;

    build(repeat?: Repeat): Sequence<{ [K in keyof SE]: SE[K] }>;
}