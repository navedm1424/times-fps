import {Sequence} from "./sequence.js";
import {Segment} from "./segment.js";
import {makePropertiesReadonly} from "./utils/objects.runtime.js";

export class Timeline<S extends [string, ...string[]]> {
    readonly phases: {
        readonly [K in S[number]]: Segment;
    };
    readonly sequence: Sequence<S>;

    private constructor(...ratios: { [K in keyof S]: [name: S[K], duration: number] }) {
        this.sequence = Sequence.fromRatios<S>(...ratios).scaleToRange(0, 1);
        this.phases = this.sequence.segments;
        makePropertiesReadonly(this, "phases", "sequence");
    }

    public static ofPhases<const S extends [string, ...string[]]>(...ratios: { [K in keyof S]: [name: S[K], duration: number] }) {
        return new Timeline<S>(...ratios);
    }
}