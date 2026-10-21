"use client";

import {type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState} from "react";
import {ChipTray} from "@/components/tray/chip-tray";
import {PRECISION} from "timesfps/internals";
import {type ChartBox, chartMargin, niceStep, polylinePoints, type Scale, scaleFor, splinePath, ticksBetween} from "./chart-scale";
import type {SpringFit} from "./spring-fit";

type Layer = "spring" | "spline" | "splinePoints";

const layerLabels: { [Name in Layer]: string } = {
    spring: "Spring",
    spline: "Spline",
    splinePoints: "Spline points"
};

const layers = Object.keys(layerLabels) as Layer[];

export function FitCharts({fit}: { fit: SpringFit }) {
    const [visibleLayers, setVisibleLayers] = useState<{ [Name in Layer]: boolean }>({spring: true, spline: true, splinePoints: true});
    const [hoveredIndex, setHoveredIndex] = useState<number>();

    return (
        <div className="grid gap-6">
            <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Progress</h3>
                    <ChipTray
                        label="Layers shown"
                        options={layers.map(layer => ({value: layer, label: layerLabels[layer], icon: <LayerKey layer={layer}/>}))}
                        value={layers.filter(layer => visibleLayers[layer])}
                        onValueChange={shown => setVisibleLayers(Object.fromEntries(layers.map(layer => [layer, shown.includes(layer)])) as { [Name in Layer]: boolean })}
                    />
                </div>
                <CurvesChart fit={fit} visibleLayers={visibleLayers} hoveredIndex={hoveredIndex} onHover={setHoveredIndex}/>
            </div>

            <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Error</h3>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                            <span className="h-0.5 w-3 rounded-full bg-(--series-spline)"/>
                            spline − spring
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-0.5 w-3 rounded-full bg-(--series-keyframes)"/>
                            keyframes − spring
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-2.5 w-4 rounded-sm bg-(--precision-band)"/>
                            ± {PRECISION} precision
                        </span>
                    </span>
                </div>
                <ErrorChart fit={fit} hoveredIndex={hoveredIndex} onHover={setHoveredIndex}/>
            </div>
        </div>
    );
}

function LayerKey({layer}: { layer: Layer }) {
    if (layer === "splinePoints") return <span className="size-1.5 rounded-full bg-foreground"/>;
    return <span className={`h-0.5 w-3 rounded-full ${layer === "spring" ? "bg-(--series-spring)" : "bg-(--series-spline)"}`}/>;
}

interface HoverProps {
    hoveredIndex: number | undefined;
    onHover(index: number | undefined): void;
}

function CurvesChart({fit, visibleLayers, hoveredIndex, onHover}: { fit: SpringFit; visibleLayers: { [Name in Layer]: boolean } } & HoverProps) {
    const {times, springProgresses, splineProgresses, splinePoints} = fit;
    const all = [...springProgresses, ...splineProgresses, 0, 1];
    const padding = (Math.max(...all) - Math.min(...all)) * 0.06;
    const lowest = Math.min(...all) - padding;
    const highest = Math.max(...all) + padding;

    return (
        <ChartFrame
            height={280}
            fit={fit}
            lowest={lowest}
            highest={highest}
            valueTicks={ticksBetween(lowest, highest, 5)}
            formatValue={value => String(+value.toFixed(3))}
            hoveredIndex={hoveredIndex}
            onHover={onHover}
            tooltip={index => (
                <>
                    <TooltipRow label="Spring" value={springProgresses[index]!.toFixed(4)} keyClassName="bg-(--series-spring)"/>
                    <TooltipRow label="Spline" value={splineProgresses[index]!.toFixed(4)} keyClassName="bg-(--series-spline)"/>
                </>
            )}
        >
            {scale => (
                <>
                    {visibleLayers.spring && (
                        <polyline points={polylinePoints(times, springProgresses, scale)} fill="none"
                                  stroke="var(--series-spring)" strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round"/>
                    )}
                    {visibleLayers.spline && (
                        <path d={splinePath(splinePoints, scale)} fill="none" stroke="var(--series-spline)" strokeWidth={1.5}/>
                    )}
                    {visibleLayers.splinePoints && splinePoints.map(({time, progress}) => (
                        <circle key={time} cx={scale.x(time)} cy={scale.y(progress)} r={2}
                                fill="var(--foreground)" stroke="var(--card)" strokeWidth={1}/>
                    ))}
                    {hoveredIndex !== undefined && (
                        <>
                            {visibleLayers.spring && <HoverDot scale={scale} time={times[hoveredIndex]!} value={springProgresses[hoveredIndex]!} color="var(--series-spring)"/>}
                            {visibleLayers.spline && <HoverDot scale={scale} time={times[hoveredIndex]!} value={splineProgresses[hoveredIndex]!} color="var(--series-spline)"/>}
                        </>
                    )}
                </>
            )}
        </ChartFrame>
    );
}

function ErrorChart({fit, hoveredIndex, onHover}: { fit: SpringFit } & HoverProps) {
    const {times, splineErrors, keyframeErrors} = fit;
    const reach = Math.max(PRECISION * 1.5, ...splineErrors.map(Math.abs), ...keyframeErrors.map(Math.abs)) * 1.1;

    return (
        <ChartFrame
            height={150}
            fit={fit}
            lowest={-reach}
            highest={reach}
            valueTicks={ticksBetween(-reach, reach, 4)}
            formatValue={value => value === 0 ? "0" : value.toExponential(0)}
            hoveredIndex={hoveredIndex}
            onHover={onHover}
            tooltip={index => (
                <>
                    <TooltipRow label="Spline" value={splineErrors[index]!.toExponential(2)} keyClassName="bg-(--series-spline)"/>
                    <TooltipRow label="Keyframes" value={keyframeErrors[index]!.toExponential(2)} keyClassName="bg-(--series-keyframes)"/>
                </>
            )}
            background={(scale, {width}) => (
                <rect x={chartMargin.left} y={scale.y(PRECISION)} width={width - chartMargin.left - chartMargin.right}
                      height={scale.y(-PRECISION) - scale.y(PRECISION)} fill="var(--precision-band)"/>
            )}
        >
            {scale => (
                <>
                    <polyline points={polylinePoints(times, splineErrors, scale)} fill="none"
                              stroke="var(--series-spline)" strokeWidth={1.5} strokeLinejoin="round"/>
                    <polyline points={polylinePoints(times, keyframeErrors, scale)} fill="none"
                              stroke="var(--series-keyframes)" strokeWidth={1.5} strokeLinejoin="round"/>
                    {hoveredIndex !== undefined && (
                        <>
                            <HoverDot scale={scale} time={times[hoveredIndex]!} value={splineErrors[hoveredIndex]!} color="var(--series-spline)"/>
                            <HoverDot scale={scale} time={times[hoveredIndex]!} value={keyframeErrors[hoveredIndex]!} color="var(--series-keyframes)"/>
                        </>
                    )}
                </>
            )}
        </ChartFrame>
    );
}

interface ChartFrameProps extends HoverProps {
    height: number;
    fit: SpringFit;
    lowest: number;
    highest: number;
    valueTicks: number[];
    formatValue(value: number): string;
    tooltip(index: number): ReactNode;
    background?(scale: Scale, box: ChartBox): ReactNode;
    children(scale: Scale): ReactNode;
}

/** Axes, grid and a crosshair that snaps to the nearest sample, drawn at the container's own width. */
function ChartFrame({height, fit, lowest, highest, valueTicks, formatValue, tooltip, background, children, hoveredIndex, onHover}: ChartFrameProps) {
    const container = useRef<HTMLDivElement>(null);
    const width = useWidthOf(container);
    const {times, duration} = fit;
    const box = {width, height};
    const scale = scaleFor(box, duration, lowest, highest);
    const timeStep = niceStep(duration / Math.max(2, Math.floor(width / 64)));
    const timeTicks = Array.from({length: Math.floor(duration / timeStep) + 1}, (_, index) => index * timeStep);
    const hoveredTime = hoveredIndex === undefined ? undefined : times[hoveredIndex]!;

    function hover(event: PointerEvent<SVGSVGElement>) {
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
        const sampleCount = times.length - 1;
        const index = Math.round(scale.time(x) / duration * sampleCount);
        onHover(Math.min(Math.max(index, 0), sampleCount));
    }

    return (
        <div ref={container} className="relative" style={{height}}>
            {width > 0 && (
                <svg width={width} height={height} className="block touch-none select-none"
                     onPointerMove={hover} onPointerDown={hover} onPointerLeave={() => onHover(undefined)}>
                    {background?.(scale, box)}
                    {valueTicks.map(value => (
                        <g key={value}>
                            <line x1={chartMargin.left} x2={width - chartMargin.right} y1={scale.y(value)} y2={scale.y(value)}
                                  stroke={value === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}/>
                            <text x={chartMargin.left - 8} y={scale.y(value)} dy="0.32em" textAnchor="end"
                                  className="fill-muted-foreground text-[11px] tabular-nums">{formatValue(value)}</text>
                        </g>
                    ))}
                    {timeTicks.map(time => (
                        <text key={time} x={scale.x(time)} y={height - chartMargin.bottom + 18} textAnchor="middle"
                              className="fill-muted-foreground text-[11px] tabular-nums">{+time.toFixed(3)} s</text>
                    ))}
                    {hoveredTime !== undefined && (
                        <line x1={scale.x(hoveredTime)} x2={scale.x(hoveredTime)} y1={chartMargin.top} y2={height - chartMargin.bottom}
                              stroke="var(--chart-axis)"/>
                    )}
                    {children(scale)}
                </svg>
            )}
            {hoveredTime !== undefined && (
                <ChartTooltip x={scale.x(hoveredTime)} width={width} time={hoveredTime}>{tooltip(hoveredIndex!)}</ChartTooltip>
            )}
        </div>
    );
}

function ChartTooltip({x, width, time, children}: { x: number; width: number; time: number; children: ReactNode }) {
    const onLeft = x > width / 2;
    return (
        <div className="pointer-events-none absolute top-2 grid min-w-32 gap-1 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-sm"
             style={onLeft ? {right: width - x + 10} : {left: x + 10}}>
            <span className="text-muted-foreground tabular-nums">{time.toFixed(3)} s</span>
            {children}
        </div>
    );
}

function TooltipRow({label, value, keyClassName}: { label: string; value: string; keyClassName: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className={`h-0.5 w-3 rounded-full ${keyClassName}`}/>
            <span className="font-medium tabular-nums">{value}</span>
            <span className="ml-auto pl-3 text-muted-foreground">{label}</span>
        </div>
    );
}

function HoverDot({scale, time, value, color}: { scale: Scale; time: number; value: number; color: string }) {
    return <circle cx={scale.x(time)} cy={scale.y(value)} r={4} fill={color} stroke="var(--card)" strokeWidth={2}/>;
}

function useWidthOf(element: { current: HTMLElement | null }): number {
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
        observer.observe(element.current!);
        return () => observer.disconnect();
    }, [element]);
    return width;
}
