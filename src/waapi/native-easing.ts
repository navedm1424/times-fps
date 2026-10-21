import type {CubicBezierEasingDescriptor, StepPosition, StepsEasingDescriptor} from "../easing.ts";

/** A point of a CSS `linear()` easing; two at the same input make a jump. */
export interface LinearPoint {
    input: number;
    output: number;
}

/** An easing WAAPI takes as it is. */
export type NativeEasing =
    | { type: 'linear' }
    | { type: 'cubic-bezier'; definition: CubicBezierEasingDescriptor }
    | { type: 'steps'; definition: StepsEasingDescriptor }
    | { type: 'linear-points'; points: readonly LinearPoint[] };

const cssStepPositions: { [Position in StepPosition]: string } = {
    jumpStart: 'jump-start',
    jumpEnd: 'jump-end',
    jumpNone: 'jump-none',
    jumpBoth: 'jump-both'
};

export function cssEasingOf(easing: NativeEasing): string {
    switch (easing.type) {
        case 'linear':
            return 'linear';
        case 'cubic-bezier':
            return `cubic-bezier(${easing.definition.join(', ')})`;
        case 'steps': {
            const [count, position = 'jumpEnd'] = easing.definition;
            return `steps(${count}, ${cssStepPositions[position]})`;
        }
        case 'linear-points':
            return `linear(${easing.points.map(({input, output}) => `${output} ${input * 100}%`).join(', ')})`;
    }
}
