import {saturate} from "./utils/numbers.js";

export type EasingFunction = (t: number) => number;

const calcBezier = (t: number, a1: number, a2: number) =>
    (((1.0 - 3.0 * a2 + 3.0 * a1) * t + (3.0 * a2 - 6.0 * a1)) * t + 3.0 * a1) * t;
const subdivisionPrecision = 0.0000001;
const subdivisionMaxIterations = 12;

function binarySubdivide(x: number, lowerBound: number, upperBound: number, mX1: number, mX2: number) {
    let currentX;
    let currentT;
    let i = 0;
    do {
        currentT = lowerBound + (upperBound - lowerBound) / 2.0;
        currentX = calcBezier(currentT, mX1, mX2) - x;
        if (currentX > 0.0) {
            upperBound = currentT;
        } else {
            lowerBound = currentT;
        }
    } while (Math.abs(currentX) > subdivisionPrecision && ++i < subdivisionMaxIterations);
    return currentT;
}

export function cubicBezierEasing(mX1: number, mY1: number, mX2: number, mY2: number): EasingFunction {
    mX1 = saturate(mX1);
    mX2 = saturate(mX2);
    // If this is a linear gradient, return linear easing
    if (mX1 === mY1 && mX2 === mY2)
        return t => t;
    const getTForX = (aX: number) => binarySubdivide(aX, 0, 1, mX1, mX2);
    // If animation is at start/end, return t without easing
    const easing: EasingFunction = t => t === 0 || t === 1 ? t : calcBezier(getTForX(t), mY1, mY2);
    Object.defineProperty(easing, "name", { value: `cubic-bezier(${mX1}, ${mY1}, ${mX2}, ${mY2})` });
    return easing;
}

export const easeIn = cubicBezierEasing(0.42, 0, 1, 1);
export const easeOut = cubicBezierEasing(0, 0, 0.58, 1);
export const easeInOut = cubicBezierEasing(0.42, 0, 0.58, 1);