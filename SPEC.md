# TimesFPS: Implementation Spec

This document is for people working on the library. It covers the concepts the API is built on, how the code is laid out, how a definition becomes running WAAPI animations, and why things are the way they are.

The library lives in `src/`. Resolution tools that any adapter may use or not are in `src/resolution/`, the WAAPI adapter is in `src/waapi/`, and the tests are in `tests/`.

## 1. Purpose

Definitions describe animations without knowing what they animate. A definition says how long each change takes, how it progresses, when it happens relative to other changes, and how often it happens. It never names values, properties or targets.

Work happens in two phases:

1. **Definition.** Animations and sequences are built from transitions, repeat options and positions. Definitions are engine-agnostic and reusable.
2. **Adaptation.** An adapter takes a definition plus a **mapping**, which supplies targets and values, and plays it on an engine. The only adapter so far is the WAAPI one, behind `animate`.

One definition can drive any number of targets and properties, and can be placed many times in a sequence.

## 2. Concepts

### 2.1 A change goes from 0 to 1

Every change is a progression from **0 to 1**. The definition only knows that something goes from 0 to 1. The mapping decides what 0, 1 or 0.5 mean.

| Type | Meaning |
|---|---|
| `Seconds` | Time |
| `Progress` | A position on the 0→1 change axis; a spring or an overshooting cubic Bézier can pass beyond it |

### 2.2 Transitions

A transition gives one play its duration and its shape (`src/transition.ts`).

- **Eased:** `eased(duration, easing?)`. `EasingDescriptor` is a preset (`'linear'`, `'ease'`, `'easeIn'`, `'easeOut'`, `'easeInOut'`), a cubic Bézier `[x1, y1, x2, y2]`, or steps `[count, position?]`. The step positions are `jumpStart`, `jumpEnd` (the default), `jumpNone` and `jumpBoth`.
- **Springs:** `spring(...)`, in three forms that all have `type: 'spring'`:
  - **Physical:** `stiffness`, `damping` and optional `mass`, `velocity` and `restDelta`. Its duration is how long it takes to come to rest.
  - **Duration:** a `duration` and a `bounce`. The spring is solved so that it comes to rest exactly at that duration.
  - **Visual:** a `visualDuration` and a `bounce`. `visualDuration` sets how fast it swings, and the spring runs on until it comes to rest.

  A bounce maps to a damping ratio the way Apple's springs do: a positive bounce lowers the ratio from 1, and a negative one raises it past 1.

Spring quantities are in progress units: `velocity` is progress per second, and `restDelta` is a `Progress`. This is sound because a spring's motion is linear in its distance: a spring from 0 to 1 is a scaled copy of the same spring between any two values. The default rest threshold, and the precision every fitted curve must keep, is `PRECISION` (0.001, `src/constants.ts`).

### 2.3 Easing functions

Definitions resolve their transition as soon as they're created. `SimpleAnimation` has `duration` and `easing`, where `easing` is an `EasingFunction` (`src/easing.ts`). There's one class per kind: `LinearEasing`, `CubicBezierEasing`, `StepsEasing` and `SpringEasing`.

An easing function is pure math over its input time, from 0 to 1, limited to a **window** from `windowStart` to `windowEnd`:

- **Offsets** are fractions of the window, and the progress isn't rescaled to it. A window from 0.25 to 0.75 of `linear` gives a progress from 0.25 to 0.75.
- **A window runs backwards** when `windowEnd` comes before `windowStart`. `reversed()` swaps them.
- **`windowed(start, end)`** cuts a sub-window. Splitting an easing is always done by cutting windows, never by building new curves.
- **The math.** Each function gives its progress at an offset, the offsets where its progress turns back, the offsets where it reaches a given progress, and `startProgress`/`endProgress`.
- **`startProgress` and `endProgress`** are the progress the window starts from and ends at, before or after any jump right at an edge. They only differ from the output at offsets 0 and 1 for steps: CSS steps are right-continuous, so a jump-start easing already outputs 1/n at time 0, but it starts *from* 0.
- **A `SpringEasing`** is the spring's closed-form motion over its duration. It closes the gap left at the end evenly after the last turning point, so it ends at exactly 1.

Creating a definition validates its transition and easing: an eased duration can't be negative; spring durations, stiffness, damping and mass must be positive, `bounce` must be between -1 and 1, and `restDelta` between 0 and 1, so every spring that reaches `DampedSpring` has a positive natural frequency and damping ratio; cubic Bézier x handles must be within 0–1, and steps need a whole count of at least 1 (2 for `jumpNone`).

### 2.4 Repeat options

```ts
interface RepeatOptions {
    repeatCount?: number;      // repetitions after the first play
    repeatDelay?: Seconds;     // between plays, never after the last
    repeatMode?: 'loop' | 'reverse' | 'mirror';
}
```

- `loop`: every play runs forwards.
- `reverse`: every other play runs backwards in time, so its easing runs backwards too.
- `mirror`: every other play flips the progress (`1 − progress`) and keeps the easing running forwards. This usually suits springs, because a spring played backwards starts wobbly and ends calm.

For a sequence, `reverse` reverses the whole iteration in time. `mirror` does the same but keeps each animation's easing running forwards through flipped values.

`Infinity` is a valid `repeatCount` on animations and sequences, including an infinite entry inside an infinitely repeating sequence. A timed tween's `repeatCount` must be finite.

### 2.5 Animations

`AnimationDefinition.of` and `animation` make animations. The name avoids shadowing the DOM's `Animation`, which the adapter returns.

- **`AnimationDefinition.of(transition, options?)`** gives a `SimpleAnimation`: one play.
- **`TimedTweenAnimation`** is tweens that run one after another, each with its own transition, delay and finite repeats. It's internal: sequences can't hold it yet, nothing handles it, and its declarations are stripped from the build.
- **`animationOf({...transition, ...options})`** splits a transition given together with its options, for the places that take either.

`AnimationOptions` are `TimingOptions`: the repeat options plus `delay: Seconds | Stagger`. The delay waits before the first play and isn't repeated. Animations have no name: they get one when they're placed in a sequence.

The constructors validate and clamp, so every way of making an animation does. `SimpleAnimation` is exported as a type only. The checks:
- delays, repeat delays and transition durations must be finite numbers, and durations can't be negative;
- `repeatCount` must be a number, and may be `Infinity`;
- negative delays, repeat delays and repeat counts become 0, and fractional repeat counts round down.

### 2.6 Sequences

`Sequence.builder().add(name, animationOrSequence, at?) … .build(options?)`

- **Names** are unique within their sequence and can only contain letters, digits and underscores. The name is the entry's identity: positions and the mapping refer to entries by name.
- **Entries** are an animation, a transition with its animation's options spread into it, or a sequence.
- **Positions** are parsed as entries are added, and the parsed form is stored on the entry. A position that can't be parsed, whose time isn't finite, or that refers to an entry that isn't an earlier one throws there.
- **Options** are `TimingOptions`, as an animation's: the repeat options plus a `delay`, in seconds or a stagger. The `Sequence` constructor validates and clamps them like an animation's, throws for a sequence without entries, and checks its names and positions again, so a sequence made without the builder is checked too. Each built sequence keeps its own copy of the entries, so the builder can go on without changing it. Builders are mutable, though: `add` changes the builder and returns it, so branches added to one builder both end up in it, and the docs say so.
- **Nesting.** A sequence can be an entry of another. It's one unit on the outer timeline, and its entries' positions only place them within it.

#### Positions (`at`)

| Form | Meaning |
|---|---|
| `n` | Absolute time from the start of the sequence's iteration |
| `+n` / `-n` | From the previous entry's last referenceable end |
| `<+n` / `<-n` | From the previous entry's first start; `<` alone is `<+0` |
| `name+n` / `name-n` | From the named entry's last referenceable end |
| `name<+n` / `name<-n` | From the named entry's first start; `name<` alone is `name<+0` |

- An omitted `at` means `'+0'`. The first entry's "previous" point is the start of the sequence.
- Named references can only point at earlier entries. The types enforce this, and references never reach into nested sequences.
- A position that resolves below 0 becomes 0.
- **The first start** is the position plus the delay: the shortest staggered delay for an animation, or the sequence's delay for a sequence. References to an entry's start resolve to its first start.
- **The last referenceable end:**
  - For a finite entry, it's its end, after its delay and all its repeats.
  - For an infinite entry, it's the end of its first iteration, since infinity can't be referenced.
  - A staggered animation's comes from its latest target.
  - A sequence's comes from its iterations: each one lasts until the latest last referenceable end among its entries.
  - A staggered sequence's comes from its latest copy.

#### Staggered sequences

A sequence whose `delay` is a stagger plays once per target index. The copy at index *i* plays target *i* of each of its animations, so every animation inside must have the same number of targets, *n*.
- Each copy's delay is the stagger at (*i*, *n*), and its positions resolve within that copy.
- A stagger inside the copy, on an animation or a nested sequence, gives it its delay at (*i*, *n*), as it would one target. That pushes on the entry in that copy only.
- From outside, the staggered sequence's first start is its earliest copy's, and its ends are its latest copy's.

### 2.7 Stagger

```ts
type Stagger = (index: number, total: number) => Seconds;
stagger(each, {from?, easing?})
```

A stagger is an animation's or a sequence's `delay` given as a function of each target's index. It's a timing decision, so it belongs in the definition. Only the mapping says how many targets there are, so timings are resolved at adaptation. `from` is `'first'`, `'last'`, `'center'` or an index. `easing` spreads the delays through an easing. `stagger` throws for an `each`, or an index `from`, that isn't a finite number. Negative staggered delays become 0, and NaN or infinite ones throw.

## 3. Mappings

A mapping's shape is derived from the definition's type, so the compiler requires every entry (`src/waapi/mapping.ts`).

```ts
type Target = Element | Element[] | CSSSelector | ((scope: Element) => Element | Element[]);
type ValueStops = readonly (number | string)[] | { [progress: number]: number | string };
type AnimationMapping = {
    target: Target;
    values: { [property: string]: ValueStops };
    composite?: CompositeOperation;
    fill?: Exclude<FillMode, 'auto'>;
};
```

A sequence's mapping mirrors its tree. It's keyed by entry name, with a nested mapping for each nested sequence. `MappingOf<Definition>` gives the mapping type of an animation or a sequence.

- **Values are stops** keyed by progress, or a list spread evenly from 0 to 1. Stops outside 0–1 are rejected. A missing 1 takes the last given value. A missing 0 takes the value the track has as the entry starts (§5.6), except for an entry that adds to what's under it, where it takes the first given value. Between stops, the value is linear in the progress. Past the ends, as a spring overshoots, it continues the nearest segment.
- **CSS properties** are given in camelCase. Custom properties are given by their own name, `--like-this`.
- **A value** is a number, a number with a unit (`'24px'`), or a CSS expression (`'calc(50% + 2em)'`).
- **`composite`** is WAAPI's: `'replace'` by default, `'add'` or `'accumulate'`.
- **`fill`** is WAAPI's, for the entry as a whole: it overrides the fills the tracks give the entry at its ends (§5.5). Without it, the entry keeps the fills the tracks give it.

`sequence(options?)` builds a sequence and its mapping together, as a `MappedSequenceBuilder<Names>`. `add` has four overloads: `(target, values, animation, at?)` and `(sequence, at?)`, each also with a name first. The implementation takes rest arguments typed as a union of the four argument lists. A named entry is told apart by its second argument being a sequence, or its fourth being an object, where an unnamed one has its position.
- Given names join `Names`, and `at` is an `At<Names>`, so positions can only refer to names given before them. `add` parses each position and checks it against the names given so far, and checks given names as `Sequence.builder().add` does.
- The animation can be a `MappedTransitionAndOptions`, a transition with its animation's options and its mapping's `composite` and `fill`, or a `MappedAnimation`, `{animation, composite?, fill?}`.
- Entries are kept as they're added. Only `animate()` names the unnamed ones, in order, as `a` to `z`, then `aa`, `ab` and on, skipping the names given, so no position can refer to them. It then builds the sequence and its mapping and plays them.

## 4. Code layout

| File | Responsibility |
|---|---|
| `src/types.ts` | Shared definition types: `Seconds`, `Progress`, `Stagger`, `RepeatOptions` |
| `src/constants.ts` | `PRECISION`: how close two progresses must be to count as the same |
| `src/easing.ts` | Easing descriptors and the windowed easing functions |
| `src/cubic-bezier.ts` | Cubic Bézier math: coordinates, inverses, turning points, inflections, splitting |
| `src/damped-spring.ts` | Closed-form damped springs in each damping regime: positions, turning times, rest time |
| `src/transition.ts` | Transitions, their factories, checking them, and resolving them into a duration and an easing function |
| `src/timing-options.ts` | `TimingOptions`, which animations and sequences share, and their clamps |
| `src/stagger.ts` | `stagger` |
| `src/animation.ts` | `AnimationDefinition`, `animation`, `SimpleAnimation` and `TimedTweenAnimation`, with validation and clamping |
| `src/at.ts` | `At`, `parseAt` and the parsed form |
| `src/sequence.ts` | `SequenceBuilder`, `Sequence` and its entries, with validation and clamping |
| `src/utils/validation.ts` | `checkNumber` and `checkPositive` |
| `src/utils/math.ts` | Interpolation and solving monotone functions |
| `src/utils/records.ts` | Reading numeric-keyed records in order |
| `src/resolution/timings.ts` | `computeTimings`: the timing tree, entry paths and staggered delays |
| `src/resolution/stops.ts` | `PropertyStops` and `StopValue`: one property's values along the progress, resolved later |
| `src/resolution/track-runs.ts` | `TrackSpan` and `TrackRun`: a track's values over time, and their iterations |
| `src/waapi/animator.ts` | `animate`, `sequence` and `WAAPIAnimator`, which runs every step and creates the native animations |
| `src/waapi/controls.ts` | `AnimationControls`: playing, pausing, seeking and listening to the native animations together |
| `src/waapi/mapping.ts` | Mapping types, `AllowedFill`, and resolving targets |
| `src/waapi/css-values.ts` | CSS property names, value types, each target's stops as CSS text, and the page's value resolver |
| `src/waapi/effect-chains.ts` | The values stage: effect chains, and resolving their values to numbers in one unit |
| `src/waapi/tracks.ts` | `AnimationTracksResolver`: repetitions, fill conflicts and values, over track runs |
| `src/waapi/native-effects.ts` | The easing stage: spans into native keyframes and easings |
| `src/waapi/native-easing.ts` | `NativeEasing` and its CSS form |
| `src/waapi/spring-fit.ts` | Fitting a spring easing with cubic Bézier segments |

`spring-fit-visualizer/` is a page for checking spring fits by eye, and `site/` is the demo site.

## 5. Adaptation flow

```
animate(definition, mapping, {scope = document.documentElement, autoplay = true})
│
├─ 1. Targets      resolveTargets                → Element[] per animation leaf
├─ 2. Values       resolveTargetValues           → TargetValues[] per leaf (stops as CSS text, composite, allowed fill)
│                  target counts per leaf
├─ 3. Timings      computeTimings(definition, counts)   → AnimationTimings | SequenceTimings | StaggeredSequenceTimings tree
├─ 4. Tracks       AnimationTracksResolver.resolve(timings, valuesOf, domValueResolver)
│     ├─ a. repetitions    → ScheduledEffect[]  (spans per target and property)
│     ├─ b. fill conflicts → PlacedEffect[]    (dropped effects, fill modes)
│     ├─ c. values         → ResolvedEffect[]  (units, or values passed through as text)
│     └─ d. easings        → NativeAnimationEffect[]  (keyframes, native easings)
│                  = AnimationTracks: Map<Element, {[property]: NativeAnimationEffect[]}>
└─ 5. Play         element.animate(...) per effect
                   → AnimationControls
```

When the adapter is given a single animation, it skips the per-leaf maps and resolves one `TargetValues[]`. When it's given a sequence, every animation leaf is keyed by its **entry path**: the names leading to it joined by `>`, such as `intro>logo>fade`. Names can't contain `>`, so paths can't collide. Sequences have no targets or values, so only leaves have keys.

### 5.1 Targets

A selector is queried in the scope, and a function is called with it. Elements are deduplicated, and a target with no elements throws.

### 5.2 Values

Each target gets its own stops, because units like `em`, `%` and `vw` depend on the element, and because an entry's missing 0 depends on what that element's track shows. Here the values only become CSS text. They're resolved to numbers in stage c (§5.6), once the tracks say which entry starts from which.

A property's **value type** comes from `CSS.supports`, tested against `1`, `1px`, `1%`, `1deg` and `1s`, and cached per property. It gives:
- the **default unit** for a bare number: none when the property takes numbers, then `px`, then `deg`; otherwise a bare number throws;
- the **probe syntax**, such as `<length-percentage>` or `<number> | <percentage>`.

Each stop holds a `StopValue`: its text, or none for a missing 0, and later its number. A missing 0 isn't `given`: it adopts the text of the value its track has as the entry starts, or only gets a number when the track is between stops then. Flipped stops, holds and every repeat share the same `StopValue`s, so resolving one resolves it everywhere.

### 5.3 Timings

`computeTimings` returns a tree with the definition's levels. Times are local to the iteration of the sequence an entry is in, or start at 0 for the outermost definition.

| Field | Meaning |
|---|---|
| `firstStart` | Position plus delay (an animation's shortest staggered delay, or a sequence's delay); a staggered sequence's earliest copy's |
| `end` | Undefined when it never ends |
| `lastReferenceableEnd` | See §2.6 |
| `playDuration` | One play of an animation, or one iteration of a sequence |
| `totalDuration` | Plays and repeat delays without the delay; infinite when it never ends |

Leaves also keep `targets`: each target's index and start, its position plus its delay. Inside a staggered sequence's copy, a leaf has only the target at the copy's index. A staggered sequence keeps a `SequenceTimings` per copy as `lanes`, and its own reach: `firstStart`, `end` and `lastReferenceableEnd`. A sequence never ends if it repeats forever or if any of its entries never ends.

### 5.4 Tracks, stage a: repetitions

**Spans and runs.** A `TrackSpan` is a stretch of one target's property, from `start` to `end`, whose value is `stops.valueAt(easing.progressAt(x))`. A hold is a span with constant stops and a linear easing. A `TrackRun` is spans one after another. `TrackRun.iteration(index, iterationDuration, options)` places a run in an iteration of a repeat. Every other iteration of a reverse or a mirror flips in time:
- a reverse reverses each span's easing window;
- a mirror keeps the easing and flips the stops.

**The rule.** Only the outermost repeat runs as WAAPI iterations. Every repeat inside it is baked into the spans. While walking the tree, the resolver carries a flag that says whether any ancestor repeats.

- **No repeating ancestor:** the node's runs become effects with native iterations.
- **A repeating ancestor and a finite repeat:** the iterations are baked into the run, with holds between them. A baked run never starts or ends with a hold. The start is covered by the effect's delay and backwards fill, and the end by its forwards fill.
- **A repeating ancestor and an infinite repeat:** the run keeps only its first iteration. A separate **continuing effect** starts right after that iteration and repeats forever. Its repeat delay is baked in as `[hold, play]`, or as `[hold, flipped, hold, play]` for a reverse or a mirror. It runs at its own phase underneath the ancestor's effects, so when it shows, it may jump.

**Plays without duration.** A play of 0 seconds is a span that starts and ends at the same time. Inside a longer effect it's two keyframes at the same offset, its start values and then its end values, so the track jumps. An effect of 0 seconds has two keyframes: the start values at 0 and the end values at 1. WAAPI shows the start values before it, if it fills backwards, and the end values from its start time on.

Sequences apply their repetition to their children's runs after resolving all of them. Then everything is shifted into the parent's iteration by the sequence's first start, or a leaf's targets by their position plus their delay.

**Native layout.** For a run from `a` to `b` in iterations of `L` with repeat delay `d`, where the period is `P = L + d`:

| Case | Effects |
|---|---|
| No repeat | the run |
| No repeat delay, not mirror, the run fills the iteration | the run × playCount, `alternate` for reverse |
| Loop | [run + hold to `a + P`] × repeatCount, then the run on its own; × ∞ alone when infinite |
| Reverse/mirror, infinite | [run + hold, flipped + hold] × ∞ |
| Reverse/mirror, odd play count | [run + hold, flipped + hold] × repeatCount/2, then the run on its own |
| Reverse/mirror, two plays | [run + hold, flipped] on its own |
| Reverse/mirror, even play count | [run + hold, flipped + hold] × (repeatCount−1)/2, then [run + hold, flipped] on its own |

The last play never ends with a hold. The first effect starts at the run's start, so the sequence's start hold is covered by the native delay. The holds between iterations, `[endHold + repeatDelay + startHold]`, are in the keyframes.

**Declaration order.** Each effect gets an order key: the entry indices leading to its leaf, plus a part index. A continuing effect gets the part index `−(depth + 1)`. Continuations created deeper therefore come before shallower ones, and all of them come before the parts that cover them. Effects are created in this order, and WAAPI shows later-created effects over earlier ones.

### 5.5 Tracks, stage b: fill conflicts

Per target and property, in declaration order:

- **Drop:** an effect that lies entirely within the active span of one declared later, which replaces what's under it, never shows, so it's dropped. This removes an infinite entry's continuation inside an infinitely repeating sequence. A later effect that adds to what's under it drops nothing.
- **Backwards:** only the effects that start first fill backwards.
- **Forwards:** an effect fills forwards unless an effect declared before it runs on after it ends.
- **Mapped:** a mapping's `fill` overrides the backwards fill of its entry's first-starting effect and the forwards fill of its last-ending one. The entry's other effects only keep the fills it has, so none of them shows past the entry's ends. An entry is split into several effects by the native layout, so overriding every effect would let a later part fill over an earlier one.

An effect's end is its delay plus its active duration, which is 0 for an effect of 0 seconds, whatever its iterations.

Entries are never merged. Two entries on the same property of the same target inside a natively repeating sequence are both active through every iteration, holds included, so the later-created one covers the other. That's accepted.

### 5.6 Tracks, stage c: values

`resolveEffectChains` resolves each track's stop values, in `src/waapi/effect-chains.ts`. Values pass through to WAAPI as their CSS text wherever that's exact, and are resolved to numbers only where keyframes fall between them. It works through a `CSSValueResolver`, which gives a property's current value, whether it takes a value, and a value's computed form. On the page that's `domValueResolver`: computed styles, `CSS.supports` and probes. Tools that animate no real property use `plainNumberResolver`.

**Chains.** The track's entries are taken in order of their first start, and of declaration when they start together.
- An entry with a value at 0 starts a chain.
- An entry without one depends on the effect showing at its start. That's the last-declared effect of an earlier entry that replaces what's under it and shows a value then, as WAAPI works it out from its delay, iterations, direction and fill. The entry joins that effect's chain.
- With no such effect, it starts a chain from the property's current value.
- An entry that adds to what's under it always has a value at 0, and never counts as showing for another.

**Starts.** In order, each entry without a value at 0 adopts a text: the property's current value for a chain's first entry, or the stop value its effect shows at its start. That's a stop's when the effect is at a whole span's end, or anywhere through a hold. Between stops there's no text, and the start only gets a number, below.

**Passing through.** An effect's values pass through as text when `landsOnStops` holds and its entry's start has text. `landsOnStops` holds when every keyframe lands on a stop: its easing is on the effect, or each span eases between exactly two stops through one native easing (cubic Bézier, steps or linear) that needn't be split. Its window covers the whole easing, forwards or backwards, and it makes one native piece. An overshoot needn't be split: with two stops, the value runs linearly with the progress past them too, as WAAPI extrapolates between two keyframes. A chain whose effects all pass through is only checked: each given value must be one the property takes. Any other chain is resolved to numbers, and its effects that pass through still use their text.

**Units.** A resolved chain shares one unit, and its values with text are resolved to numbers in it:
- **From the current value:** the current value must be a single number with a unit, and that's the unit. Every other value in that unit is taken as it is. The rest are checked with `CSS.supports` and resolved through a probe, and they must come out in that unit.
- **From a given value:** if every value is a number in one unit, the property must take that unit, and they're taken as they are. Otherwise the expressions are checked and resolved. If the units still differ, every value is resolved. If they differ even then, it throws.

A unit mismatch throws with what to do instead: values in one unit, or expressions that resolve to one; or, to have values passed through, only native easings, no values between 0 and 1 where repeats are played as keyframes, and no entry without a 0 starting between two values of the one under it.

Then, in order, each start without text takes the number its effect shows there, which needs that effect's values to be numbers already. Each effect gets the unit of its chain, or none when its values pass through.

A probe is a registered custom property (`--timesfps-probe-N-a`/`-b`) with the property's syntax. It's set inline on the target with `transition: none !important` while its computed value is read, then the inline style is restored. Animations and transitions never touch a probe, and its computed value is absolute: `calc()` collapses, lengths become px, and angles become deg. Percentages stay percentages.

Each syntax has two probes with different initial values. A value that the syntax rejects reads as the initial value on both, which tells it apart from a value that happens to equal one of them. A resolved value must be a single number with an optional unit, or it throws.

### 5.7 Tracks, stage d: easings

`nativeEffectOf` turns each placed effect into a `NativeAnimationEffect`, whose keyframe values are CSS text: the stops' own when the effect passes them through, or each number with its unit.

- **On the effect.** If the effect is a single span covering its whole duration, with a whole, forward, non-spring easing and stops within 0–1, the easing goes on the effect and the stops become linear keyframes at their progress. Native iterations with `alternate` keep it there.
- **In the keyframes.** Otherwise the effect easing is linear and each span is split into keyframes:
  1. A spring is fitted once per spring and duration, as a spline of cubic Bézier segments. The segments that overlap its window are cut to it.
  2. Each segment is split where its progress turns back, so each piece only rises or only falls.
  3. Each piece is split where it passes a stop, so between two keyframes the value runs linearly with the progress.
  4. Each piece becomes a native easing, scaled to 0–1:
     - **Cubic Bézier:** the window is cut out of the curve and stretched. If stretching would push a handle outside the 0–1 time range, it's split once more at the inflection of x. Reversed windows reverse the definition.
     - **Steps:** a whole forward window from 0 to 1 stays a native `steps()`. Any other window becomes a `linear()` whose levels jump at the step positions, so steps never add keyframes.
     - **Linear:** linear.
- **Keyframe easings** lead to the next keyframe, as WAAPI's do. A keyframe without one is linear, and the last keyframe has none.
- **Offsets** are clamped to 0–1 and kept in order, because rounding can push them out and WAAPI rejects that.

### 5.8 Play

For each target, property and effect, in order, the adapter calls `element.animate()`:
- keyframe values are their CSS text;
- times are converted to milliseconds;
- the effect's `composite` is its entry's;
- `float` and `offset` become `cssFloat` and `cssOffset`, since `offset` is the keyframe's own;
- the animation's `id` is its entry path and property, `path:property`, or the property alone for an animation on its own.

Without `autoplay`, every animation is paused as it's created.

`animate` returns an `AnimationControls` over the native `Animation`s. It plays, pauses, cancels, finishes and seeks all of them together, and sets their playback rate and start time, in seconds. `finished` settles once they all have. `onFinish` and `onCancel` call a listener each time every animation has dispatched that event, and return a function that removes it.

## 6. Decisions

| Decision | Why |
|---|---|
| Definitions are value-free; every change is 0→1 | One definition serves any properties, targets and engine |
| Duration lives in the transition | A physical spring's duration comes from its physics |
| Spring quantities are in progress units | Values don't exist at definition time, and spring motion scales linearly |
| Definitions resolve their easing on creation | Mistakes throw where they're made, and every adapter shares the math |
| Easing functions are windowed and keep raw progress | Splitting, cutting and reversing are all window operations, and a spring window can start and end at the same progress |
| Easing math in the core, WAAPI conversion in the adapter | Spline fitting, CSS pieces and `linear()` are engine concerns |
| Mirror flips the progress and keeps the easing | That's what makes a mirrored spring settle the way it started |
| Animations are unnamed; entries are named | The same animation can be placed many times |
| Positions and references are local to each sequence | Entry names only need to be unique within their sequence |
| Timings are resolved at adaptation | Staggers depend on the target count, which only the mapping gives |
| Leaves keyed by entry path | Definitions are reusable, so identity is the place in the tree, not the object |
| Values resolved per target, through probes | Relative units depend on the element; probes are untouched by animations and give absolute values |
| Values resolved after the fill conflicts | A missing 0 depends on which effect shows at the entry's start, and only interpolation needs numbers |
| Constructors validate and clamp | Every way of making a definition is checked, not only the factories |
| Tracks per target and property | WAAPI composites per property, and units differ between entries |
| Only the outermost repeat is native | WAAPI iterations can't nest |
| Infinite inner repeats: first iteration plus a continuing effect | The ancestor's repeat shows over it, and it carries on once the ancestor ends |
| Fill rules instead of merging entries | Keeps entries independent; conflicts inside natively repeating sequences are accepted |
| Keyframe easings lead to the next keyframe | It's WAAPI's own model |
| Steps split into `linear()` windows, not hold-and-jump keyframes | Exact, and no extra keyframes |

## 7. Testing

`tests/tracks.test.ts` simulates how WAAPI computes and composites effects:
- iterations and directions;
- fills;
- keyframe intervals;
- cubic Bézier, steps and `linear()` easings;
- the last effect with a value showing.

It compares the result with the definitions' own math, sampled at times that miss round numbers, where steps and repeats jump. The definitions' math is: each play through the stops and easing, holds through repeat delays, `reverse` as time reversal, and `mirror` as `1 − progress` with the easing running forwards.

The cases cover single animations, sequence loops, reverses and mirrors with offset entries, and inner repeats baked inside outer ones. Easings are cubic Bézier (including overshoot), jump-start and jump-end steps, and springs. Layout, timing, fill and drop cases are checked exactly.

Effect chains are tested through a stand-in `CSSValueResolver` that takes plain numbers and gives every property a current value of 0.25. The DOM-dependent parts (targets, `domValueResolver`, probes and `element.animate`) have no tests yet, because the tests run without a DOM.

## 8. Limitations and open work

- **Timed tween animations** exist as `TimedTweenAnimation`, which is internal and can't be placed in a sequence or played yet.
- **The before flag.** Only an effect's own easing gets WAAPI's before flag. So an effect whose first keyframe starts with a jump, such as jump-start steps split by a stop or a reversed jump-end, shows the jumped value during its backwards fill.
- **Continuations jump.** An infinite entry's continuation shows at whatever phase it has reached when it's uncovered.
- **Shared properties in a natively repeating sequence** cover each other, because entries aren't merged.
- **Probes are global.** They're registered once per document and can't be unregistered.
