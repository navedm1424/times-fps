import type {CubicBezierDefinition, Easing, StepPosition, StepsDefinition} from "../easing.js";
import type {Progress} from "../types.js";
import {invLerp} from "../utils.js";
import {CubicBezier, type Point} from "./cubic-bezier.js";

/** A piece of a split easing, rescaled to 0–1, ending at `offset` where the whole easing outputs `progress`. */
export interface EasingPiece {
    offset: number;
    progress: Progress;
    easing: ResolvedEasing;
}

export interface ResolvedEasing {
    /** The normalized offsets at which the progress changes direction, in order. */
    turningOffsets(): number[];
    /** Every normalized offset at which the easing outputs the progress, in order. */
    inverseAt(progress: Progress): number[];
    /** Splits at each of the ascending normalized offsets, the last being 1. A piece may be split further to stay a valid easing. */
    splitAt(normalizedOffsets: readonly number[]): EasingPiece[];
    /** Runs backwards in time. */
    reversed(): ResolvedEasing;
}

/** Sample value until the inverse is implemented. */
function inverseSteps(definition: StepsDefinition, progress: Progress): number[] {
    return [progress];
}

/** Sample value until the windowed split is implemented. */
function splitStepsAt(definition: StepsDefinition, normalizedOffsets: readonly number[]): EasingPiece[] {
    return normalizedOffsets.map(offset => ({offset, progress: offset, easing: new StepsEasing(definition)}));
}

const timeTolerance = 1e-9;

export class LinearEasing implements ResolvedEasing {
    turningOffsets(): number[] {
        return [];
    }

    inverseAt(progress: Progress): number[] {
        return [progress];
    }

    splitAt(normalizedOffsets: readonly number[]): EasingPiece[] {
        return normalizedOffsets.map(offset => ({offset, progress: offset, easing: this}));
    }

    reversed(): LinearEasing {
        return this;
    }
}

/** A CSS `cubic-bezier()`: a curve from (0, 0) to (1, 1) whose time, x, never turns back. */
export class CubicBezierEasing implements ResolvedEasing {
    readonly curve: CubicBezier;

    constructor(readonly definition: CubicBezierDefinition) {
        const [x1, y1, x2, y2] = definition;
        if (!CubicBezierEasing.isWithinTime(x1, 0) || !CubicBezierEasing.isWithinTime(x2, 0))
            throw new RangeError(`A cubic Bézier easing's x control points must be within 0–1, not ${x1} and ${x2}.`);
        this.curve = new CubicBezier({x: 0, y: 0}, {x: x1, y: y1}, {x: x2, y: y2}, {x: 1, y: 1});
    }

    static of(x1: number, y1: number, x2: number, y2: number): CubicBezierEasing {
        return new CubicBezierEasing([x1, y1, x2, y2]);
    }

    private static isWithinTime(x: number, tolerance: number): boolean {
        return x >= -tolerance && x <= 1 + tolerance;
    }

    /** The control points of the curve stretched to run from (0, 0) to (1, 1). */
    private static normalizedDefinition(curve: CubicBezier): CubicBezierDefinition {
        const {start, end} = curve;
        const normalize = ({x, y}: Point) => [invLerp(x, start.x, end.x), invLerp(y, start.y, end.y)] as const;
        return [...normalize(curve.control1), ...normalize(curve.control2)];
    }

    /**
     * The curve as one piece, or as two when stretching it would push its handles outside the 0–1 time range.
     * That only happens to a piece that contains the point where time moves slowest, and splitting there always fixes it.
     */
    private static piecesOf(curve: CubicBezier): EasingPiece[] {
        const [x1, , x2] = CubicBezierEasing.normalizedDefinition(curve);
        const inflection = curve.inflectionParameter('x');
        const fitsInTime = CubicBezierEasing.isWithinTime(x1, timeTolerance) && CubicBezierEasing.isWithinTime(x2, timeTolerance);
        if (fitsInTime || inflection === undefined || inflection <= 0 || inflection >= 1)
            return [CubicBezierEasing.pieceOf(curve)];
        return curve.splitAt(inflection).map(piece => CubicBezierEasing.pieceOf(piece));
    }

    private static pieceOf(curve: CubicBezier): EasingPiece {
        const [x1, y1, x2, y2] = CubicBezierEasing.normalizedDefinition(curve);
        const clampToTime = (x: number) => Math.min(Math.max(x, 0), 1);
        return {
            offset: curve.end.x,
            progress: curve.end.y,
            easing: CubicBezierEasing.of(clampToTime(x1), y1, clampToTime(x2), y2)
        };
    }

    turningOffsets(): number[] {
        return this.curve.turningParameters('y').map(t => this.curve.coordinateAt('x', t));
    }

    inverseAt(progress: Progress): number[] {
        return this.curve.parametersAt('y', progress).map(t => this.curve.coordinateAt('x', t));
    }

    splitAt(normalizedOffsets: readonly number[]): EasingPiece[] {
        let remainingCurve = this.curve;
        let previousT = 0;
        return normalizedOffsets.flatMap(offset => {
            const t = this.curve.parameterAt('x', offset);
            const [piece, rest] = remainingCurve.splitAt(invLerp(t, previousT, 1));
            remainingCurve = rest;
            previousT = t;
            return CubicBezierEasing.piecesOf(piece);
        });
    }

    reversed(): CubicBezierEasing {
        const [x1, y1, x2, y2] = this.definition;
        return CubicBezierEasing.of(1 - x2, 1 - y2, 1 - x1, 1 - y1);
    }
}

export class StepsEasing implements ResolvedEasing {
    constructor(readonly definition: StepsDefinition) {}

    turningOffsets(): number[] {
        return [];
    }

    inverseAt(progress: Progress): number[] {
        return inverseSteps(this.definition, progress);
    }

    splitAt(normalizedOffsets: readonly number[]): EasingPiece[] {
        return splitStepsAt(this.definition, normalizedOffsets);
    }

    reversed(): StepsEasing {
        const [count, position = 'jumpEnd'] = this.definition;
        return new StepsEasing([count, reversedStepPositions[position]]);
    }
}

const reversedStepPositions: { [Position in StepPosition]: StepPosition } = {
    jumpStart: 'jumpEnd',
    jumpEnd: 'jumpStart',
    jumpNone: 'jumpNone',
    jumpBoth: 'jumpBoth'
};

export const linear = new LinearEasing();

const presetEasings: { [Preset in Extract<Easing, string>]: ResolvedEasing } = {
    linear,
    ease: CubicBezierEasing.of(0.25, 0.1, 0.25, 1),
    easeIn: CubicBezierEasing.of(0.42, 0, 1, 1),
    easeOut: CubicBezierEasing.of(0, 0, 0.58, 1),
    easeInOut: CubicBezierEasing.of(0.42, 0, 0.58, 1)
};

export function resolveEasing(easing: Easing): ResolvedEasing {
    if (typeof easing === 'string') return presetEasings[easing];
    if (easing.length === 4) return CubicBezierEasing.of(...easing);
    return new StepsEasing(easing);
}
