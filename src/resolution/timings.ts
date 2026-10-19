import type {SimpleAnimation} from "../animation.js";
import type {AtAnchor, ParsedAt} from "../at.js";
import {Sequence} from "../sequence.js";
import type {RepeatOptions, Seconds, Stagger} from "../types.js";
import {checkNumber} from "../utils/validation.js";

/** An animation leaf's key in a sequence: the names of the entries leading to it, joined by `>`. */
export type EntryPath = string;

export function entryPathOf(parentPath: EntryPath | undefined, name: string): EntryPath {
    return parentPath ? `${parentPath}>${name}` : name;
}

/** Sequence-local times an entry's `at` can refer to. */
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
    animation: SimpleAnimation;
    targets: readonly TargetStart[];
}

export interface SequenceTimings extends EntryTimings {
    type: 'sequence';
    sequence: Sequence;
    delay: Seconds;
    entries: ReadonlyMap<string, NodeTimings>;
}

/** A staggered sequence, played once for each index of its animations' targets. */
export interface StaggeredSequenceTimings extends EntryReach {
    type: 'staggered-sequence';
    sequence: Sequence;
    lanes: readonly SequenceTimings[];
}

export type NodeTimings = AnimationTimings | SequenceTimings | StaggeredSequenceTimings;

export function computeTimings(animation: SimpleAnimation, targetCount: number): AnimationTimings;
export function computeTimings(sequence: Sequence, targetCounts: ReadonlyMap<EntryPath, number>): SequenceTimings | StaggeredSequenceTimings;
export function computeTimings(
    definition: SimpleAnimation | Sequence,
    targetCounts: number | ReadonlyMap<EntryPath, number>
): NodeTimings {
    if (definition instanceof Sequence) {
        if (typeof targetCounts === 'number') throw new Error("A sequence needs the target counts of its animations.");
        return sequenceTimings(definition, 0, undefined, targetCounts, undefined);
    }
    if (typeof targetCounts !== 'number') throw new Error("An animation needs its target count.");
    return animationTimings(definition, 0, undefined, targetCounts, undefined);
}

/** Each target's delay; a staggered one that's negative becomes 0. */
export function staggeredDelays(delay: Seconds | Stagger, targetCount: number): Seconds[] {
    return Array.from({length: targetCount}, (_, index) => {
        if (typeof delay === 'number') return delay;
        return Math.max(0, checkNumber(delay(index, targetCount), `The staggered delay of target ${index}`));
    });
}

function animationTimings(animation: SimpleAnimation, position: Seconds, path: EntryPath | undefined, targetCount: number, lane: Lane | undefined): AnimationTimings {
    if (lane && targetCount !== lane.count)
        throw new Error(`Entry "${path}" has ${targetCount} targets, but the staggered sequence it's in plays ${lane.count}.`);

    const {delay = 0, ...repeatOptions} = animation.options;
    const delays = staggeredDelays(delay, targetCount);
    const targets = (lane ? [lane.index] : delays.map((_, index) => index)).map(index => ({index, start: position + delays[index]!}));
    const firstStart = targets.length ? Math.min(...targets.map(({start}) => start)) : position;
    const latestStart = targets.length ? Math.max(...targets.map(({start}) => start)) : position;
    const playDuration = animation.duration;
    const totalDuration = repeatedDuration(playDuration, repeatOptions);
    const ends = Number.isFinite(totalDuration);
    return {
        type: 'animation',
        animation,
        targets,
        firstStart,
        end: ends ? latestStart + totalDuration : undefined,
        lastReferenceableEnd: latestStart + (ends ? totalDuration : playDuration),
        playDuration,
        totalDuration
    };
}

function sequenceTimings(
    sequence: Sequence,
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
    let lastReferences: EntryReferences | undefined;
    for (const name of sequence.names) {
        const entry = sequence.entries[name]!;
        const entryPath = entryPathOf(path, name);
        const entryPosition = Math.max(0, positionOf(entry.at, lastReferences, references));

        let timings: NodeTimings;
        if ('sequence' in entry)
            timings = sequenceTimings(entry.sequence, entryPosition, entryPath, targetCounts, lane);
        else
            timings = animationTimings(entry.animation, entryPosition, entryPath, targetCountOf(entryPath, targetCounts), lane);

        entries.set(name, timings);
        references.set(name, lastReferences = {start: timings.firstStart, end: timings.lastReferenceableEnd});
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
    sequence: Sequence,
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

function leafPathsOf(sequence: Sequence, path: EntryPath | undefined): EntryPath[] {
    return sequence.names.flatMap(name => {
        const entry = sequence.entries[name]!;
        const entryPath = entryPathOf(path, name);
        return 'sequence' in entry ? leafPathsOf(entry.sequence, entryPath) : [entryPath];
    });
}

function positionOf(
    parsedAt: ParsedAt<string>,
    lastReferences: EntryReferences | undefined,
    references: ReadonlyMap<string, EntryReferences>
): Seconds {
    if (parsedAt.kind === 'absolute')
        return parsedAt.time;
    const reference = parsedAt.reference ? references.get(parsedAt.reference) : lastReferences;
    return (reference?.[parsedAt.anchor] ?? 0) + parsedAt.offset;
}

function targetCountOf(path: EntryPath, targetCounts: ReadonlyMap<EntryPath, number>): number {
    const targetCount = targetCounts.get(path);
    if (targetCount === undefined) throw new Error(`No target count for entry "${path}".`);
    return targetCount;
}

function repeatedDuration(playDuration: Seconds, {repeatCount = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeatCount === Infinity) return Infinity;
    return playDuration * (repeatCount + 1) + repeatDelay * repeatCount;
}
