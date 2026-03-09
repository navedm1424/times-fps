import type {Interpolator} from "./interpolator.types.js";
import type {TimelineInspector} from "./timeline-inspector.types.js";
import type {EasingFunction} from "./easing.js";
import {saturate} from "./utils/numbers.js";
import {createInterpolator} from "./interpolator.runtime.js";
import {createTimelineInspector} from "./timeline-inspector.runtime.js";

export type TimelineProgress = {
    /** normalized time 0 → 1 */
    get value(): number;
}

export type FrameValue =
    | number
    | string
    | FrameValue[]
    | { [key: string]: FrameValue };

export type FrameResolver<T extends FrameValue> = (progress: TimelineProgress) => T;

export type Frame<T extends FrameValue> = {
    readonly progress: number;
    readonly value: T;
}

export type FramesData<T extends FrameValue> = {
    readonly duration: number;
    readonly fps: number;
    readonly frames: ReadonlyArray<Frame<T>>
}

export type FrameSamplingOptions = {
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

    const frameCount = Math.floor(duration * fps);
    if (frameCount < 1)
        return;
    yield easing ? saturate(easing(0)) : 0;
    if (frameCount === 1)
        return;

    const step = 1 / (frameCount - 1);

    for (let i = 1; i < frameCount; i++) {
        const t = i * step;
        yield easing ? saturate(easing(t)) : t;
    }
}

abstract class AbstractFrameSampler<T extends FrameValue> implements FrameSampler<T> {
    abstract sampleAt(t: number): Frame<T>;

    *iterate(options: FrameSamplingOptions = {}): Generator<Frame<T>> {
        for (const t of stepper(options))
            yield this.sampleAt(t);
    }
    collect({ duration = 1, fps = 60, ...rest }: FrameSamplingOptions = {}): FramesData<T> {
        const frames = [...this.iterate({ duration, fps, ...rest })];

        return { duration, fps, frames };
    }
}

export function createFrameSampler<T extends FrameValue>(resolveFrame: FrameResolver<T>): FrameSampler<T> {
    let progressValue = 0;
    const progress = Object.freeze({
        get value() {
            return progressValue;
        }
    });
    class FrameSamplerImpl extends AbstractFrameSampler<T> {
        sampleAt(t: number): Frame<T> {
            return {
                progress: progressValue = saturate(t),
                value: resolveFrame(progress)
            };
        }
    }
    return new FrameSamplerImpl();
}

function getOrInsertComputed<V>(map: WeakMap<TimelineProgress, V>, key: TimelineProgress, callback: (k: TimelineProgress) => V): V {
    if (map.has(key))
        return map.get(key)!;

    const computed = callback(key);
    map.set(key, computed);
    return computed;
}

const interpolatorMap = new WeakMap<TimelineProgress, Interpolator>();

export function getInterpolator(progress: TimelineProgress): Interpolator {
    return getOrInsertComputed(interpolatorMap, progress, createInterpolator);
}

const timelineInspectorMap = new WeakMap<TimelineProgress, TimelineInspector>();

export function getTimelineInspector(progress: TimelineProgress): TimelineInspector {
    return getOrInsertComputed(timelineInspectorMap, progress, createTimelineInspector);
}