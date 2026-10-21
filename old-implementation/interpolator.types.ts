import type {EasingFunction} from "./easing.ts";
import type {Sequence} from "./sequence.ts";
import type {Segment} from "./segment.ts";
import type {TimelineProgress} from "./frame-sampler.js";

export interface ToRangeStep {
    to(start: number, end: number): number;
}

export interface SegmentMapper extends ToRangeStep {
    withEasing(easing: EasingFunction): ToRangeStep;
}

type MapToType<IL extends readonly any[], OT> = IL extends [any, ...infer Tail] ?
    [OT, ...MapToType<Tail, OT>] : [];

export interface ToAnchorsStep<S extends string[]> {
    to(...anchors: [number, ...MapToType<S, number>]): number;
}

export interface SequenceMapper<S extends string[]> extends ToAnchorsStep<S> {
    withEasing(easing: EasingFunction): ToAnchorsStep<S>;
}

export interface Interpolator {
    readonly progress: TimelineProgress;
    (segment: Segment): SegmentMapper;
    segment(segment: Segment): SegmentMapper;
    easeIn(segment: Segment): ToRangeStep;
    easeOut(segment: Segment): ToRangeStep;
    easeInOut(segment: Segment): ToRangeStep;
    sequence<S extends string[]>(sequence: Sequence<S>): SequenceMapper<S>;
}