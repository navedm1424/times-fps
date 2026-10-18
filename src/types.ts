import {SimpleAnimation, TimedTweenAnimation} from "./animation.js";
import type {Sequence} from "./sequence.js";

export type Seconds = number;
// export type Ratio = number;     // share of the animation's duration, 0–1
export type Progress = number;  // position on the 0→1 change axis

type AtOperator = '+' | '-' | '>+' | '>-';
/**
 * A number is absolute time.
 * `+n` / `-n` is relative to the previous entry's last referenceable point: for an infinite repeat, the end of its first iteration.
 * `>+n` / `>-n` is relative to the previous entry's start.
 */
export type At<N extends string> = Seconds | `${AtOperator}${number}` | `${N}${AtOperator}${number}`;

export type Stagger = (index: number, total: number) => Seconds;

export interface SimpleAnimationEntry<N extends string = string> {
    animation: SimpleAnimation;
    at?: At<N>;
}

export interface TimedTweenAnimationEntry<A extends TimedTweenAnimation<string[]> = TimedTweenAnimation<string[]>, N extends string = string> {
    animation: A;
    at?: At<N>;
}

export interface NestedSequenceEntry<NS extends Sequence = Sequence, N extends string = string> {
    sequence: NS;
    at?: At<N>;
}

export type SequenceEntry = SimpleAnimationEntry | TimedTweenAnimationEntry | NestedSequenceEntry;

export type SequenceEntries = {
    readonly [name: string]: SequenceEntry;
};

export type RepeatMode = 'loop' | 'reverse' | 'mirror';

export interface RepeatOptions {
    repeatCount?: number;      // repetitions after the first play
    repeatDelay?: Seconds;
    repeatMode?: RepeatMode;
}
