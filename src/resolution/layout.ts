import type {AnimationTiming} from "../animation.ts";
import type {Easing} from "../easing.ts";
import {resolveTransition} from "../transition.ts";
import {type EntrySpan, resolvePosition} from "../at.ts";
import {SequenceTiming} from "../sequence.ts";
import type {Seconds} from "../types.ts";
import {checkNumber} from "../utils/validation.ts";
import type {RepeatOptions, Stagger} from "../playback-options.ts";

/** An animation leaf's key in a sequence: the names of the entries leading to it, joined by `>`. */
export type EntryPath = string;

export function entryPathOf(parentPath: EntryPath | undefined, name: string): EntryPath {
    return parentPath ? `${parentPath}>${name}` : name;
}

/**
 * One copy of a staggered sequence: the copy at `index` plays the element at that index of each of its animations.
 * Staggers inside it give that index its own delay, as they would one element.
 */
interface Lane {
    index: number;
    count: number;
}

/** Times are local to the iteration of the sequence an entry is in, or start at 0 for the outermost definition. */
interface EntryReach {
    /** Its position plus its delay; the earliest of them when it's staggered. */
    firstStart: Seconds;
    /** Undefined when it never ends. */
    end: Seconds | undefined;
    lastReferenceableEnd: Seconds;
}

interface EntryLayout extends EntryReach {
    /** How long one play of an animation, or one iteration of a sequence, lasts. */
    playDuration: Seconds;
    /** The plays and their repeat delays, without the delay; infinite when it never ends. */
    totalDuration: Seconds;
}

/** Where an element's plays start: its index among the animation's elements, and its position plus its delay. */
export interface ElementStart {
    index: number;
    start: Seconds;
}

export interface AnimationLayout extends EntryLayout {
    type: 'animation';
    timing: AnimationTiming;
    /** The easing one play runs. */
    easing: Easing;
    elements: readonly ElementStart[];
}

export interface SequenceLayout extends EntryLayout {
    type: 'sequence';
    sequence: SequenceTiming;
    delay: Seconds;
    entries: ReadonlyMap<string, LayoutNode>;
}

/** A staggered sequence, played once for each index of its animations' elements. */
export interface StaggeredSequenceLayout extends EntryReach {
    type: 'staggered-sequence';
    sequence: SequenceTiming;
    lanes: readonly SequenceLayout[];
}

export type LayoutNode = AnimationLayout | SequenceLayout | StaggeredSequenceLayout;

export function layoutOf(timing: AnimationTiming, elementCount: number): AnimationLayout;
export function layoutOf(sequence: SequenceTiming, elementCounts: ReadonlyMap<EntryPath, number>): SequenceLayout | StaggeredSequenceLayout;
export function layoutOf(
    timing: AnimationTiming | SequenceTiming,
    elementCounts: number | ReadonlyMap<EntryPath, number>
): LayoutNode {
    if (timing instanceof SequenceTiming) {
        if (typeof elementCounts === 'number') throw new TypeError("A sequence needs the element counts of its animations.");
        return sequenceLayout(timing, 0, undefined, elementCounts, undefined);
    }
    if (typeof elementCounts !== 'number') throw new TypeError("An animation needs its element count.");
    return animationLayout(timing, 0, undefined, elementCounts, undefined);
}

/** Each element's delay; a staggered one that's negative becomes 0. */
export function staggeredDelays(delay: Seconds | Stagger, elementCount: number): Seconds[] {
    return Array.from({length: elementCount}, (_, index) => {
        if (typeof delay === 'number') return delay;
        return Math.max(0, checkNumber(delay(index, elementCount), `The staggered delay of element ${index}`));
    });
}

function animationLayout(timing: AnimationTiming, position: Seconds, path: EntryPath | undefined, elementCount: number, lane: Lane | undefined): AnimationLayout {
    if (lane && elementCount !== lane.count)
        throw new Error(`Entry "${path}" has ${elementCount} elements, but the staggered sequence it's in plays ${lane.count}.`);

    const {delay = 0, ...repeatOptions} = timing.options;
    const delays = staggeredDelays(delay, elementCount);
    const elements = (lane ? [lane.index] : delays.map((_, index) => index)).map(index => ({index, start: position + delays[index]!}));
    const firstStart = elements.length ? Math.min(...elements.map(({start}) => start)) : position;
    const latestStart = elements.length ? Math.max(...elements.map(({start}) => start)) : position;
    const {duration: playDuration, easing} = resolveTransition(timing.transition);
    const totalDuration = repeatedDuration(playDuration, repeatOptions);
    const ends = Number.isFinite(totalDuration);
    return {
        type: 'animation',
        timing,
        easing,
        elements,
        firstStart,
        end: ends ? latestStart + totalDuration : undefined,
        lastReferenceableEnd: latestStart + (ends ? totalDuration : playDuration),
        playDuration,
        totalDuration
    };
}

function sequenceLayout(
    sequence: SequenceTiming,
    position: Seconds,
    path: EntryPath | undefined,
    elementCounts: ReadonlyMap<EntryPath, number>,
    lane: Lane | undefined
): SequenceLayout | StaggeredSequenceLayout {
    const {delay = 0, ...repeatOptions} = sequence.options;
    if (typeof delay !== 'number' && !lane)
        return staggeredSequenceLayout(sequence, position, path, elementCounts);

    const entries = new Map<string, LayoutNode>();
    const entrySpans = new Map<string, EntrySpan>();
    for (const name of sequence.names) {
        const entry = sequence.entries[name]!;
        const entryPath = entryPathOf(path, name);
        const layoutAt = (entryPosition: Seconds): LayoutNode => 'sequence' in entry
            ? sequenceLayout(entry.sequence, entryPosition, entryPath, elementCounts, lane)
            : animationLayout(entry.timing, entryPosition, entryPath, elementCountOf(entryPath, elementCounts), lane);
        const selfDuration = entry.position.offset.selfFraction ? entrySpanOf(layoutAt(0)).duration : 0;
        const entryPosition = Math.max(0, resolvePosition(entry.position, entrySpans, selfDuration));

        const layout = layoutAt(entryPosition);
        entries.set(name, layout);
        entrySpans.set(name, entrySpanOf(layout));
    }

    const ownDelay = typeof delay === 'number' ? delay : staggeredDelays(delay, lane!.count)[lane!.index]!;
    const iterationStart = position + ownDelay;
    const playDuration = Math.max(0, ...[...entries.values()].map(entry => entry.lastReferenceableEnd));
    const playsDuration = repeatedDuration(playDuration, repeatOptions);
    const ends = Number.isFinite(playsDuration) && [...entries.values()].every(entry => entry.end !== undefined);
    const totalDuration = ends ? playsDuration : Infinity;
    return {
        type: 'sequence',
        sequence,
        delay: ownDelay,
        entries,
        firstStart: iterationStart,
        end: ends ? iterationStart + totalDuration : undefined,
        lastReferenceableEnd: iterationStart + (Number.isFinite(playsDuration) ? playsDuration : playDuration),
        playDuration,
        totalDuration
    };
}

/** A copy for each index of the elements, which every animation inside must have as many of. */
function staggeredSequenceLayout(
    sequence: SequenceTiming,
    position: Seconds,
    path: EntryPath | undefined,
    elementCounts: ReadonlyMap<EntryPath, number>
): StaggeredSequenceLayout {
    const counts = new Set(leafPathsOf(sequence, path).map(leafPath => elementCountOf(leafPath, elementCounts)));
    if (counts.size !== 1)
        throw new Error(`The animations of the staggered sequence${path ? ` "${path}"` : ''} must have as many elements as each other, not ${[...counts].join(', ')}.`);

    const [count] = counts as Set<number>;
    const lanes = Array.from({length: count!}, (_, index) =>
        sequenceLayout(sequence, position, path, elementCounts, {index, count: count!}) as SequenceLayout
    );
    const ends = lanes.every(lane => lane.end !== undefined);
    return {
        type: 'staggered-sequence',
        sequence,
        lanes,
        firstStart: Math.min(...lanes.map(lane => lane.firstStart)),
        end: ends ? Math.max(...lanes.map(lane => lane.end!)) : undefined,
        lastReferenceableEnd: Math.max(...lanes.map(lane => lane.lastReferenceableEnd))
    };
}

function leafPathsOf(sequence: SequenceTiming, path: EntryPath | undefined): EntryPath[] {
    return sequence.names.flatMap(name => {
        const entry = sequence.entries[name]!;
        const entryPath = entryPathOf(path, name);
        return 'sequence' in entry ? leafPathsOf(entry.sequence, entryPath) : [entryPath];
    });
}

/** An entry's span for positions to refer to: from its first start to its last referenceable end. */
function entrySpanOf({firstStart, lastReferenceableEnd}: EntryReach): EntrySpan {
    return {start: firstStart, duration: lastReferenceableEnd - firstStart};
}

function elementCountOf(path: EntryPath, elementCounts: ReadonlyMap<EntryPath, number>): number {
    const elementCount = elementCounts.get(path);
    if (elementCount === undefined) throw new Error(`No element count for entry "${path}".`);
    return elementCount;
}

function repeatedDuration(playDuration: Seconds, {repeat = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeat === Infinity) return Infinity;
    return playDuration * (repeat + 1) + repeatDelay * repeat;
}
