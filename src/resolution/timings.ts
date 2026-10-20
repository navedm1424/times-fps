import type {AnimationTiming} from "../animation.js";
import type {AtAnchor, ParsedAt} from "../at.js";
import {SequenceTiming} from "../sequence.js";
import type {RepeatOptions, Seconds, Stagger} from "../types.js";
import {checkNumber} from "../utils/validation.js";

/** An animation leaf's key in a sequence: the names of the entries leading to it, joined by `>`. */
export type EntryPath = string;

export function entryPathOf(parentPath: EntryPath | undefined, name: string): EntryPath {
    return parentPath ? `${parentPath}>${name}` : name;
}

/** Sequence-local times an entry's `at` can refer to: its first start and its last referenceable end. */
type EntryReferences = { [Anchor in AtAnchor]: Seconds };

/**
 * One copy of a staggered sequence: the copy at `index` plays the target at that index of each of its animations.
 * Staggers inside it give that index its own delay, as they would one target.
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

interface EntryTimings extends EntryReach {
    /** How long one play of an animation, or one iteration of a sequence, lasts. */
    playDuration: Seconds;
    /** The plays and their repeat delays, without the delay; infinite when it never ends. */
    totalDuration: Seconds;
}

/** Where a target's plays start: its index among the animation's targets, and its position plus its delay. */
export interface TargetStart {
    index: number;
    start: Seconds;
}

export interface AnimationTimings extends EntryTimings {
    type: 'animation';
    timing: AnimationTiming;
    targets: readonly TargetStart[];
}

export interface SequenceTimings extends EntryTimings {
    type: 'sequence';
    sequence: SequenceTiming;
    delay: Seconds;
    entries: ReadonlyMap<string, NodeTimings>;
}

/** A staggered sequence, played once for each index of its animations' targets. */
export interface StaggeredSequenceTimings extends EntryReach {
    type: 'staggered-sequence';
    sequence: SequenceTiming;
    lanes: readonly SequenceTimings[];
}

export type NodeTimings = AnimationTimings | SequenceTimings | StaggeredSequenceTimings;

export function computeTimings(timing: AnimationTiming, targetCount: number): AnimationTimings;
export function computeTimings(sequence: SequenceTiming, targetCounts: ReadonlyMap<EntryPath, number>): SequenceTimings | StaggeredSequenceTimings;
export function computeTimings(
    timing: AnimationTiming | SequenceTiming,
    targetCounts: number | ReadonlyMap<EntryPath, number>
): NodeTimings {
    if (timing instanceof SequenceTiming) {
        if (typeof targetCounts === 'number') throw new Error("A sequence needs the target counts of its animations.");
        return sequenceTimings(timing, 0, undefined, targetCounts, undefined);
    }
    if (typeof targetCounts !== 'number') throw new Error("An animation needs its target count.");
    return animationTimings(timing, 0, undefined, targetCounts, undefined);
}

/** Each target's delay; a staggered one that's negative becomes 0. */
export function staggeredDelays(delay: Seconds | Stagger, targetCount: number): Seconds[] {
    return Array.from({length: targetCount}, (_, index) => {
        if (typeof delay === 'number') return delay;
        return Math.max(0, checkNumber(delay(index, targetCount), `The staggered delay of target ${index}`));
    });
}

function animationTimings(timing: AnimationTiming, position: Seconds, path: EntryPath | undefined, targetCount: number, lane: Lane | undefined): AnimationTimings {
    if (lane && targetCount !== lane.count)
        throw new Error(`Entry "${path}" has ${targetCount} targets, but the staggered sequence it's in plays ${lane.count}.`);

    const {delay = 0, ...repeatOptions} = timing.options;
    const delays = staggeredDelays(delay, targetCount);
    const targets = (lane ? [lane.index] : delays.map((_, index) => index)).map(index => ({index, start: position + delays[index]!}));
    const firstStart = targets.length ? Math.min(...targets.map(({start}) => start)) : position;
    const latestStart = targets.length ? Math.max(...targets.map(({start}) => start)) : position;
    const playDuration = timing.duration;
    const totalDuration = repeatedDuration(playDuration, repeatOptions);
    const ends = Number.isFinite(totalDuration);
    return {
        type: 'animation',
        timing,
        targets,
        firstStart,
        end: ends ? latestStart + totalDuration : undefined,
        lastReferenceableEnd: latestStart + (ends ? totalDuration : playDuration),
        playDuration,
        totalDuration
    };
}

function sequenceTimings(
    sequence: SequenceTiming,
    position: Seconds,
    path: EntryPath | undefined,
    targetCounts: ReadonlyMap<EntryPath, number>,
    lane: Lane | undefined
): SequenceTimings | StaggeredSequenceTimings {
    const {delay = 0, ...repeatOptions} = sequence.options;
    if (typeof delay !== 'number' && !lane)
        return staggeredSequenceTimings(sequence, position, path, targetCounts);

    const entries = new Map<string, NodeTimings>();
    const references = new Map<string, EntryReferences>();
    let previousReferences: EntryReferences = {start: 0, end: 0};
    for (const name of sequence.names) {
        const entry = sequence.entries[name]!;
        const entryPath = entryPathOf(path, name);
        const timingsAt = (entryPosition: Seconds): NodeTimings => 'sequence' in entry
            ? sequenceTimings(entry.sequence, entryPosition, entryPath, targetCounts, lane)
            : animationTimings(entry.timing, entryPosition, entryPath, targetCountOf(entryPath, targetCounts), lane);
        const insertedSpan = () => spanOf(referencesOf(timingsAt(0)));
        const entryPosition = Math.max(0, positionOf(entry.at, previousReferences, references, insertedSpan));

        const timings = timingsAt(entryPosition);
        entries.set(name, timings);
        references.set(name, previousReferences = referencesOf(timings));
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

/** A copy for each index of the targets, which every animation inside must have as many of. */
function staggeredSequenceTimings(
    sequence: SequenceTiming,
    position: Seconds,
    path: EntryPath | undefined,
    targetCounts: ReadonlyMap<EntryPath, number>
): StaggeredSequenceTimings {
    const counts = new Set(leafPathsOf(sequence, path).map(leafPath => targetCountOf(leafPath, targetCounts)));
    if (counts.size !== 1)
        throw new Error(`The animations of the staggered sequence${path ? ` "${path}"` : ''} must have as many targets as each other, not ${[...counts].join(', ')}.`);

    const [count] = counts as Set<number>;
    const lanes = Array.from({length: count!}, (_, index) =>
        sequenceTimings(sequence, position, path, targetCounts, {index, count: count!}) as SequenceTimings
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

function referencesOf({firstStart, lastReferenceableEnd}: EntryReach): EntryReferences {
    return {start: firstStart, end: lastReferenceableEnd};
}

function spanOf({start, end}: EntryReferences): Seconds {
    return end - start;
}

/** Everything before the entry, from the earliest first start to the latest last referenceable end, or the start of the sequence with nothing before it. */
function everythingSoFarOf(references: ReadonlyMap<string, EntryReferences>): EntryReferences {
    const earlier = [...references.values()];
    if (earlier.length === 0) return {start: 0, end: 0};
    return {start: Math.min(...earlier.map(({start}) => start)), end: Math.max(...earlier.map(({end}) => end))};
}

/** `insertedSpan` gives the span of the entry being placed, which doesn't depend on its position. */
function positionOf(
    parsedAt: ParsedAt<string>,
    previousReferences: EntryReferences,
    references: ReadonlyMap<string, EntryReferences>,
    insertedSpan: () => Seconds
): Seconds {
    if (parsedAt.kind === 'absolute')
        return parsedAt.time;
    const {reference: referenceKind, anchor, offset, offsetUnit} = parsedAt;
    const reference = referenceKind.kind === 'entry' ? references.get(referenceKind.name)!
        : referenceKind.kind === 'everything-so-far' ? everythingSoFarOf(references)
        : previousReferences;
    const offsetTime = offsetUnit === 'seconds' ? offset
        : offsetUnit === 'referenced-span' ? offset * spanOf(reference)
        : offset * insertedSpan();
    return reference[anchor] + offsetTime;
}

function targetCountOf(path: EntryPath, targetCounts: ReadonlyMap<EntryPath, number>): number {
    const targetCount = targetCounts.get(path);
    if (targetCount === undefined) throw new Error(`No target count for entry "${path}".`);
    return targetCount;
}

function repeatedDuration(playDuration: Seconds, {repeat = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeat === Infinity) return Infinity;
    return playDuration * (repeat + 1) + repeatDelay * repeat;
}
