import {PRECISION} from "timesfps/internals";
import type {SpringFit} from "./spring-fit";

export function FitStats({fit}: { fit: SpringFit }) {
    const stats: [name: string, value: string][] = [
        ["duration", `${fit.duration.toFixed(4)} s`],
        ["ω₀", fit.naturalFrequency.toFixed(3)],
        ["ζ", fit.dampingRatio.toFixed(4)],
        ["spline segments", String(fit.splinePoints.length - 1)],
        ["keyframes", String(fit.keyframeCount)],
        ["largest |spline − spring|", fit.largestSplineError.toExponential(2)],
        ["largest |keyframes − spring|", fit.largestKeyframeError.toExponential(2)],
        ["PRECISION", String(PRECISION)]
    ];

    return (
        <dl className="grid gap-2.5 text-sm">
            {stats.map(([name, value]) => (
                <div key={name} className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
