import type {SimpleAnimation} from "../animation.js";
import {Sequence} from "../sequence.js";
import type {At, RepeatOptions, Seconds, Stagger} from "../types.js";
import {checkNumber, type EntryReferences, parseAt} from "../utils.js";

/** An animation leaf's key in a sequence: the names of the entries leading to it, joined by `>`. */
export type EntryPath = string;

export function entryPathOf(parentPath: EntryPath | undefined, name: string): EntryPath {
    return parentPath ? `${parentPath}>${name}` : name;
}

/** Times are local to the iteration of the sequence an entry is in, or start at 0 for the outermost definition. */
interface EntryTimings {
    /** Its position plus its delay; the shortest of the staggered delays for an animation. */
    firstStart: Seconds;
    /** Undefined when it never ends. */
    end: Seconds | undefined;
    lastReferenceableEnd: Seconds;
    /** How long one play of an animation, or one iteration of a sequence, lasts. */
    playDuration: Seconds;
    /** The plays and their repeat delays, without the delay; infinite when it never ends. */
    totalDuration: Seconds;
}

export interface AnimationTimings extends EntryTimings {
    type: 'animation';
    animation: SimpleAnimation;
    delay: Seconds | Stagger;
    shortestDelay: Seconds;
}

export interface SequenceTimings extends EntryTimings {
    type: 'sequence';
    sequence: Sequence;
    delay: Seconds;
    entries: ReadonlyMap<string, AnimationTimings | SequenceTimings>;
}

export function resolveTimings(animation: SimpleAnimation, targetCount: number): AnimationTimings;
export function resolveTimings(sequence: Sequence, targetCounts: ReadonlyMap<EntryPath, number>): SequenceTimings;
export function resolveTimings(
    definition: SimpleAnimation | Sequence,
    targetCounts: number | ReadonlyMap<EntryPath, number>
): AnimationTimings | SequenceTimings {
    if (definition instanceof Sequence) {
        if (typeof targetCounts === 'number') throw new Error("A sequence needs the target counts of its animations.");
        return sequenceTimings(definition, 0, undefined, targetCounts);
    }
    if (typeof targetCounts !== 'number') throw new Error("An animation needs its target count.");
    return animationTimings(definition, 0, targetCounts);
}

/** Each target's delay; a staggered one that's negative becomes 0. */
export function staggeredDelays(delay: Seconds | Stagger, targetCount: number): Seconds[] {
    return Array.from({length: targetCount}, (_, index) => {
        if (typeof delay === 'number') return delay;
        return Math.max(0, checkNumber(delay(index, targetCount), `The staggered delay of target ${index}`));
    });
}

function animationTimings(animation: SimpleAnimation, position: Seconds, targetCount: number): AnimationTimings {
    const {delay = 0, ...repeatOptions} = animation.options;
    const delays = staggeredDelays(delay, targetCount);
    const shortestDelay = delays.length ? Math.min(...delays) : 0;
    const latestStart = position + (delays.length ? Math.max(...delays) : 0);
    const playDuration = animation.duration;
    const totalDuration = repeatedDuration(playDuration, repeatOptions);
    const ends = Number.isFinite(totalDuration);
    return {
        type: 'animation',
        animation,
        delay,
        shortestDelay,
        firstStart: position + shortestDelay,
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
    targetCounts: ReadonlyMap<EntryPath, number>
): SequenceTimings {
    if (sequence.names.length === 0)
        throw new Error("Sequence must not be empty.");

    const entries = new Map<string, AnimationTimings | SequenceTimings>();
    const references = new Map<string, EntryReferences>();
    let lastReferences: EntryReferences | undefined;
    for (const name of sequence.names) {
        const entry = sequence.entries[name]!;
        const entryPath = entryPathOf(path, name);
        const entryPosition = Math.max(0, positionOf(name, entry.at ?? '+0', lastReferences, references));

        let timings: AnimationTimings | SequenceTimings;
        if ('sequence' in entry)
            timings = sequenceTimings(entry.sequence, entryPosition, entryPath, targetCounts);
        else if (entry.animation.type === 'simple')
            timings = animationTimings(entry.animation, entryPosition, targetCountOf(entryPath, targetCounts));
        else
            throw new Error(`Entry "${entryPath}" is a timed tween animation, which isn't supported yet.`);

        entries.set(name, timings);
        references.set(name, lastReferences = {start: timings.firstStart, end: timings.lastReferenceableEnd});
    }

    const {delay = 0, ...repeatOptions} = sequence.options;
    const iterationStart = position + delay;
    const playDuration = Math.max(0, ...[...entries.values()].map(entry => entry.lastReferenceableEnd));
    const playsDuration = repeatedDuration(playDuration, repeatOptions);
    const ends = Number.isFinite(playsDuration) && [...entries.values()].every(entry => entry.end !== undefined);
    const totalDuration = ends ? playsDuration : Infinity;
    return {
        type: 'sequence',
        sequence,
        delay,
        entries,
        firstStart: iterationStart,
        end: ends ? iterationStart + totalDuration : undefined,
        lastReferenceableEnd: iterationStart + (Number.isFinite(playsDuration) ? playsDuration : playDuration),
        playDuration,
        totalDuration
    };
}

function positionOf(
    name: string,
    at: At<string>,
    lastReferences: EntryReferences | undefined,
    references: ReadonlyMap<string, EntryReferences>
): Seconds {
    const parsedAt = parseAt(at);
    if (parsedAt.kind === 'absolute')
        return checkNumber(parsedAt.time, `Entry "${name}"'s position`);

    checkNumber(parsedAt.offset, `Entry "${name}"'s position offset`);
    if (!parsedAt.reference)
        return (lastReferences?.[parsedAt.anchor] ?? 0) + parsedAt.offset;

    const reference = references.get(parsedAt.reference);
    if (!reference)
        throw new Error(`Invalid reference at: ${parsedAt.reference}`);
    return reference[parsedAt.anchor] + parsedAt.offset;
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
