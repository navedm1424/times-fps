import {AnimationDefinition} from "../src/animation.js";
import {CubicBezierEasing, type SpringEasing} from "../src/easing.js";
import {progressPrecision, type SpringTransition} from "../src/transition.js";
import type {Seconds} from "../src/types.js";
import {invLerp, lerp} from "../src/utils/math.js";
import type {NativeKeyframe} from "../src/waapi/native-effects.js";
import {cssEasingOf, type NativeEasing} from "../src/waapi/native-easing.js";
import {SpringSplineFitter} from "../src/waapi/spring-fit.js";
import {plainNumberResolver} from "../src/waapi/effect-chains.js";
import {PropertyStops} from "../src/waapi/stops.js";
import {resolveTimings} from "../src/waapi/timings.js";
import {AnimationTracksResolver} from "../src/waapi/tracks.js";

type Kind = 'physical' | 'perceptual' | 'visual';

interface Parameter {
    name: string;
    min: number;
    max: number;
    step: number;
    initial: number;
}

const velocity: Parameter = {name: 'velocity', min: -20, max: 20, step: 0.5, initial: 0};
const bounce: Parameter = {name: 'bounce', min: -0.9, max: 0.95, step: 0.05, initial: 0.3};

const parametersByKind: { [K in Kind]: Parameter[] } = {
    physical: [
        {name: 'stiffness', min: 1, max: 1000, step: 1, initial: 260},
        {name: 'damping', min: 0.5, max: 100, step: 0.5, initial: 22},
        {name: 'mass', min: 0.1, max: 10, step: 0.1, initial: 1},
        {name: 'restDelta', min: 0.0001, max: 0.01, step: 0.0001, initial: progressPrecision},
        velocity
    ],
    perceptual: [
        {name: 'duration', min: 0.1, max: 3, step: 0.05, initial: 0.8},
        bounce,
        velocity
    ],
    visual: [
        {name: 'visualDuration', min: 0.1, max: 2, step: 0.05, initial: 0.5},
        bounce,
        velocity
    ]
};

const sampleCount = 1200;
const margin = {left: 56, right: 16, top: 16, bottom: 32};
const valuesByKind = Object.fromEntries(Object.entries(parametersByKind).map(([kind, parameters]) =>
    [kind, Object.fromEntries(parameters.map(({name, initial}) => [name, initial]))]
)) as { [K in Kind]: { [name: string]: number } };

const kindSelect = document.querySelector<HTMLSelectElement>('#kind')!;
const controls = document.querySelector<HTMLElement>('#controls')!;
const stats = document.querySelector<HTMLElement>('#stats')!;
const curvesChart = document.querySelector<SVGSVGElement>('#curves')!;
const errorsChart = document.querySelector<SVGSVGElement>('#errors')!;
const failure = document.querySelector<HTMLElement>('#failure')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const track = document.querySelector<HTMLElement>('#track')!;
const ball = document.querySelector<HTMLElement>('#ball')!;

/** What the ball plays: the resolved effect's keyframes, easing and duration. */
let playableFit: { keyframes: readonly NativeKeyframe[]; easing: NativeEasing; duration: Seconds } | undefined;
let ballPlayback: ReturnType<Element['animate']> | undefined;

playButton.addEventListener('click', playBall);

kindSelect.addEventListener('change', () => {
    renderControls();
    render();
});
renderControls();
render();

function currentKind(): Kind {
    return kindSelect.value as Kind;
}

function renderControls(): void {
    controls.querySelectorAll('.parameter').forEach(element => element.remove());
    const values = valuesByKind[currentKind()];
    for (const {name, min, max, step} of parametersByKind[currentKind()]) {
        const label = document.createElement('label');
        label.className = 'parameter';
        label.innerHTML = `<div class="label-row">${name}<span class="value"></span></div>`;
        const input = Object.assign(document.createElement('input'), {type: 'range', min, max, step, value: values[name]});
        const shownValue = label.querySelector<HTMLElement>('.value')!;
        shownValue.textContent = String(values[name]);
        input.addEventListener('input', () => {
            values[name] = Number(input.value);
            shownValue.textContent = input.value;
            render();
        });
        label.append(input);
        controls.append(label);
    }
}

function transitionOf(kind: Kind, values: { [name: string]: number }): SpringTransition {
    switch (kind) {
        case 'physical':
            return {type: 'spring', stiffness: values.stiffness!, damping: values.damping!, mass: values.mass!, restDelta: values.restDelta!, velocity: values.velocity!};
        case 'perceptual':
            return {type: 'spring', duration: values.duration!, bounce: values.bounce!, velocity: values.velocity!};
        case 'visual':
            return {type: 'spring', visualDuration: values.visualDuration!, bounce: values.bounce!, velocity: values.velocity!};
    }
}

/** Plays the resolved keyframes back the way WAAPI would: each keyframe's easing runs to the next keyframe. */
function fittedProgressAt(keyframes: readonly NativeKeyframe[], duration: Seconds) {
    const curves = keyframes.map(({easing}) => easing?.type === 'cubic-bezier' ? new CubicBezierEasing(easing.definition) : undefined);
    return (time: Seconds): number => {
        const offset = time / duration;
        const nextIndex = keyframes.findIndex(keyframe => keyframe.offset >= offset);
        const index = nextIndex === -1 ? keyframes.length - 1 : Math.max(1, nextIndex);
        const from = keyframes[index - 1]!;
        const to = keyframes[index]!;
        const localOffset = to.offset > from.offset ? invLerp(offset, from.offset, to.offset) : 1;
        const easedProgress = curves[index - 1]?.progressAt(localOffset) ?? localOffset;
        return lerp(Number(from.value), Number(to.value), easedProgress);
    };
}

function render(): void {
    try {
        failure.classList.add('hidden');
        const animation = AnimationDefinition.of(transitionOf(currentKind(), valuesByKind[currentKind()]));
        const easing = animation.easing as SpringEasing;
        const {spring, duration} = easing;
        const target = document.createElement('div');
        const targetValues = [{target, properties: {progress: {stops: PropertyStops.of('progress', {0: 0, 1: 1}), allowedFill: 'both' as const}}}];
        const [effect] = AnimationTracksResolver.resolve(resolveTimings(animation, 1), () => targetValues, plainNumberResolver).get(target)!.progress!;
        const {keyframes} = effect!;
        playableFit = {keyframes, easing: effect!.easing, duration};
        const fitAt = fittedProgressAt(keyframes, duration);
        const splinePoints = Object.entries(SpringSplineFitter.fit(easing))
            .map(([offset, point]) => ({offset: Number(offset), ...point}))
            .sort((first, second) => first.offset - second.offset);

        const times = Array.from({length: sampleCount + 1}, (_, index) => duration * index / sampleCount);
        const springProgresses = times.map(time => spring.positionAt(time));
        const fitProgresses = times.map(fitAt);
        const errors = fitProgresses.map((progress, index) => progress - springProgresses[index]!);
        const largestError = Math.max(...errors.map(Math.abs));

        renderStats([
            ['duration', `${duration.toFixed(4)} s`],
            ['ω₀', spring.naturalFrequency.toFixed(3)],
            ['ζ', spring.dampingRatio.toFixed(4)],
            ['spline segments', String(splinePoints.length - 1)],
            ['keyframes', String(keyframes.length)],
            ['largest |fit − spring|', largestError.toExponential(2)],
            ['progressPrecision', String(progressPrecision)]
        ]);
        renderCurves(times, springProgresses, fitProgresses, splinePoints, duration);
        renderErrors(times, errors, duration);
    } catch (error) {
        failure.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        failure.classList.remove('hidden');
    }
}

let abortController = new AbortController();
/** Plays the resolved effect with WAAPI, its progress carrying the ball across the track. */
function playBall(): void {
    if (!playableFit) return;
    const {keyframes, easing, duration} = playableFit;
    const travel = track.clientWidth - ball.offsetWidth;
    ballPlayback?.cancel();
    abortController.abort();
    abortController = new AbortController();
    ballPlayback = ball.animate(
        keyframes.map(({offset, value, easing}) => ({
            offset,
            transform: `translateX(${Number(value) * travel}px)`,
            ...(easing && {easing: cssEasingOf(easing)})
        })),
        {duration: duration * 1000, easing: cssEasingOf(easing), fill: 'forwards'}
    );
    ballPlayback.addEventListener("finish", () => {
        setTimeout(() => ballPlayback?.cancel(), 1000);
    }, { signal: abortController.signal, once: true });
}

function renderStats(entries: [string, string][]): void {
    stats.innerHTML = entries.map(([name, value]) => `<div><span>${name}</span>${value}</div>`).join('');
}

interface Scale {
    x(time: number): number;
    y(value: number): number;
}

function scaleFor(chart: SVGSVGElement, duration: Seconds, lowest: number, highest: number): Scale {
    const {width, height} = chart.viewBox.baseVal;
    return {
        x: time => lerp(margin.left, width - margin.right, time / duration),
        y: value => lerp(height - margin.bottom, margin.top, invLerp(value, lowest, highest))
    };
}

function path(times: number[], values: number[], scale: Scale, color: string, width: number): string {
    const points = times.map((time, index) => `${scale.x(time).toFixed(2)},${scale.y(values[index]!).toFixed(2)}`);
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

function axes(chart: SVGSVGElement, scale: Scale, duration: Seconds, valueTicks: number[], formatValue: (value: number) => string): string {
    const {width, height} = chart.viewBox.baseVal;
    const timeStep = niceStep(duration / 8);
    const timeTicks = Array.from({length: Math.floor(duration / timeStep) + 1}, (_, index) => index * timeStep);
    return [
        ...valueTicks.map(value => `
            <line x1="${margin.left}" x2="${width - margin.right}" y1="${scale.y(value)}" y2="${scale.y(value)}" stroke="var(--grid)"/>
            <text x="${margin.left - 8}" y="${scale.y(value) + 4}" text-anchor="end">${formatValue(value)}</text>`),
        ...timeTicks.map(time => `
            <line x1="${scale.x(time)}" x2="${scale.x(time)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="var(--grid)"/>
            <text x="${scale.x(time)}" y="${height - margin.bottom + 18}" text-anchor="middle">${+time.toFixed(3)} s</text>`)
    ].join('');
}

interface SplinePoint {
    offset: number;
    progress: number;
    easing?: CubicBezierEasing;
}

/** The spline itself: one relative `c` per segment, its easing's control points laid over the segment's span. */
function splinePath(points: readonly SplinePoint[], duration: Seconds, scale: Scale, color: string, width: number): string {
    const rounded = (value: number) => Math.round(value * 1000) / 1000;
    const pointAt = (offset: number, progress: number) => [rounded(scale.x(offset * duration)), rounded(scale.y(progress))] as const;

    const [first, ...rest] = points;
    let [currentX, currentY] = pointAt(first!.offset, first!.progress);
    const commands = [`M${currentX},${currentY}`];
    rest.forEach((to, index) => {
        const from = points[index]!;
        const [x1, y1, x2, y2] = to.easing?.definition ?? [1 / 3, 1 / 3, 2 / 3, 2 / 3];
        const segmentPointAt = (x: number, y: number) => pointAt(lerp(from.offset, to.offset, x), lerp(from.progress, to.progress, y));
        const [control1X, control1Y] = segmentPointAt(x1, y1);
        const [control2X, control2Y] = segmentPointAt(x2, y2);
        const [endX, endY] = segmentPointAt(1, 1);
        const relative = (x: number, y: number) => `${rounded(x - currentX)},${rounded(y - currentY)}`;
        commands.push(`c${relative(control1X, control1Y)} ${relative(control2X, control2Y)} ${relative(endX, endY)}`);
        [currentX, currentY] = [endX, endY];
    });
    return `<path d="${commands.join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
}

function renderCurves(times: number[], springProgresses: number[], fitProgresses: number[], splinePoints: readonly SplinePoint[], duration: Seconds): void {
    const all = [...springProgresses, ...fitProgresses, 0, 1];
    const padding = (Math.max(...all) - Math.min(...all)) * 0.06;
    const lowest = Math.min(...all) - padding;
    const highest = Math.max(...all) + padding;
    const scale = scaleFor(curvesChart, duration, lowest, highest);
    const valueTicks = ticksBetween(lowest, highest, 6);

    curvesChart.innerHTML = [
        axes(curvesChart, scale, duration, valueTicks, value => String(+value.toFixed(3))),
        path(times, springProgresses, scale, 'var(--spring)', 3.5),
        splinePath(splinePoints, duration, scale, 'var(--fit)', 1.5),
        ...splinePoints.map(({offset, progress}) => `<circle cx="${scale.x(offset * duration)}" cy="${scale.y(progress)}" r="3" fill="var(--knot)"/>`)
    ].join('');
}

function renderErrors(times: number[], errors: number[], duration: Seconds): void {
    const reach = Math.max(progressPrecision * 1.5, ...errors.map(Math.abs)) * 1.1;
    const scale = scaleFor(errorsChart, duration, -reach, reach);
    const {width} = errorsChart.viewBox.baseVal;

    errorsChart.innerHTML = [
        `<rect x="${margin.left}" y="${scale.y(progressPrecision)}" width="${width - margin.left - margin.right}"
            height="${scale.y(-progressPrecision) - scale.y(progressPrecision)}" fill="var(--band)"/>`,
        axes(errorsChart, scale, duration, ticksBetween(-reach, reach, 4), value => value.toExponential(1)),
        path(times, errors, scale, 'var(--fit)', 1.5)
    ].join('');
}

function ticksBetween(lowest: number, highest: number, count: number): number[] {
    const step = niceStep((highest - lowest) / count);
    const first = Math.ceil(lowest / step) * step;
    return Array.from({length: Math.floor((highest - first) / step) + 1}, (_, index) => first + index * step);
}

/** The 1, 2 or 5 times a power of ten that's closest above the rough step. */
function niceStep(roughStep: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const factor = [1, 2, 5, 10].find(candidate => candidate * magnitude >= roughStep)!;
    return factor * magnitude;
}
