import type {Interpolator} from "./interpolator.types.js";
import type {TimelineInspector} from "./timeline-inspector.types.js";
import {createInterpolator} from "./interpolator.runtime.js";
import type {EasingFunction} from "./easing.js";
import {saturate} from "./utils/numbers.js";
import {createTimelineInspector} from "./timeline-inspector.runtime.js";

export interface Playhead {
    /** normalized time 0 → 1 */
    get time(): number;
}

export type FrameValue =
    | number
    | string
    | FrameValue[]
    | { [key: string]: FrameValue };

export type FrameValueResolver<T extends FrameValue> = (ti: TimelineInspector, map: Interpolator) => T;

export interface Frame<T extends FrameValue> {
    readonly time: number;
    readonly value: T;
}

export interface FramesData<T extends FrameValue> {
    readonly duration: number;
    readonly fps: number;
    readonly frames: ReadonlyArray<Frame<T>>
}

export interface FrameSamplingOptions {
    duration?: number;
    easing?: EasingFunction;
    fps?: number;
}

export interface FrameSampler<T extends FrameValue> {
    /**
     * sample frame at `t`
     * @param t normalized time 0 → 1
     * */
    sampleAt(t: number): Frame<T>;
    /** lazily generate frames, one by one */
    iterate(options?: FrameSamplingOptions): Generator<Frame<T>>;
    /** collect all frames eagerly */
    collect(options?: FrameSamplingOptions): FramesData<T>;
}

function* stepper({ duration = 1, fps = 60, easing }: FrameSamplingOptions = {}): Generator<number> {
    if (!Number.isFinite(duration) || duration <= 0)
        throw new Error("duration must be > 0 and finite.");
    if (!Number.isFinite(fps) || fps <= 0)
        throw new Error("fps must be > 0 and finite.");

    const noOfFrames = Math.floor(duration * fps);
    if (noOfFrames < 1)
        return;
    yield easing ? saturate(easing(0)) : 0;
    if (noOfFrames === 1)
        return;

    const step = 1 / (noOfFrames - 1);
    let progress = step;

    do {
        yield easing ? saturate(easing(progress)) : progress;
        progress += step;
    } while (progress <= 1);
}

class FrameSamplerImpl<T extends FrameValue> implements FrameSampler<T> {
    readonly #resolveFrame: FrameValueResolver<T>;
    #time: number;
    readonly #timelineInspector: TimelineInspector;
    readonly #interpolator: Interpolator;

    constructor(func: FrameValueResolver<T>) {
        this.#resolveFrame = func;
        this.#time = 0;
        const thisInstance = this;
        const playhead: Playhead = { get time() { return thisInstance.#time; } };
        this.#timelineInspector = createTimelineInspector(playhead);
        this.#interpolator = createInterpolator(playhead);
    }

    sampleAt(time: number): Frame<T> {
        return {
            time: this.#time = saturate(time),
            value: this.#resolveFrame(this.#timelineInspector, this.#interpolator)
        }
    }

    *iterate(options: FrameSamplingOptions = {}): Generator<Frame<T>> {
        for (const t of stepper(options))
            yield this.sampleAt(t);
    }
    collect({ duration = 1, fps = 60, ...rest }: FrameSamplingOptions = {}): FramesData<T> {
        const frames = [...this.iterate({ duration, fps, ...rest })];

        return { duration, fps, frames };
    }
}

export function createFrameSampler<T extends FrameValue>(func: FrameValueResolver<T>): FrameSampler<T> {
    return new FrameSamplerImpl(func);
}