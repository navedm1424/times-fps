export type CubicBezierDefinition = readonly [x1: number, y1: number, x2: number, y2: number];
export type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | CubicBezierDefinition;
