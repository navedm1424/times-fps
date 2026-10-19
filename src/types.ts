export type Seconds = number;
// export type Ratio = number;     // share of the animation's duration, 0–1
export type Progress = number;  // position on the 0→1 change axis

export type Stagger = (index: number, total: number) => Seconds;

export type RepeatMode = 'loop' | 'reverse' | 'mirror';

export interface RepeatOptions {
    repeatCount?: number;      // repetitions after the first play
    repeatDelay?: Seconds;
    repeatMode?: RepeatMode;
}
