import {Sequence} from "../sequence.js";
import type {RepeatOptions, Seconds, SequenceEntries, SequenceEntry} from "../types.js";
import {checkNumber, parseAt} from "../utils.js";
import type {SimpleAnimation} from "../animation.js";
import {linear, type ResolvedEasing} from "./easing.js";
import {resolveTransition, type TransitionCurve} from "./transition-curve.js";
import {PropertyValues, type ValueStops} from "./stops.js";
import {AnimationKeyframesResolver, ResolvedAnimation} from "./resolved-animation.js";

export type SimpleAnimationMapping = {
    target: Element | Element[];
    values: {
        [propertyName: string]: ValueStops;
    };
};

/** One WAAPI effect's worth of the animation; effects play one after another. */
export interface ResolvedAnimationEffect {
    animation: ResolvedAnimation;
    easing: ResolvedEasing;
    delay: Seconds;
    duration: Seconds;
    iterations: number;
    direction: PlaybackDirection;
    fill: FillMode;
}

export class SimpleAnimationResolver {
    readonly targets: Element[];
    readonly targetDelays: Seconds[];
    readonly playDuration: Seconds;
    readonly totalDuration: Seconds;
    readonly curve: TransitionCurve;
    readonly propertyValues: PropertyValues;
    /** The animation's own first, then each enclosing sequence's, compounding on the ones before. */
    readonly repeatOptions: RepeatOptions[];

    constructor(animation: SimpleAnimation, mapping: SimpleAnimationMapping) {
        const {duration, curve} = resolveTransition(animation.transition);
        const {delay = 0} = animation.options;
        const targets = [mapping.target].flat();
        this.targets = targets;
        this.targetDelays = targets.map((_, index) => {
            if (typeof delay === 'number') return delay;
            return Math.max(0, checkNumber(delay(index, targets.length), `The staggered delay of target ${index}`));
        });
        this.playDuration = duration;
        this.totalDuration = this.repeatedDuration(duration, animation.options);
        this.curve = curve;
        // Validating the interpolation
        this.propertyValues = PropertyValues.of(mapping.values);
        this.repeatOptions = [animation.options];
    }

    private repeatedDuration(playDuration: Seconds, {repeatCount = 0, repeatDelay = 0}: RepeatOptions): Seconds {
        if (repeatCount === Infinity) return Infinity;
        return playDuration * (repeatCount + 1) + repeatDelay * repeatCount;
    }

    addRepeat(options: RepeatOptions) {
        this.repeatOptions.push(options);
    }

    resolve(): Map<Element, ResolvedAnimationEffect[]> {
        if (this.playDuration === 0) return new Map();

        const segments = this.resolveEffects();
        return new Map(this.targets.map((target, index) => [
            target,
            segments.map(segment => ({...segment, delay: segment.delay + this.targetDelays[index]!}))
        ]));
    }

    /**
     * The plays' segments one after another, with delays counted from the start of the plays.
     * The first holds its start values through the target's delay and the last keeps its end values.
     */
    private resolveEffects(): ResolvedAnimationEffect[] {
        const {playDuration, curve, propertyValues} = this;
        const {repeatCount = 0, repeatDelay = 0, repeatMode = 'loop'} = this.repeatOptions[0] ?? {};
        const hold = repeatDelay / playDuration;
        const playCount = repeatCount + 1;

        const noRepeat = repeatCount === 0;
        const nativeRepeat = repeatMode !== 'mirror' && hold === 0;

        const {singleEasing: wholeEasing} = curve;
        const original = wholeEasing && (noRepeat || nativeRepeat)
            ? ResolvedAnimation.ofStops(propertyValues)
            : AnimationKeyframesResolver.resolve(curve, propertyValues);

        if (noRepeat)
            return [this.createEffect({animation: original, easing: wholeEasing})];
        if (nativeRepeat)
            return [this.createEffect({animation: original, easing: wholeEasing, iterations: playCount, direction: repeatMode === 'reverse' ? 'alternate' : 'normal'})];

        if (repeatMode === 'loop') {
            const originalPlusHold = {animation: original.padEnd(hold), duration: playDuration * (1 + hold)};
            // [original+hold] × ∞
            if (!Number.isFinite(repeatCount))
                return [this.createEffect({...originalPlusHold, iterations: Infinity})];
            // [original+hold] × repeatCount, then original on its own
            return [
                this.createEffect({...originalPlusHold, iterations: repeatCount, fill: "backwards"}),
                this.createEffect({animation: original, delay: originalPlusHold.duration * repeatCount, fill: "forwards"})
            ];
        }

        const backward = repeatMode === 'mirror'
            ? AnimationKeyframesResolver.resolve(curve, propertyValues.flip())
            : original.reversed();
        const pair = {animation: ResolvedAnimation.merge([original, backward], hold), duration: 2 * playDuration * (1 + hold)};

        // [original+hold, backward+hold] × ∞
        if (!Number.isFinite(repeatCount))
            return [this.createEffect({...pair, iterations: Infinity})];

        // [original+hold, backward+hold] × repeatCount/2, then original on its own
        if (playCount % 2 === 1) {
            const iterations = repeatCount / 2;
            return [
                this.createEffect({...pair, iterations, fill: "backwards"}),
                this.createEffect({animation: original, delay: pair.duration * iterations, fill: "forwards"})
            ];
        }

        // [original+hold, backward] pair
        const lastPair = {animation: ResolvedAnimation.merge([original, backward], [hold]), duration: playDuration * (2 + hold)};
        // [original+hold, backward] once
        if (playCount === 2)
            return [this.createEffect(lastPair)];

        // [original+hold, backward+hold] × (playCount−2)/2, then [original+hold, backward] once
        const iterations = (playCount - 2) / 2;
        return [
            this.createEffect({...pair, iterations, fill: "backwards"}),
            this.createEffect({...lastPair, delay: pair.duration * iterations, fill: "forwards"}),
        ];
    }

    private createEffect(
        { animation, duration = this.playDuration, easing = linear, delay = 0, iterations = 1, direction = "normal", fill = "both"}:
        {
            animation: ResolvedAnimation,
            duration?: number,
            easing?: ResolvedEasing,
            delay?: number,
            iterations?: number,
            direction?: PlaybackDirection,
            fill?: FillMode
        }
    ): ResolvedAnimationEffect {
        return { animation, easing, duration, delay, iterations, direction, fill };
    }
}

class SequenceResolver {
    static of<SE extends SequenceEntries>(start: number, sequence: Sequence<SE>) {
        if (sequence.names.length === 0)
            throw new Error("Sequence must not be empty.");

        let lastResolver: SequenceEntryResolver | undefined;
        const resolversMap = new Map<keyof SE, SequenceEntryResolver>();
        const resolvers: SequenceEntryResolver[] = [];
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const parsedAt = parseAt(entry.at ?? "+0");

            let resolvedEntryStart: number;
            if (parsedAt.kind === 'absolute')
                resolvedEntryStart = checkNumber(parsedAt.time, `Entry "${String(name)}"'s position`);
            else {
                checkNumber(parsedAt.offset, `Entry "${String(name)}"'s position offset`);
                if (parsedAt.reference) {
                    if (!resolversMap.has(parsedAt.reference))
                        throw new Error(`Invalid reference at: ${parsedAt.reference}`);
                    resolvedEntryStart = resolversMap.get(parsedAt.reference)![parsedAt.anchor] + parsedAt.offset;
                } else
                    resolvedEntryStart = (lastResolver?.[parsedAt.anchor] ?? 0) + parsedAt.offset;
            }

            if (resolvedEntryStart < 0)
                resolvedEntryStart = 0;

            const resolvedEntry = SequenceEntryResolver.of(start + (sequence.options.delay ?? 0) + resolvedEntryStart, entry);
            resolversMap.set(name, lastResolver = resolvedEntry);
            resolvers.push(resolvedEntry);
        }

        const {referenceableEnd} = lastResolver!;
        const {repeatCount, repeatMode, repeatDelay} = sequence.options;
        if (repeatCount) {
            resolvers.forEach(entry => {
                if (entry === lastResolver) return;
                // entry.addRepeat({ repeatCount, repeatMode, repeatDelay:  });
            });
        }
        // return new SequenceResolver(start, referenceableEnd);
    }
}

declare class SequenceEntryResolver {
    readonly start: number;
    readonly referenceableEnd: number;
    readonly totalDuration: number;
    static of(resolvedStart: number, entry: SequenceEntry): SequenceEntryResolver;

    addRepeat(options: RepeatOptions): void;
}