import type {AnimationDefinition} from "../animation.ts";
import {type EntrySpan, resolvePosition} from "../at.ts";
import {resolveTargets} from "../dom/mapping.ts";
import type {Easing} from "../easing.ts";
import type {RepeatOptions, Stagger} from "../playback-options.ts";
import {type Definition, SequenceDefinition} from "../sequence.ts";
import {resolveTransition} from "../transition.ts";
import type {Seconds} from "../types.ts";

/** Times are local to the iteration of the sequence an entry is in, or start at 0 for the outermost definition. */
interface EntryReach {
    /** Its position plus its earliest delay. */
    firstStart: Seconds;
    /** Undefined when it never ends. */
    end: Seconds | undefined;
    lastReferenceableEnd: Seconds;
}

interface EntryPlan extends EntryReach {
    position: Seconds;
    /** How long one play of an animation, or one iteration of a sequence, lasts; an animation with no elements takes no time. */
    playDuration: Seconds;
    /** The plays and their repeat delays, without the delay; infinite when it never ends. */
    totalDuration: Seconds;
}

/** An element of an animation, with the animation's own delay for it, and what the sequence the animation is in delays it by as a copy; 0 for the outermost definition. */
export interface PlannedTarget {
    element: Element;
    delay: Seconds;
    sequenceDelay: Seconds;
}

export interface AnimationPlan extends EntryPlan {
    type: 'animation';
    definition: AnimationDefinition;
    /** The easing one play runs. */
    easing: Easing;
    targets: readonly PlannedTarget[];
}

/**
 * Every copy of a staggered sequence plays its entries where they'd be without the stagger, which only delays each copy further.
 * The stagger reaches its entries only: each element of an animation is a copy, and a subsequence is one copy as a whole.
 */
export interface SequencePlan extends EntryPlan {
    type: 'sequence';
    definition: SequenceDefinition;
    entries: ReadonlyMap<string, PlanNode>;
    /** What the sequence it's in delays it by as one copy: that sequence's delay, or its stagger where this one lines up; 0 for the outermost definition. */
    sequenceDelay: Seconds;
}

export type PlanNode = AnimationPlan | SequencePlan;

/** Where a copy sits on a staggered sequence's stagger: a position among the `largest` count of any of its entries, from its index among its entry's `count`. */
export type StaggerAlign = (index: number, count: number, largest: number) => number;

/** What a sequence delays a copy of one of its entries by, from the copy's index among the entry's `count`; a subsequence is one copy. */
type SequenceDelay = (index: number, count: number) => Seconds;

/** Resolves the definition's targets in the scope, and places every entry, and every element of each, in time. */
export function planOf(definition: AnimationDefinition, scope: Element): AnimationPlan;
export function planOf(definition: SequenceDefinition, scope: Element): SequencePlan;
export function planOf(definition: Definition, scope: Element): PlanNode;
export function planOf(definition: Definition, scope: Element): PlanNode {
    return new Planner(scope).plan(definition, 0, () => 0);
}

class Planner {
    readonly #elementsByDefinition = new Map<AnimationDefinition, readonly Element[]>();

    constructor(private readonly scope: Element) {}

    plan(definition: Definition, position: Seconds, sequenceDelay: SequenceDelay): PlanNode {
        return definition instanceof SequenceDefinition
            ? this.sequencePlan(definition, position, sequenceDelay)
            : this.animationPlan(definition, position, sequenceDelay);
    }

    private animationPlan(definition: AnimationDefinition, position: Seconds, sequenceDelay: SequenceDelay): AnimationPlan {
        const elements = this.elementsOf(definition);
        const count = elements.length;
        const {delay = 0, ...repeatOptions} = definition.timing.playback;
        const targets = elements.map((element, index): PlannedTarget => ({
            element,
            delay: typeof delay === 'number' ? delay : delay(index, count),
            sequenceDelay: sequenceDelay(index, count)
        }));
        const {duration, easing} = resolveTransition(definition.timing.transition);
        const playDuration = count ? duration : 0;
        const totalDuration = count ? repeatedDuration(playDuration, repeatOptions) : 0;
        return {
            type: 'animation',
            definition,
            easing,
            targets,
            position,
            playDuration,
            totalDuration,
            ...reachOf(position, targets.map(target => target.delay), totalDuration, Number.isFinite(totalDuration) ? totalDuration : playDuration)
        };
    }

    private sequencePlan(definition: SequenceDefinition, position: Seconds, sequenceDelay: SequenceDelay): SequencePlan {
        const {delay = 0, ...repeatOptions} = definition.timing.playback;
        const entryDelay = typeof delay === 'number' ? () => delay : this.staggeredDelayOf(delay, definition);
        const entries = new Map<string, PlanNode>();
        const entrySpans = new Map<string, EntrySpan>();
        definition.timing.entries.forEach(({name, position: entryAt}, index) => {
            const entry = definition.entries[index]!;
            const planAt = (entryPosition: Seconds) =>
                this.plan('sequence' in entry ? entry.sequence : entry.animation, entryPosition, entryDelay);
            const selfDuration = entryAt.offset.selfFraction ? entrySpanOf(planAt(0)).duration : 0;
            const plan = planAt(Math.max(0, resolvePosition(entryAt, entrySpans, selfDuration)));
            entries.set(name, plan);
            entrySpans.set(name, entrySpanOf(plan));
        });

        const playDuration = Math.max(0, ...[...entries.values()].map(entry => entry.lastReferenceableEnd));
        const playsDuration = repeatedDuration(playDuration, repeatOptions);
        const ends = Number.isFinite(playsDuration) && [...entries.values()].every(entry => entry.end !== undefined);
        const totalDuration = ends ? playsDuration : Infinity;
        const ownDelays = typeof delay === 'number' ? [delay] : [...entries.values()].flatMap(copyDelaysOf);
        return {
            type: 'sequence',
            definition,
            entries,
            position,
            sequenceDelay: sequenceDelay(0, 1),
            playDuration,
            totalDuration,
            ...reachOf(position, ownDelays, totalDuration, Number.isFinite(playsDuration) ? playsDuration : playDuration)
        };
    }

    /** The stagger sampled where each copy sits among the largest count of any entry, which may be between two copies. */
    private staggeredDelayOf(stagger: Stagger, definition: SequenceDefinition): SequenceDelay {
        const largest = Math.max(...definition.entries.map(entry => 'sequence' in entry ? 1 : this.elementsOf(entry.animation).length));
        const staggerAlign = defaultStaggerAlignOf(stagger);
        return (index, count) => stagger(Math.min(Math.max(staggerAlign(index, count, largest), 0), largest - 1), largest);
    }

    /** Resolved once for each definition, however many times it's played. */
    private elementsOf(definition: AnimationDefinition): readonly Element[] {
        let elements = this.#elementsByDefinition.get(definition);
        if (!elements) this.#elementsByDefinition.set(definition, elements = resolveTargets(definition.target, this.scope));
        return elements;
    }
}

/** Lines up the share of an animation's elements that the stagger's origin is at with the same share of the largest count; the first elements line up when it has none. */
function defaultStaggerAlignOf({from}: Stagger): StaggerAlign {
    const share = from === 'center' ? 0.5 : from === 'last' ? 1 : 0;
    return (index, count, largest) => index + share * (largest - count);
}

/** What its sequence delays each copy of the entry by: each element of an animation, or a subsequence as a whole. */
function copyDelaysOf(plan: PlanNode): Seconds[] {
    return plan.type === 'animation' ? plan.targets.map(target => target.sequenceDelay) : [plan.sequenceDelay];
}

/** From the position plus the earliest delay, to the latest delay's end, of which `referenceableDuration` counts for positions. */
function reachOf(position: Seconds, delays: readonly Seconds[], totalDuration: Seconds, referenceableDuration: Seconds): EntryReach {
    const firstStart = position + (delays.length ? Math.min(...delays) : 0);
    const latestStart = position + (delays.length ? Math.max(...delays) : 0);
    return {
        firstStart,
        end: Number.isFinite(totalDuration) ? latestStart + totalDuration : undefined,
        lastReferenceableEnd: latestStart + referenceableDuration
    };
}

/** An entry's span for positions to refer to: from its first start to its last referenceable end. */
function entrySpanOf({firstStart, lastReferenceableEnd}: EntryReach): EntrySpan {
    return {start: firstStart, duration: lastReferenceableEnd - firstStart};
}

function repeatedDuration(playDuration: Seconds, {repeat = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeat === Infinity) return Infinity;
    return playDuration * (repeat + 1) + repeatDelay * repeat;
}
