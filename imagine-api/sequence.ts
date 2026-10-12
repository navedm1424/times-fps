// ── Time ───────────────────────────────────────────────────

type Milliseconds = number;
type Ratio = number;     // share of the animation's duration, 0–1
export type Progress = number;  // position on the 0→1 change axis

// ── How the change happens ─────────────────────────────────

type CubicBezierDefinition = readonly [x1: number, y1: number, x2: number, y2: number];
type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | CubicBezierDefinition;

interface TweenTransition {
    type: 'tween';
    duration: Milliseconds;
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
    duration: Milliseconds;
    bounce: number;            // 0 = no overshoot
    velocity?: number;         // progress per second
}

type SpringTransition = PhysicalSpringTransition | PerceptualSpringTransition;
type Transition = TweenTransition | SpringTransition;

export declare function tween(duration: Milliseconds, easing?: Easing): TweenTransition;

export declare function spring(options: Omit<PhysicalSpringTransition, 'type'>): PhysicalSpringTransition;
export declare function spring(options: Omit<PerceptualSpringTransition, 'type'>): PerceptualSpringTransition;

/** Duration comes from the animation's ratio, so only transitions shaped by a given duration fit. */
type TransitionWithoutDuration =
    | Omit<TweenTransition, 'duration'>
    | Omit<PerceptualSpringTransition, 'duration'>;

// ── How often ──────────────────────────────────────────────

type RepeatMode = 'loop' | 'reverse' | 'mirror';

interface Repeat {
    count: number;             // repetitions after the first play
    delay?: Milliseconds;
    mode?: RepeatMode;
}

// ── Tweens ─────────────────────────────────────────────────

interface DurationTween<Name extends string = string> {
    name: Name;
    transition: Transition;
    delay?: Milliseconds;
    repeat?: Repeat;           // count must be finite
}

interface RatioTween<Name extends string = string> {
    name: Name;
    ratio?: Ratio;             // omitted = equal share of what's left
    transition?: TransitionWithoutDuration;
}

// ── Animations ─────────────────────────────────────────────

export declare class Animation {
    readonly repeat?: Repeat;
    static of(transition: Transition, repeat?: Repeat): SimpleAnimation;
    static of<T extends string[]>(transition: Transition, tweens: { [N in keyof T]: RatioTween<T[N]>; }, repeat?: Repeat): RatioTweenAnimation<T>;
    static of<T extends string[]>(tweens: { [N in keyof T]: DurationTween<T[N]>; }, repeat?: Repeat): DurationTweenAnimation<T>;
}

export interface SimpleAnimation extends Animation {
    readonly type: "simple";
    readonly transition: Transition;
}

export interface RatioTweenAnimation<T extends string[]> extends Animation {
    readonly type: "ratio-tween";
    readonly transition: Transition;
    tweens: {
        [N in keyof T]: RatioTween<T[N]>;
    };
}

export interface DurationTweenAnimation<T extends string[]> extends Animation {
    readonly type: "duration-tween";
    readonly tweens: {
        [N in keyof T]: DurationTween<T[N]>;
    };
    // easing?: Easing;           // compounds with each tween's easing
}

export type MultiTweenAnimation<T extends string[]> = RatioTweenAnimation<T> | DurationTweenAnimation<T>;

// ── Sequences ──────────────────────────────────────────────

type PositionSymbol = '+' | '-' | '>+' | '>-';

/**
 * A number is absolute time.
 * `+n` / `-n` is relative to the previous entry's last referencable point: for an infinite repeat, the end of its first iteration.
 * `>+n` / `>-n` is relative to the previous entry's start.
 */
type Position<S extends string> = Milliseconds | `${PositionSymbol}${number}` | `${S}${PositionSymbol}${number}`;

interface Stagger {
    each: Milliseconds;
    from?: 'first' | 'last' | 'center' | number;
    easing?: Easing;
}

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

export declare class Sequence<S extends SequenceEntries = {}> {
    // entries: readonly (AnimationEntry | SequenceEntry)[];
    readonly entries: S;
    readonly repeat?: Repeat;
    static builder(): SequenceBuilder;
}

export interface SimpleAnimationEntry<S extends string = string> {
    animation: SimpleAnimation;
    at?: Position<S>;
    stagger?: Stagger;
}
export interface MultiTweenAnimationEntry<A extends MultiTweenAnimation<string[]> = MultiTweenAnimation<string[]>, S extends string = string> {
    animation: A;
    at?: Position<S>;
    stagger?: Stagger;
}
export interface SequenceEntry<NS extends Sequence = Sequence, S extends string = string> {
    sequence: NS;
    at?: Position<S>;
}

type SequenceEntries = {
    [name: string]: SimpleAnimationEntry | MultiTweenAnimationEntry | SequenceEntry;
};

export declare class SequenceBuilder<S extends SequenceEntries = {}> {
    entry<N extends string>(
        name: N,
        animation: SimpleAnimation,
        at?: SimpleAnimationEntry<keyof S & string>["at"],
        stagger?: Stagger
    ): SequenceBuilder<S & { [_ in N]: SimpleAnimationEntry<keyof S & string> }>;

    entry<N extends string, A extends MultiTweenAnimation<string[]>>(
        name: N,
        animation: A,
        at?: MultiTweenAnimationEntry<A, keyof S & string>["at"],
        stagger?: Stagger
    ): SequenceBuilder<S & { [_ in N]: MultiTweenAnimationEntry<A, keyof S & string> }>;

    entry<N extends string, SE extends Sequence>(
        name: N,
        sequence: SE,
        at?: SequenceEntry<SE, keyof S & string>["at"]
    ): SequenceBuilder<S & { [_ in N]: SequenceEntry<SE, keyof S & string>; }>;

    build(repeat?: Repeat): Sequence<{ [K in keyof S]: S[K] }>;
}