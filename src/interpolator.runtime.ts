import {invLerp, lerp, remap} from "./utils/numbers.js";
import {easeIn, easeInOut, easeOut, type EasingFunction} from "./easing.js";
import type {Playhead} from "./frame-sampler.js";
import type {Interpolator, SegmentMapper, SequenceMapper, ToAnchorsStep, ToRangeStep} from "./interpolator.types.ts";
import {Sequence} from "./sequence.js";
import {assignReadonlyProperties} from "./utils/objects.runtime.js";
import type {Segment} from "./segment.js";

class ToRangeStepImpl implements ToRangeStep {
    readonly #value: number;
    readonly #segment: Segment;
    readonly #easing: EasingFunction;

    constructor(value: number, segment: Segment, easing: EasingFunction) {
        this.#value = value;
        this.#segment = segment;
        this.#easing = easing;
    }

    to(start: number, end: number) {
        return lerp(
            start, end,
            this.#easing(invLerp(
                this.#segment.start, this.#segment.end,
                this.#value
            ))
        );
    }
}

class SegmentMapperImpl implements SegmentMapper {
    readonly #value: number;
    readonly #segment: Segment;

    constructor(value: number, segment: Segment) {
        this.#value = value;
        this.#segment = segment;
    }

    withEasing(easing: EasingFunction): ToRangeStep {
        return new ToRangeStepImpl(this.#value, this.#segment, easing);
    }
    to(start: number, end: number) {
        return remap(
            this.#value,
            this.#segment.start, this.#segment.end,
            start, end
        );
    }
}

class ToAnchorsStepImpl<S extends string[]> implements ToAnchorsStep<S> {
    constructor(
        readonly value: number,
        readonly sequence: Sequence<S>
    ) {}

    to(...anchors: Parameters<ToAnchorsStep<S>["to"]>): number {
        if (anchors.length !== this.sequence.length + 1)
            throw new Error(`The output anchors must be exactly ${this.sequence.length + 1} in number.`);

        if (this.value <= this.sequence.start)
            return anchors[0];
        if (this.value >= this.sequence.end)
            return anchors[anchors.length - 1];

        for (let i = 0; i < this.sequence.length; i++) {
            const segment = this.sequence[i]!;
            if (segment.start <= this.value && this.value < segment.end) {
                return remap(
                    this.value,
                    segment.start, segment.end,
                    anchors[i], anchors[i + 1]
                );
            }
        }

        return undefined as never;
    }
}

class SequenceMapperImpl<S extends string[]> extends ToAnchorsStepImpl<S> implements SequenceMapper<S> {
    withEasing(easing: EasingFunction): ToAnchorsStep<S> {
        return new ToAnchorsStepImpl(
            lerp(
                this.sequence.start, this.sequence.end,
                easing(invLerp(
                    this.sequence.start, this.sequence.end,
                    this.value
                ))
            ),
            this.sequence
        );
    }
}

const InterpolatorPrototype = {
    segment(segment): SegmentMapper {
        return new SegmentMapperImpl(this.playhead.time, segment);
    },
    easeIn(segment) {
        return this.segment(segment)
            .withEasing(easeIn);
    },
    easeOut(segment) {
        return this.segment(segment)
            .withEasing(easeOut);
    },
    easeInOut(segment) {
        return this.segment(segment)
            .withEasing(easeInOut);
    },
    sequence<S extends string[]>(sequence: Sequence<S>): SequenceMapper<S> {
        if (!((sequence) instanceof Sequence))
            throw new Error("Invalid sequence object! Please provide a valid sequence.");

        return new SequenceMapperImpl(this.playhead.time, sequence);
    }
} as Interpolator;

Object.assign(InterpolatorPrototype, {[Symbol.toStringTag]: "Interpolator"});
Object.setPrototypeOf(InterpolatorPrototype, Function.prototype);
Object.freeze(InterpolatorPrototype);

/** @internal */
export function createInterpolator(playhead: Playhead) {
    const map = function Interpolator(segment) {
        return map.segment(segment);
    } as Interpolator;
    assignReadonlyProperties(map, { playhead });
    Object.setPrototypeOf(map, InterpolatorPrototype);
    return Object.freeze(map);
}