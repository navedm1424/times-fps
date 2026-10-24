import type {AnimationDefinition} from "../animation.ts";
import {type EntrySpan, type PositionDescriptor, resolvePosition} from "../at.ts";
import {type Target} from "../dom/mapping.ts";
import type {Easing} from "../easing.ts";
import type {RepeatOptions, Stagger} from "../playback-options.ts";
import {type Definition, SequenceDefinition, type SequenceDefinitionEntry} from "../sequence.ts";
import {resolveTransition} from "../transition.ts";
import type {Seconds} from "../types.ts";
import {clamp} from "../utils/math.ts";

/** Times are local to the iteration of the sequence an entry is in, or start at 0 for the outermost definition. */
interface EntryPlan {
    /** Where it starts, before its delay; what `<` refers to. */
    position: Seconds;
    /** How long one play of an animation, or one iteration of a sequence, lasts, without delays or repeats; an animation with no targets takes no time. */
    playDuration: Seconds;
    /**
     * Its duration for positions, from its position to where `>` refers to: its delay, then its plays and their repeat delays, of which an infinite repeat counts its first play only.
     * What the sequence it's in delays it by isn't part of it.
     */
    anchorDuration: Seconds;
    /** Whether it, or anything in it, repeats forever. */
    infinite: boolean;
}

/** A target of an animation, with the animation's own delay for it, and what the sequence the animation is in delays it by as a copy; 0 for the outermost definition. */
export interface StaggeredTarget {
    target: Element;
    delay: Seconds;
    parentDelay: Seconds;
}

export interface AnimationPlan extends EntryPlan {
    type: 'animation';
    definition: AnimationDefinition;
    /** The easing one play runs. */
    easing: Easing;
    targets: readonly StaggeredTarget[];
}

/**
 * Every copy of a staggered sequence plays its entries where they'd be without the stagger, which only delays each copy further.
 * The stagger reaches its entries only: each target of an animation is a copy, and a subsequence is one copy as a whole.
 */
export interface SequencePlan extends EntryPlan {
    type: 'sequence';
    definition: SequenceDefinition;
    entries: ReadonlyMap<string, PlanNode>;
    /** What the sequence it's in delays it by as one copy: that sequence's delay, or its stagger where this one lines up; 0 for the outermost definition. */
    parentDelay: Seconds;
}

export type PlanNode = AnimationPlan | SequencePlan;

/** Where a copy sits on a staggered sequence's stagger: a position among the `largest` count of any of its entries, from its index among its entry's `count`. */
export type StaggerAlign = (index: number, count: number, largest: number) => number;

type TargetsResolver = (target: Target) => readonly Element[];

/** Resolves the definition's targets, and places every entry, and every target of each, in time. */
export function plan(definition: AnimationDefinition, resolveTargets: TargetsResolver): AnimationPlan;
export function plan(definition: SequenceDefinition, resolveTargets: TargetsResolver): SequencePlan;
export function plan(definition: Definition, resolveTargets: TargetsResolver): PlanNode;
export function plan(definition: Definition, resolveTargets: TargetsResolver): PlanNode {
    return definition instanceof SequenceDefinition
        ? SequencePlanner.of(definition, resolveTargets).plan()
        : AnimationPlanner.of(definition, resolveTargets).plan();
}

/** Plans an entry from its definition, which gives its duration, then its position among the entries before it, then what its sequence delays it by. */
abstract class EntryPlanner {
    protected entryPosition: Seconds = 0;
    protected copyDelay: Seconds | Stagger = 0;

    protected constructor(protected readonly anchorDuration: Seconds) {}

    /** How many copies a staggered sequence makes of it. */
    abstract readonly copyCount: number;

    /** Resolves its position among the entries before it, clamped to the start of the sequence. */
    position(descriptor: PositionDescriptor<string>, entrySpans: ReadonlyMap<string, EntrySpan>): this {
        this.entryPosition = Math.max(0, resolvePosition(descriptor, entrySpans, this.anchorDuration));
        return this;
    }

    /** What the sequence it's in delays its copies by: a number delays them all, and a stagger each from its index among `copyCount`. */
    parentDelay(delay: Seconds | Stagger): this {
        this.copyDelay = delay;
        return this;
    }

    get span(): EntrySpan {
        return {start: this.entryPosition, duration: this.anchorDuration};
    }

    abstract plan(): PlanNode;
}

class AnimationPlanner extends EntryPlanner {
    private constructor(
        private readonly definition: AnimationDefinition,
        private readonly targets: readonly Element[],
        /** Each target's own delay. */
        private readonly delays: readonly Seconds[],
        private readonly playDuration: Seconds,
        anchorDuration: Seconds,
        private readonly infinite: boolean,
        private readonly easing: Easing
    ) {
        super(anchorDuration);
    }

    static of(definition: AnimationDefinition, resolveTargets: TargetsResolver): AnimationPlanner {
        const targets = resolveTargets(definition.target);
        const count = targets.length;

        const {delay = 0, ...repeatOptions} = definition.timing.playback;
        const delays = targets.map((_, index) => typeof delay === 'function' ? delay(index, count) : delay);

        const {duration, easing} = resolveTransition(definition.timing.transition);
        const playDuration = count ? duration : 0;
        const anchorDuration = count ? Math.max(...delays) + anchoredPlaysDuration(playDuration, repeatOptions) : 0;
        const infinite = count > 0 && repeatOptions.repeat === Infinity;

        return new AnimationPlanner(definition, targets, delays, playDuration, anchorDuration, infinite, easing);
    }

    get copyCount(): number {
        return this.targets.length;
    }

    plan(): AnimationPlan {
        const {copyDelay} = this;
        const count = this.targets.length;
        return {
            type: 'animation',
            definition: this.definition,
            easing: this.easing,
            targets: this.targets.map((target, index): StaggeredTarget => ({
                target,
                delay: this.delays[index]!,
                parentDelay: typeof copyDelay === 'function' ? copyDelay(index, count) : copyDelay
            })),
            position: this.entryPosition,
            playDuration: this.playDuration,
            anchorDuration: this.anchorDuration,
            infinite: this.infinite
        };
    }
}

class SequencePlanner extends EntryPlanner {
    readonly copyCount = 1;

    private constructor(
        private readonly definition: SequenceDefinition,
        private readonly entries: ReadonlyMap<string, PlanNode>,
        private readonly playDuration: Seconds,
        anchorDuration: Seconds,
        private readonly infinite: boolean
    ) {
        super(anchorDuration);
    }

    /** Positions each entry once, among the entries before it, then delays the entries' copies by the sequence's delay, sampled where each copy lines up when it's a stagger. */
    static of(definition: SequenceDefinition, resolveTargets: TargetsResolver): SequencePlanner {
        const {delay = 0, ...repeatOptions} = definition.timing.playback;

        const planners = new Map<string, EntryPlanner>();
        const entrySpans = new Map<string, EntrySpan>();
        definition.timing.entries.forEach(({name, position}, index) => {
            const planner = entryPlannerOf(definition.entries[index]!, resolveTargets).position(position, entrySpans);
            planners.set(name, planner);
            entrySpans.set(name, planner.span);
        });

        const entryDelay = typeof delay === 'function' ? staggeredDelayOf(delay, [...planners.values()].map(planner => planner.copyCount)) : delay;
        const entries = new Map([...planners].map(([name, planner]) => [name, planner.parentDelay(entryDelay).plan()]));

        const playDuration = Math.max(0, ...[...entrySpans.values()].map(({start, duration}) => start + duration));
        const copyDelays = typeof delay === 'function' ? [...entries.values()].flatMap(copyDelaysOf) : [delay];
        const anchorDuration = Math.max(0, ...copyDelays) + anchoredPlaysDuration(playDuration, repeatOptions);
        const infinite = repeatOptions.repeat === Infinity || [...entries.values()].some(entry => entry.infinite);

        return new SequencePlanner(definition, entries, playDuration, anchorDuration, infinite);
    }

    plan(): SequencePlan {
        const {copyDelay} = this;
        return {
            type: 'sequence',
            definition: this.definition,
            entries: this.entries,
            parentDelay: typeof copyDelay === 'function' ? copyDelay(0, 1) : copyDelay,
            position: this.entryPosition,
            playDuration: this.playDuration,
            anchorDuration: this.anchorDuration,
            infinite: this.infinite
        };
    }
}

function entryPlannerOf(entry: SequenceDefinitionEntry, resolveTargets: TargetsResolver): EntryPlanner {
    return 'sequence' in entry ? SequencePlanner.of(entry.sequence, resolveTargets) : AnimationPlanner.of(entry.animation, resolveTargets);
}

/** The stagger sampled where each copy sits among the largest of the entries' copy counts, which may be between two copies. */
function staggeredDelayOf(stagger: Stagger, copyCounts: readonly number[]): Stagger {
    const largest = Math.max(...copyCounts);
    const staggerAlign = defaultStaggerAlignOf(stagger);
    return (index, count) => stagger(clamp(staggerAlign(index, count, largest), 0, largest - 1), largest);
}

/** Lines up the share of an entry's copies that the stagger's origin is at with the same share of the largest count; the first copies line up when it has none. */
function defaultStaggerAlignOf({from}: Stagger): StaggerAlign {
    const share = from === 'center' ? 0.5 : from === 'last' ? 1 : 0;
    return (index, count, largest) => index + share * (largest - count);
}

/** What its sequence delays each copy of the entry by: each target of an animation, or a subsequence as a whole. */
function copyDelaysOf(plan: PlanNode): Seconds[] {
    return plan.type === 'animation' ? plan.targets.map(target => target.parentDelay) : [plan.parentDelay];
}

/** The plays and their repeat delays; only the first play when it repeats forever. */
function anchoredPlaysDuration(playDuration: Seconds, {repeat = 0, repeatDelay = 0}: RepeatOptions): Seconds {
    if (repeat === Infinity) return playDuration;
    return playDuration * (repeat + 1) + repeatDelay * repeat;
}
