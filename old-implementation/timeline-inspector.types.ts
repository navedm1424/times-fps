import type {Sequence} from "./sequence.ts";
import type {Segment} from "./segment.ts";
import type {TimelineProgress} from "./frame-sampler.js";

export interface TimelineInspector {
    readonly progress: TimelineProgress;
    (segment: Segment): {
        hasStarted(): boolean;
        hasFinished(): boolean;
        isActive(): boolean;
    };
    (sequence: Sequence<string[]>): {
        hasStarted(): boolean;
        hasFinished(): boolean;
        isActive(): boolean;
    };
}