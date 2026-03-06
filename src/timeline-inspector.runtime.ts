import type {Playhead} from "./frame-sampler.js";
import type {TimelineInspector} from "./timeline-inspector.types.js";
import {Segment} from "./segment.js";
import {Sequence} from "./sequence.js";
import {assignReadonlyProperties} from "./utils/objects.runtime.js";

/** @internal */
export function createTimelineInspector(playhead: Playhead): TimelineInspector {
    const instance = function TimelineInspector(subject) {
        if (!(subject instanceof Segment || (subject) instanceof Sequence))
            throw new Error("The argument must either be a segment or a sequence.");

        return {
            hasStarted(): boolean {
                return instance.playhead.time >= subject.start;
            },
            hasFinished(): boolean {
                return instance.playhead.time >= subject.end;
            },
            isActive(): boolean {
                return instance.playhead.time >= subject.start && instance.playhead.time < subject.end;
            }
        };
    } as TimelineInspector;
    assignReadonlyProperties(instance, { playhead });
    return Object.freeze(instance);
}