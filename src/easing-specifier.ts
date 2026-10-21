import {CubicBezierEasing, type Easing, LinearEasing, StepsEasing} from "./easing.ts";

export type CubicBezierEasingParams = readonly [x1: number, y1: number, x2: number, y2: number];
export type StepPosition = 'jumpStart' | 'jumpEnd' | 'jumpNone' | 'jumpBoth';
export type StepsEasingParams = readonly [count: number, position?: StepPosition];
export type EasingSpecifier = EasingPreset | CubicBezierEasingParams | StepsEasingParams;

/** As in CSS `cubic-bezier()`. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): CubicBezierEasingParams {
    return [x1, y1, x2, y2];
}

/** As in CSS `steps()`, jumping at the end unless told otherwise. */
export function steps(count: number, position?: StepPosition): StepsEasingParams {
    return position ? [count, position] : [count];
}

export const linear = new LinearEasing();

const easingPresets = {
    linear,
    ease: CubicBezierEasing.of(0.25, 0.1, 0.25, 1),
    easeIn: CubicBezierEasing.of(0.42, 0, 1, 1),
    easeOut: CubicBezierEasing.of(0, 0, 0.58, 1),
    easeInOut: CubicBezierEasing.of(0.42, 0, 0.58, 1)
} as const satisfies {
    [preset: string]: Easing;
};
export type EasingPreset = keyof typeof easingPresets;

/** Throws unless the specifier is a preset, cubic Bézier params or steps params; `label` names the easing in messages. */
export function checkEasingSpecifier(easing: EasingSpecifier, label: string): void {
    if (typeof easing === 'string') {
        if (!Object.hasOwn(easingPresets, easing))
            throw new TypeError(`${label} is "${easing}", which isn't one of ${Object.keys(easingPresets).map(preset => `"${preset}"`).join(', ')}.`);
        return;
    }
    if (!Array.isArray(easing))
        throw new TypeError(`${label} must be a preset, cubic Bézier params or steps params.`);
    if (easing.length === 4) return CubicBezierEasing.check(easing as CubicBezierEasingParams, label);
    if (easing.length === 1 || easing.length === 2) return StepsEasing.check(easing as StepsEasingParams, label);
    throw new TypeError(`${label} must be a preset, cubic Bézier params or steps params.`);
}

export function resolveEasing(easing: EasingSpecifier): Easing {
    if (typeof easing === 'string') return easingPresets[easing];
    if (easing.length === 4) return new CubicBezierEasing(easing);
    return new StepsEasing(easing);
}
