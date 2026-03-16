## times-fps

`times-fps` is a tiny TypeScript toolkit for designing animations and sampling animation frames with timelines, easing, and interpolation utilities.

This library allows you to describe your animation with named phases. `times-fps` gives you:

- a `Timeline` you can use to define animation phases
- an `Interpolator` you can use to interpolate between values mapping normalized progress and animation segments to ranges
- a `FrameSampler` that generates frames for an FPS and duration
- a `TimelineInspector` you can use to ask "has this phase started/finished yet?"

`FrameSampler` can produce frame values in the form of numbers, strings, arrays, or nested objects.

<br/><br/>

## Installation

```bash
npm install times-fps
# or
yarn add times-fps
# or
pnpm add times-fps
```

The library is written in TypeScript, ships as an ES module, and includes type definitions.

<br/><br/>

## Features

### Timeline Phases

Build timelines from named phases and ratios instead of hard‑coded numeric intervals.

```ts
import {Timeline} from "times-fps";

const timeline = Timeline.ofPhases(
    ["intro", 1],   // 1 unit of time
    ["main",  2],   // 2 units of time
    ["outro", 1]    // 1 unit of time
);

// Each phase is a Segment with [start, end] in [0, 1]
const phases = timeline.phases;
// phases.intro.start === 0
// phases.main.end   === 0.75
// phases.outro.end  === 1
```

Under the hood, `Timeline` builds a `Sequence` of `Segment`s and scales them to the normal \[0, 1\] interval.

---

### Interpolator & Segment Mapping

Turn a normalized progress value into numbers and ranges that respect your timeline structure.

```ts
import {createFrameSampler, getInterpolator, Timeline} from "times-fps";

const tl = Timeline.ofPhases(
    ["intro", 1],
    ["main", 2],
    ["outro", 1]
);
const p = tl.phases;

const sampler = createFrameSampler(progress => {
    const map = getInterpolator(progress);

    // Map the "intro" phase to a radius range
    const introRadius = map(p.intro).to(0, 50);

    // Map the "main" phase to an opacity range
    const mainOpacity = map(p.main).to(0, 1);

    // Map the whole sequence to anchor values
    const x = map.sequence(tl.sequence).to(0, 100, 200, 300);
    // end-inclusive slicing
    const y = map.sequence(tl.sequence.subsequence("main", "outro")).to(0, 100, 200);

    return {introRadius, mainOpacity, x, y};
});
```

- **`segment(segment).to(start, end)`**: remap the current progress within a specific segment to a numeric range.
- **`segment(segment).withEasing(easing).to(start, end)`**: apply custom easing inside that segment.
- **`sequence(sequence).to(...anchors)`**: map the full sequence or a subsequence to a list of anchor values, one more than the number of segments.

---

### Easing & Cubic Bézier Curves

Use built‑in easing functions or create custom cubic‑Bézier easings for your frames.

```ts
import {cubicBezierEasing, easeIn, easeOut, easeInOut} from "times-fps";

const customEase = cubicBezierEasing(0.55, 0.085, 0.68, 0.53);

// All easing functions are (t: number) => number
customEase(0.5); // eased value in [0, 1]
easeIn(0.3);
easeOut(0.8);
easeInOut(0.4);
```

Easing functions can be plugged directly into the `FrameSampler` (to ease global progress) or into the `Interpolator` when mapping particular segments.

---

### Frame Sampling

Sample your animation at a fixed frames‑per‑second and get back structured frame data.

```ts
import {createFrameSampler, type Frame} from "times-fps";

type MyValue = {
    x: number;
    y: number;
    opacity: number;
}

const sampler = createFrameSampler<MyValue>(progress => {
    const t = progress.value; // normalized 0 → 1

    return {
        x: t * 100,
        y: t * 50,
        opacity: t
    };
});

// Lazily iterate frames
for (const frame of sampler.iterate({duration: 2, fps: 60})) {
    // frame: { progress: number; value: MyValue }
}

// Or eagerly collect them
const data = sampler.collect({duration: 2, fps: 60});
// data.duration === 2
// data.fps      === 60
// data.frames   === Frame<MyValue>[]
```

`FrameSampler` works with nested data: numbers, strings, arrays, and objects, so you can shape the frame values as you like.

---

### Timeline Inspection

Ask timeline‑related questions at any point in time: “has this phase started yet?”, “is this sequence still active?”.

```ts
import {createFrameSampler, getTimelineInspector, Timeline} from "times-fps";

const timeline = Timeline.ofPhases(
    ["intro", 1],
    ["main",  2],
    ["outro", 1]
);

const sampler = createFrameSampler(progress => {
    const inspect = getTimelineInspector(progress);
    const p = timeline.phases;

    const intro = inspect(p.intro);
    const main  = inspect(p.main);

    if (intro.isActive()) {
        // do something during intro
    }
    if (main.hasStarted()) {
        // do something when main starts
    }

    return {};
});
```

`TimelineInspector` is built on top of the same normalized progress value, so it stays in sync with your frame sampling and interpolation.

---

### Exporting Frames (Node.js)

Use the `FrameExporter` helper to write frame data to disk when running in Node.js—for example, to precompute animation data for a game engine or for SVG path animations.

```ts
import {createFrameSampler, cubicBezierEasing, Timeline} from "times-fps";
import {FrameExporter} from "times-fps/exporter";

const timeline = Timeline.ofPhases(
    ["intro", 1],
    ["main", 2],
    ["outro", 1]
);

const sampler = createFrameSampler(progress => {
    return { x: progress.value * 100 };
});

await FrameExporter.exportToJson(
    sampler.collect({
        duration: 3,
        fps: 120,
        easing: cubicBezierEasing(0.55, 0.085, 0.68, 0.53)
    }),
    // this path should be relative to `process.cwd()`
    "./json-exports",
    "frames"
);
```

> Note: `exportToJson` is implemented only for the Node.js build (`times-fps/exporter`); the browser variant throws to guard against accidental use.

---

### WAAPI & `requestAnimationFrame`

You can use `FrameSampler` with Web Animations API:

```ts
const sampler = createFrameSampler(progress => {
    return {x: progress.value * 100};
});

const duration = 3;
const frames = sampler.collect({
    duration,
    fps: 120,
    easing: cubicBezierEasing(0.55, 0.085, 0.68, 0.53)
});

const element = document.getElementById("element-id");
element.animate(frames, {duration: duration * 1000});
```

or `requestAnimationFrame`:

```ts
const sampler = createFrameSampler(progress => {
    return {x: progress.value * 100};
});

const duration = 3;
const generator = sampler.iterate({
    duration,
    fps: 120,
    easing: cubicBezierEasing(0.55, 0.085, 0.68, 0.53)
});

const animate = () => {
    const next = generator.next();
    if (next.done)
        return;

    // use the value
    const value = next.value;

    requestAnimationFrame(animate);
};
requestAnimationFrame(animate);
```

You could also do:

```ts
const sampler = createFrameSampler(progress => {
    return {x: progress.value * 100};
});

const duration = 3;

let progress = 0;
let startTime: number | undefined;

const animate = (time) => {
    if (typeof startTime === "undefined")
        startTime = time;
    progress = (time - startTime) / duration;
    if (progress > 1)
        return;

    // use the value
    const value = sampler.sampleAt(progress);

    requestAnimationFrame(animate);
};
requestAnimationFrame(animate);
```

<br/><br/>

## Example: Driving an SVG Path Animation

Here is a more complete, end‑to‑end example combining `times-fps` with another library I authored, [`svg-path-kit`](https://github.com/navedm1424/svg-path-kit), to precompute SVG path frames:

```ts
import {PathBuilder, Point2D, Angle} from "svg-path-kit";
import {
    createFrameSampler,
    getInterpolator,
    Timeline,
    cubicBezierEasing
} from "times-fps";
import {FrameExporter} from "times-fps/exporter";

const timeline = Timeline.ofPhases(
    ["arc1", 1],
    ["arc2", 1]
);
const p = timeline.phases;

const sampler = createFrameSampler(progress => {
    const map = getInterpolator(progress);
    const pb = PathBuilder.m(Point2D.ORIGIN);

    const arc1Radius = map(p.arc1).to(1, 5);
    const arc1EndAngle = map(p.arc1).to(0, 3 * Math.PI / 4);
    pb.bezierCircularArc(arc1Radius, Angle.ZERO, arc1EndAngle);
    pb.l(pb.currentVelocity);

    const arc2Radius = map(p.arc2).to(1, 5);
    const arc2EndAngle = map(p.arc2).to(0, -Math.PI);
    const lineAngle = pb.currentVelocity.angle;
    pb.bezierCircularArc(arc2Radius, Angle.of(lineAngle).halfTurnBackward(), arc2EndAngle);

    return pb.toSVGPathString();
});

await FrameExporter.exportToJson(
    sampler.collect({
        duration: 3,
        fps: 120,
        easing: cubicBezierEasing(0.55, 0.085, 0.68, 0.53)
    }),
    "../json-exports",
    "path-data"
); // This will store the animation frames in a `path-data.json` file
```

<br/><br/>

## API Overview

The primary entry points you will usually work with are:

- **`Timeline`**: build normalized timelines with named phases.
    - `Timeline.ofPhases(...[name, duration][])` – create a timeline from labeled durations.
    - `.phases` – a read‑only map of phase names to `Segment`s.
    - `.sequence` – the underlying `Sequence` of segments (useful with the interpolator).

- **`createFrameSampler`**: create a sampler around a `progress => value` function.
    - `.sampleAt(t)` – sample a single frame at normalized time \(t\).
    - `.iterate(options)` – lazily generate frames.
    - `.collect(options)` – eagerly collect frames along with `duration` and `fps`.

- **`getInterpolator`**: attach an `Interpolator` to a specific `AnimationProgress`.
    - `map(segment).to(start, end)` – map progress in a segment to a numeric range.
    - `map.segment(segment).withEasing(easing).to(start, end)` – map with easing.
    - `map.sequence(sequence).to(...anchors)` – map a full sequence to anchor values.

- **`getTimelineInspector`**: derive a `TimelineInspector` from an `AnimationProgress`.
    - `inspect(segment).hasStarted() / hasFinished() / isActive()` – query phase/segment state.

- **Easing helpers**:
    - `cubicBezierEasing(mX1, mY1, mX2, mY2)` – create custom easing functions.
    - `easeIn`, `easeOut`, `easeInOut` – standard easing presets.

All of these are exported from the root `times-fps` entry point, except for `FrameExporter`, which is available from `times-fps/exporter`.

<br/><br/>

## Note from Author

I needed a way to precompute and export animation frames so the browser wouldn’t have to run Javascript to compute each frame. I could then feed the precomputed, exported frames into WAAPI to get a JS-computed animation with browser-native performance. 

What I ended up writing was not only a utility to precompute animations but also a way to design animations in terms of timelines and phases. You can design a complex interplay of CSS values in a single function, export the frames to JSON, and use them in your component.

I'm aiming to keep this library small, focused, and composable. If you have ideas, suggestions, or corrections, the project is open‑source and I’d be very happy to hear from you.

Thanks a lot!

