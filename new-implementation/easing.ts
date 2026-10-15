export type CubicBezierDefinition = readonly [x1: number, y1: number, x2: number, y2: number];
export type StepPosition = 'jumpStart' | 'jumpEnd' | 'jumpNone' | 'jumpBoth';
export type StepsDefinition = readonly [count: number, position?: StepPosition];
export type Easing = 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'easeInOut' | CubicBezierDefinition | StepsDefinition;
