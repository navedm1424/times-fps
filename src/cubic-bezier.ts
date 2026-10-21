import {lerp, solveMonotone} from "./utils/math.ts";

export interface Point {
    x: number;
    y: number;
}

export type Axis = keyof Point;

/** A cubic Bézier curve, traced by the parameter `t` from 0 at its start to 1 at its end. */
export class CubicBezier {
    constructor(
        readonly start: Point,
        readonly control1: Point,
        readonly control2: Point,
        readonly end: Point
    ) {}

    coordinateAt(axis: Axis, t: number): number {
        const [p0, p1, p2, p3] = this.coordinates(axis);
        const u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    /** How fast the coordinate changes with `t`. */
    derivativeAt(axis: Axis, t: number): number {
        const [p0, p1, p2, p3] = this.coordinates(axis);
        const u = 1 - t;
        return 3 * (u * u * (p1 - p0) + 2 * u * t * (p2 - p1) + t * t * (p3 - p2));
    }

    /** Every `t` at which the coordinate reaches the value, in order, searching each stretch between turning parameters. */
    parametersAt(axis: Axis, value: number): number[] {
        const boundaries = [0, ...this.turningParameters(axis), 1];
        return boundaries.slice(1).flatMap((high, index) => {
            const low = boundaries[index]!;
            const lowCoordinate = this.coordinateAt(axis, low);
            const highCoordinate = this.coordinateAt(axis, high);
            const reachedAtLow = index > 0 && value === lowCoordinate;
            const reached = Math.min(lowCoordinate, highCoordinate) <= value && value <= Math.max(lowCoordinate, highCoordinate);
            return reached && !reachedAtLow ? [this.parameterAt(axis, value, low, high)] : [];
        });
    }

    /** The `t` between `low` and `high` at which the coordinate reaches the value; the coordinate must only rise or only fall there. */
    parameterAt(axis: Axis, value: number, low = 0, high = 1): number {
        return solveMonotone(t => this.coordinateAt(axis, t), t => this.derivativeAt(axis, t), value, low, high);
    }

    /** The `t`s inside the curve at which the coordinate changes direction, in order: where its derivative, a quadratic, crosses 0. */
    turningParameters(axis: Axis): number[] {
        const [p0, p1, p2, p3] = this.coordinates(axis);
        const [d0, d1, d2] = [p1 - p0, p2 - p1, p3 - p2];
        const a = d0 - 2 * d1 + d2;
        const b = 2 * (d1 - d0);
        const c = d0;
        const discriminant = b * b - 4 * a * c;
        if (discriminant <= 0) return [];

        // The numerically stable form, which also covers a linear derivative (a = 0) without cancelling digits.
        const q = -(b + Math.sign(b || 1) * Math.sqrt(discriminant)) / 2;
        return [q / a, c / q].filter(t => t > 0 && t < 1).sort((first, second) => first - second);
    }

    /** The `t` at which the coordinate's derivative is slowest or fastest, where its second derivative, a line, crosses 0. */
    inflectionParameter(axis: Axis): number | undefined {
        const [p0, p1, p2, p3] = this.coordinates(axis);
        const startCurvature = p2 - 2 * p1 + p0;
        const endCurvature = p3 - 2 * p2 + p1;
        if (startCurvature === endCurvature) return undefined;
        return startCurvature / (startCurvature - endCurvature);
    }

    /** The curves on either side of `t`, by de Casteljau's algorithm. */
    splitAt(t: number): [before: CubicBezier, after: CubicBezier] {
        const startToControl1 = lerpPoint(this.start, this.control1, t);
        const control1ToControl2 = lerpPoint(this.control1, this.control2, t);
        const control2ToEnd = lerpPoint(this.control2, this.end, t);
        const beforeControl2 = lerpPoint(startToControl1, control1ToControl2, t);
        const afterControl1 = lerpPoint(control1ToControl2, control2ToEnd, t);
        const splitPoint = lerpPoint(beforeControl2, afterControl1, t);
        return [
            new CubicBezier(this.start, startToControl1, beforeControl2, splitPoint),
            new CubicBezier(splitPoint, afterControl1, control2ToEnd, this.end)
        ];
    }

    private coordinates(axis: Axis): [number, number, number, number] {
        return [this.start[axis], this.control1[axis], this.control2[axis], this.end[axis]];
    }
}

function lerpPoint(from: Point, to: Point, amount: number): Point {
    return {x: lerp(from.x, to.x, amount), y: lerp(from.y, to.y, amount)};
}
