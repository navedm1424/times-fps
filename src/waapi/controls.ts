import type {Seconds} from "../types.js";

/** Plays, pauses and seeks the native animations of one definition together. */
export class AnimationControls {
    constructor(readonly animations: readonly Animation[]) {}

    play(): void {
        for (const animation of this.animations) animation.play();
    }

    pause(): void {
        for (const animation of this.animations) animation.pause();
    }

    cancel(): void {
        for (const animation of this.animations) animation.cancel();
    }

    /** Jumps to the end; like WAAPI's, it throws while an animation repeats forever. */
    finish(): void {
        for (const animation of this.animations) animation.finish();
    }

    /** Moves to `time` from the start of the definition. */
    seek(time: Seconds): void {
        for (const animation of this.animations) animation.currentTime = time * 1000;
    }

    get playbackRate(): number {
        return this.animations[0]?.playbackRate ?? 1;
    }

    set playbackRate(playbackRate: number) {
        for (const animation of this.animations) animation.playbackRate = playbackRate;
    }

    /** The time on the timeline at which the definition starts, or null until it's resolved. */
    get startTime(): Seconds | null {
        const startTime = this.animations[0]?.startTime;
        return typeof startTime === 'number' ? startTime / 1000 : null;
    }

    set startTime(startTime: Seconds | null) {
        for (const animation of this.animations) animation.startTime = startTime === null ? null : startTime * 1000;
    }

    /** Settles once every animation has finished, so never while one repeats forever. */
    get finished(): Promise<void> {
        return Promise.all(this.animations.map(animation => animation.finished)).then(() => undefined);
    }

    /** Calls the listener each time every animation has finished; gives back a function that stops it. */
    onFinish(listener: () => void): () => void {
        return this.onEveryAnimation('finish', listener);
    }

    /** Calls the listener each time every animation has been canceled; gives back a function that stops it. */
    onCancel(listener: () => void): () => void {
        return this.onEveryAnimation('cancel', listener);
    }

    private onEveryAnimation(type: 'finish' | 'cancel', listener: () => void): () => void {
        const dispatched = new Set<Animation>();
        const removers = this.animations.map(animation => {
            const handle = () => {
                dispatched.add(animation);
                if (dispatched.size < this.animations.length) return;
                dispatched.clear();
                listener();
            };
            animation.addEventListener(type, handle);
            return () => animation.removeEventListener(type, handle);
        });
        return () => removers.forEach(remove => remove());
    }
}
