import type {TimelineProgress} from "./frame-sampler.js";
import type {TimelineInspector} from "./timeline-inspector.types.js";
import {Segment} from "./segment.js";
import {Sequence} from "./sequence.js";
import {assignReadonlyProperties} from "./utils/objects.runtime.js";

/** @internal */
export function createTimelineInspector(progress: TimelineProgress): TimelineInspector {
    const instance = function TimelineInspector(subject) {
        if (!(subject instanceof Segment || (subject) instanceof Sequence))
            throw new Error("The argument must either be a segment or a sequence.");

        return {
            hasStarted(): boolean {
                return instance.progress.value >= subject.start;
            },
            hasFinished(): boolean {
                return instance.progress.value >= subject.end;
            },
            isActive(): boolean {
                return instance.progress.value >= subject.start && instance.progress.value < subject.end;
            }
        };
    } as TimelineInspector;
    assignReadonlyProperties(instance, { progress });
    return Object.freeze(instance);
}