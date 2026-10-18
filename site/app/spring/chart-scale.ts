import type {SplinePoint} from "./spring-fit";

export interface ChartBox {
    width: number;
    height: number;
}

export const chartMargin = {left: 52, right: 12, top: 12, bottom: 28};

export interface Scale {
    x(time: number): number;
    y(value: number): number;
    time(x: number): number;
}

export function scaleFor({width, height}: ChartBox, duration: number, lowest: number, highest: number): Scale {
    const plotWidth = width - chartMargin.left - chartMargin.right;
    const plotHeight = height - chartMargin.top - chartMargin.bottom;
    return {
        x: time => chartMargin.left + plotWidth * time / duration,
        y: value => chartMargin.top + plotHeight * (highest - value) / (highest - lowest),
        time: x => duration * (x - chartMargin.left) / plotWidth
    };
}

export function polylinePoints(times: readonly number[], values: readonly number[], scale: Scale): string {
    return times.map((time, index) => `${scale.x(time).toFixed(2)},${scale.y(values[index]!).toFixed(2)}`).join(" ");
}

/** The spline itself: each segment's cubic Bézier easing, its control points laid over the segment's span. */
export function splinePath(points: readonly SplinePoint[], scale: Scale): string {
    const [first, ...rest] = points;
    const commands = [`M${scale.x(first!.time)},${scale.y(first!.progress)}`];
    rest.forEach((to, index) => {
        const from = points[index]!;
        const [x1, y1, x2, y2] = to.easing?.definition ?? [1 / 3, 1 / 3, 2 / 3, 2 / 3];
        const pointAt = (x: number, y: number) =>
            `${scale.x(from.time + (to.time - from.time) * x)},${scale.y(from.progress + (to.progress - from.progress) * y)}`;
        commands.push(`C${pointAt(x1, y1)} ${pointAt(x2, y2)} ${pointAt(1, 1)}`);
    });
    return commands.join(" ");
}

export function ticksBetween(lowest: number, highest: number, count: number): number[] {
    const step = niceStep((highest - lowest) / count);
    const first = Math.ceil(lowest / step) * step;
    return Array.from({length: Math.floor((highest - first) / step) + 1}, (_, index) => first + index * step);
}

/** The 1, 2 or 5 times a power of ten that's closest above the rough step. */
export function niceStep(roughStep: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const factor = [1, 2, 5, 10].find(candidate => candidate * magnitude >= roughStep)!;
    return factor * magnitude;
}
