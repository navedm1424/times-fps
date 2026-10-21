import {saturate} from "./utils/numbers.js";
import {makePropertiesReadonly} from "./utils/objects.runtime.js";

export class Segment {
    readonly start: number;
    readonly end: number;
    readonly duration: number;

    constructor(start: number, end: number) {
        if (start > end)
            [start, end] = [end, start];
        this.start = saturate(start);
        this.end = saturate(end);
        this.duration = this.end - this.start;
        makePropertiesReadonly(this, "start", "end", "duration");
    }

    public static from(start: number) {
        return {
            to(end: number) {
                return new Segment(start, end);
            },
            ofDuration(duration: number) {
                return new Segment(start, start + duration);
            }
        };
    }
}