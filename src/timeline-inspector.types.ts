import type {Sequence} from "./sequence.ts";
import type {Segment} from "./segment.ts";
import type {Playhead} from "./frame-sampler.js";

export interface TimelineInspector {
    readonly playhead: Playhead;
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