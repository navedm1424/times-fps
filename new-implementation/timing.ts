import type {MultiTweenAnimation, RatioTween, SimpleAnimation, TimedTween} from "./animation.js";
import type {PhysicalSpringTransition, Transition} from "./transition.js";
import type {Sequence} from "./sequence.js";
import type {At, Ratio, RepeatOptions, Seconds, SequenceEntries, Stagger} from "./types.js";

interface RepeatedTiming {
    iterationDuration: Seconds;
    duration: Seconds;                  // includes the delay; Infinity when repeating forever
    lastReferenceablePoint: Seconds;    // includes the delay
}

export interface AnimationTiming extends RepeatedTiming {
    targetDelays: Seconds[];
}

export interface SequenceTiming extends RepeatedTiming {
    delay: Seconds;
    entries: { [name: string]: SequenceEntryTiming };
}

/** `offset` is the entry's referenceable start within its sequence. */
export type SequenceEntryTiming =
    | { offset: Seconds; animation: AnimationTiming }
    | { offset: Seconds; sequence: SequenceTiming };

/** Mirrors the sequence's mapping: an animation entry's target count, or a nested sequence's counts. */
export type TargetCounts = { [name: string]: number | TargetCounts };

export interface TweenSpan {
    start: Seconds;
    end: Seconds;
}

export interface RatioTweenSpan {
    start: Ratio;
    end: Ratio;
}

declare function physicalSpringDuration(spring: PhysicalSpringTransition): Seconds;

export function transitionDuration(transition: Transition): Seconds {
    return 'duration' in transition ? transition.duration : physicalSpringDuration(transition);
}

export function animationTiming(animation: SimpleAnimation | MultiTweenAnimation<string[]>, targetCount: number): AnimationTiming {
    const iterationDuration = animation.type === 'tween-timed'
        ? timedTweenSpans(animation.tweens).at(-1)?.end ?? 0
        : transitionDuration(animation.transition);
    const delays = targetDelays(targetCount, animation.options.delay);
    return {targetDelays: delays, ...repeatedTiming(Math.max(0, ...delays), iterationDuration, animation.options)};
}

export function sequenceTiming(sequence: Sequence<SequenceEntries>, targetCounts: TargetCounts): SequenceTiming {
    const entries: { [name: string]: SequenceEntryTiming } = {};
    let previous: SequenceEntryTiming | undefined;
    for (const [name, entry] of Object.entries(sequence.entries)) {
        const position = resolvePosition(entry.at ?? '+0', previous, entries);
        const offset = previous ? position : Math.max(position, 0);
        const targets = targetCounts[name];

        if ('animation' in entry) {
            if (typeof targets !== 'number') throw new Error(`Entry "${name}" needs a target count.`);
            previous = entries[name] = {offset, animation: animationTiming(entry.animation, targets)};
        } else {
            if (typeof targets !== 'object') throw new Error(`Entry "${name}" needs its nested sequence's target counts.`);
            previous = entries[name] = {offset, sequence: sequenceTiming(entry.sequence, targets)};
        }
    }

    const iterationDuration = Math.max(0, ...Object.values(entries).map(entryLastReferenceablePoint));
    const delay = sequence.options.delay ?? 0;
    return {delay, entries, ...repeatedTiming(delay, iterationDuration, sequence.options)};
}

export function timedTweenSpans(tweens: readonly TimedTween[]): TweenSpan[] {
    let previousEnd = 0;
    return tweens.map(tween => {
        const start = previousEnd + (tween.delay ?? 0);
        const end = start + repeatedDuration(transitionDuration(tween.transition), tween);
        previousEnd = end;
        return {start, end};
    });
}

export function ratioTweenSpans(tweens: readonly RatioTween[]): RatioTweenSpan[] {
    const givenRatioTotal = tweens.reduce((total, tween) => total + (tween.ratio ?? 0), 0);
    const unratioedTweenCount = tweens.filter(tween => tween.ratio === undefined).length;
    const normalizingDivisor = Math.max(givenRatioTotal, 1);
    const sharedRatio = unratioedTweenCount ? Math.max(1 - givenRatioTotal, 0) / unratioedTweenCount : 0;

    let previousEnd = 0;
    return tweens.map(tween => {
        const start = previousEnd;
        const end = start + (tween.ratio ?? sharedRatio) / normalizingDivisor;
        previousEnd = end;
        return {start, end};
    });
}

function resolvePosition(
    at: At<string>,
    previous: SequenceEntryTiming | undefined,
    entries: { [name: string]: SequenceEntryTiming }
): Seconds {
    if (typeof at === 'number') return at;

    const {referenceName, fromStart, distance} = parsePosition(at, entries);
    const reference = referenceName ? entries[referenceName] : previous;
    if (!reference) return distance;
    return (fromStart ? reference.offset : entryLastReferenceablePoint(reference)) + distance;
}

/** Splits at the first operator that leaves an earlier entry's name before it and a number after it. */
function parsePosition(
    at: string,
    entries: { [name: string]: SequenceEntryTiming }
): { referenceName: string; fromStart: boolean; distance: Seconds } {
    for (let index = 0; index < at.length; index++) {
        const referenceName = at.slice(0, index);
        if (referenceName && !Object.hasOwn(entries, referenceName)) continue;

        const operation = /^(>?)([+-])(.+)$/.exec(at.slice(index));
        const amount = Number(operation?.[3]);
        if (!operation || Number.isNaN(amount)) continue;

        return {referenceName, fromStart: operation[1] === '>', distance: operation[2] === '-' ? -amount : amount};
    }
    throw new Error(`Can't resolve the position "${at}".`);
}

function entryLastReferenceablePoint(entry: SequenceEntryTiming): Seconds {
    return entry.offset + ('sequence' in entry ? entry.sequence : entry.animation).lastReferenceablePoint;
}

function targetDelays(targetCount: number, delay: Seconds | Stagger = 0): Seconds[] {
    return Array.from({length: targetCount}, (_, index) => typeof delay === 'number' ? delay : delay(index, targetCount));
}

function repeatedTiming(delay: Seconds, iterationDuration: Seconds, options: RepeatOptions): RepeatedTiming {
    const playsDuration = repeatedDuration(iterationDuration, options);
    return {
        iterationDuration,
        duration: delay + playsDuration,
        lastReferenceablePoint: delay + (Number.isFinite(playsDuration) ? playsDuration : iterationDuration)
    };
}

function repeatedDuration(playDuration: Seconds, {repeatCount = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeatCount === Infinity) return Infinity;
    return playDuration * (repeatCount + 1) + repeatDelay * repeatCount;
}
