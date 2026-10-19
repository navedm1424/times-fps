## timesfps

`timesfps` is a TypeScript library for designing animations that play natively in the browser.

- **Truly fluid native springs.** Springs are fitted as cubic Béziers that follow the real motion within 0.1%, not sampled into `linear()` approximations.
- **Yoyo and mirror repeats.** Every other play runs backwards (`reverse`), or swaps its values while its easing keeps running forwards (`mirror`).
- **Repeat delays,** on animations and sequences alike.
- **Compounding nested repeats.** Sequences nest, and an animation repeating inside a repeating sequence plays all of its repeats in every iteration of the sequence.

It's built on the Web Animations API. You describe an animation once and map it onto elements and CSS values, and it runs as native animations, with no JavaScript per frame.

<br/><br/>

## Installation

```bash
npm install timesfps
# or
yarn add timesfps
# or
pnpm add timesfps
```

The library is written in TypeScript, ships as an ES module, and includes type definitions.

<br/><br/>

## Quick Start

```ts
import {animate, animation, eased} from "timesfps";

const fadeIn = animation(eased(0.4, 'easeOut'));

const controls = animate(fadeIn, {
    target: '.card',
    values: {
        opacity: {0: 0, 1: 1},
        scale: {0: 0.95, 1: 1}
    }
});
```

`animate` returns controls that play, pause, seek, cancel and finish everything it started together, and the native `Animation` objects themselves as `animations`.

<br/><br/>

## Transitions

A transition is how one play of an animation moves from start to end.

### Eased

```ts
import {eased} from "timesfps";

eased(0.4);                              // linear, 0.4 seconds
eased(0.4, 'easeInOut');                 // 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'easeInOut'
eased(0.6, [0.3, 1.6, 0.6, 1]);          // a cubic Bézier, as in CSS cubic-bezier()
eased(1, [4, 'jumpStart']);              // steps: 'jumpStart' | 'jumpEnd' | 'jumpNone' | 'jumpBoth'
eased(0);                                // jumps straight to the end values
```

`cubicBezier(x1, y1, x2, y2)` and `steps(count, position?)` write the same easings by name:

```ts
import {cubicBezier, eased, steps} from "timesfps";

eased(0.6, cubicBezier(0.3, 1.6, 0.6, 1));
eased(1, steps(4, 'jumpStart'));
```

### Springs

Springs come in three flavours. Each works out how long it runs.

```ts
import {spring} from "timesfps";

// Duration: comes to rest exactly at `duration`; `bounce` 0 means no overshoot.
spring({duration: 0.6, bounce: 0.3});

// Visual: `visualDuration` sets how fast it swings; it runs on until it's at rest.
spring({visualDuration: 0.4, bounce: 0.2});

// Physical: stiffness, damping and mass, as in m·x″ = −k·x − c·x′.
spring({stiffness: 260, damping: 22, mass: 1});
```

All three take an optional `velocity`, in progress per second. Physical springs also take `restDelta`, how close to the target counts as at rest.

`bounce` is between -1 and 1: 0 doesn't overshoot, towards 1 it bounces more, and below 0 it creeps in more slowly. Durations, stiffness, damping and mass must be positive, and `restDelta` between 0 and 1.

Springs are played as fitted cubic Bézier keyframes, within 0.1% of the true motion.

#### `visualDuration` here, in SwiftUI and in Motion

`visualDuration` is one swing of the spring, before damping: its natural frequency is 2π / `visualDuration`. `bounce` maps to the damping ratio as SwiftUI's does: 1 − `bounce` from 0 up, and 1 / (1 + `bounce`) below 0.

- **SwiftUI.** `Spring(duration:bounce:)` is the same spring. SwiftUI calls this `duration` the perceptual duration.
- **Motion.** The same `visualDuration` and `bounce` make a different spring in Motion:
    - Motion divides the frequency by 1.2, so its spring swings 1.2 times slower. Pass 1.2 × Motion's `visualDuration` to match it.
    - Motion keeps the damping ratio at 0.05 or more, so `bounce` stops having an effect at ±0.95.
    - Below 0, Motion speeds the spring up so that it arrives when a critically damped one would, and the bounce only changes its shape. Here, a negative bounce makes it arrive later.
    - Motion defaults `bounce` to 0.3; here it's required.
    - Motion ignores `velocity` on springs given by a duration; here every spring takes it.
- **Rest.** A spring here is at rest once it stays within 0.001 of its target, measured in progress, or within `restDelta` for a physical spring. It runs exactly that long, and closes the last of the gap evenly, so it never jumps. Motion samples the spring every 50 ms, stops at the first sample where both its speed and its distance from the target are below its thresholds, and jumps to the target there.

<br/><br/>

## Animations

```ts
import {AnimationDefinition, eased, stagger} from "timesfps";

const pulse = AnimationDefinition.of(eased(0.5, 'easeInOut'), {
    delay: 0.2,             // seconds, or a stagger
    repeatCount: 3,         // repetitions after the first play; Infinity repeats forever
    repeatDelay: 0.25,      // seconds between plays
    repeatMode: 'mirror'    // 'loop' | 'reverse' | 'mirror'
});
```

- **`loop`** starts every play from the beginning.
- **`reverse`** plays every other play backwards in time, easing included.
- **`mirror`** swaps the start and end values on every other play, but keeps the easing running forwards.

Invalid numbers (`NaN`, or infinite times) and negative durations throw. Negative delays and repeats become 0, and fractional repeat counts round down.

`animation(transition, options?)` is the same as `AnimationDefinition.of(transition, options?)`. Wherever an animation is taken, a transition with the options spread into it works too: `{...eased(0.3), delay: 0.1}`.

### Staggers

A stagger gives each target its own delay:

```ts
AnimationDefinition.of(eased(0.3), {
    delay: stagger(0.05)                                   // 0, 0.05, 0.1, …
});
AnimationDefinition.of(eased(0.3), {
    delay: stagger(0.05, {from: 'center', easing: 'easeOut'})
});
```

`from` is `'first'`, `'last'`, `'center'` or an index. `easing` spreads the delays along an easing.

<br/><br/>

## Sequences

A sequence lays named entries out in time. Entries are animations or other sequences.

```ts
import {AnimationDefinition, eased, spring, Sequence} from "timesfps";

const intro = Sequence.builder()
    .add('title', AnimationDefinition.of(spring({duration: 0.6, bounce: 0.2})))
    .add('subtitle', AnimationDefinition.of(eased(0.4, 'easeOut')), '-0.3')
    .add('button', AnimationDefinition.of(eased(0.3)), 'title<+0.2')
    .build({delay: 0.1});
```

An entry's position, its third argument, can be:

| Position     | Means                                                          |
|--------------|----------------------------------------------------------------|
| omitted      | right after the previous entry, the same as `'+0'`             |
| `1.5`        | 1.5 seconds from the start of the sequence                     |
| `'+0.2'`     | 0.2 seconds after the previous entry ends                      |
| `'-0.3'`     | 0.3 seconds before the previous entry ends                     |
| `'<+0.1'`    | 0.1 seconds after the previous entry starts (`'<-0.1'`: before) |
| `'<'`        | when the previous entry starts, the same as `'<+0'`            |
| `'title+0'`  | when the entry named `title` ends                              |
| `'title<+0'` | when the entry named `title` starts                            |
| `'title<'`   | the same as `'title<+0'`                                       |

An entry that repeats forever counts as ending after its first play. Names may only contain letters, digits and underscores. A sequence needs at least one entry, and a position that can't be parsed, or that refers to an entry that isn't an earlier one, throws as the entry is added.

Builders are mutable: `add` changes the builder and returns it. Two branches added to one builder both end up in it, so start each branch from its own builder.

### Nesting and repeating

Sequences nest, and take the same repeat options as animations:

```ts
const card = Sequence.builder()
    .add('lift', AnimationDefinition.of(eased(0.3, 'easeOut')))
    .add('glow', AnimationDefinition.of(eased(0.5)), '<')
    .build({repeatCount: 2, repeatDelay: 0.5, repeatMode: 'reverse'});

const page = Sequence.builder()
    .add('intro', intro)
    .add('card', card, '-0.2')
    .build();
```

Repeats compound: an animation that repeats inside a sequence that repeats plays all of its own repetitions in every iteration of the sequence. The exception is an animation that repeats forever. It plays only its first iteration in each iteration of the sequence, and carries on repeating once the sequence is done.

### Staggered sequences

A sequence's `delay` can be a stagger too. The sequence then plays once for each target index: the copy at index 2 plays the third target of each of its animations, and its positions chain within that copy alone.

```ts
const cards = Sequence.builder()
    .add('lift', AnimationDefinition.of(eased(0.3)))
    .add('glow', AnimationDefinition.of(eased(0.5)))
    .build({delay: stagger(0.1)});

animate(cards, {
    lift: {target: '.card', values: {scale: [1, 1.05]}},
    glow: {target: '.card .icon', values: {opacity: [0, 1]}}
});
```

Each card's icon glows once that card has lifted. Every animation inside a staggered sequence needs as many targets as the others. A stagger inside it gives its index its own delay, which pushes that entry on in that copy.

### Sequences played once

`sequence()` builds a sequence together with its targets and values, and plays it with `animate()`:

```ts
import {eased, sequence, spring} from "timesfps";

sequence()
    .add('title', 'h1', {opacity: [0, 1]}, {...spring({duration: 0.6, bounce: 0.2}), delay: 0.1})
    .add('h2', {opacity: [0, 1]}, eased(0.4, 'easeOut'), '-0.3')
    .add(sequence({repeatCount: 1}).add('#cta', {scale: [0.8, 1]}, eased(0.3)), 'title<+0.2')
    .animate();
```

`add(target, values, animation, position?)` adds an animation, and `add(sequence, position?)` a nested one. Either can take a name first, `add(name, …)`, for positions to refer to. Positions can only refer to names given before them, which the types check too; entries without a name can't be referred to. `sequence(options?)` takes the options `build` would.

The animation can carry the mapping's `composite` and `fill`, either spread into a transition with its options, `{...eased(0.3), delay: 0.1, composite: 'add'}`, or next to an animation, `{animation: fadeIn, fill: 'none'}`.

<br/><br/>

## Playing with WAAPI

```ts
import {animate} from "timesfps";

const controls = animate(definition, mapping, {scope, autoplay});
```

- `scope` is where selectors and target functions look for elements. It defaults to `document.documentElement`.
- `autoplay` is whether the animations start playing right away, which they do by default.

Each native animation's `id` is its entry's path and its property, such as `intro>title:opacity`, or just the property for an animation on its own.

### Controls

`animate` returns an `AnimationControls`:

- `play()`, `pause()`, `cancel()` and `finish()`, which throws while an animation repeats forever, as WAAPI's does;
- `seek(time)`, in seconds from the start of the definition;
- `playbackRate`;
- `startTime`, in seconds on the timeline, or `null` until it's resolved;
- `finished`, which settles once every animation has finished, and never while one repeats forever;
- `onFinish(listener)` and `onCancel(listener)`, which call the listener each time every animation has finished or been canceled, and return a function that removes it;
- `animations`, the native `Animation` objects.

Animations hold their end values after they end. To let go of them, cancel the controls once they've finished.

### Mappings

For an animation, the mapping says which elements to animate and which values to animate them through:

```ts
animate(pulse, {
    target: '.dot',
    values: {
        opacity: {0: 0.4, 0.5: 1, 1: 0.4},
        width: {0: 10, 1: '2em'}
    }
});
```

`composite` sets how the values combine with what's under them: `'replace'`, the default, `'add'` or `'accumulate'`, as in WAAPI.

`fill` is whether the entry holds its start values before it starts and its end values after it ends, as in WAAPI: `'none'`, `'backwards'`, `'forwards'` or `'both'`. It overrides what the entry would otherwise hold (see Overlaps), which is what it holds without one. With `'none'`, the entry stops showing once it ends, and whatever is under it shows again. With `'backwards'`, it holds its start values even while an earlier entry runs.

`MappingOf<typeof definition>` is the type of a definition's mapping, for writing one apart from the `animate` call.

For a sequence, the mapping mirrors its entries by name, nested sequences included:

```ts
animate(page, {
    intro: {
        title: {target: 'h1', values: {opacity: {0: 0, 1: 1}, translate: {0: '-40px', 1: '0px'}}},
        subtitle: {target: 'h2', values: {opacity: {0: 0, 1: 1}}},
        button: {target: '#cta', values: {scale: {0: 0.8, 1: 1}}}
    },
    card: {
        lift: {target: '.card', values: {scale: {0: 1, 1: 1.05}}},
        glow: {target: '.card', values: {'--glow': {0: '0px', 1: '24px'}}}
    }
});
```

### Targets

A target can be:

- an `Element`, or an array of them;
- a CSS selector, looked up in the scope;
- a function `(scope) => Element | Element[]`.

A target that matches nothing throws.

### Values

Values are keyed by progress, from 0 to 1. Progress is how far a play has gone through its change, not through its time. A list of values, such as `[0, 1]` or `[10, 40, 20]`, spreads them evenly from 0 to 1. Between keys, values change linearly with progress, and a spring that overshoots carries them past the end values.

A missing 1 takes the last given value. A missing 0 takes the value the property has as the entry starts: the value an earlier entry leaves it at, or, with none, the property's current value when `animate` is called. An entry that adds to what's under it takes its first given value instead.

A number takes the property's default unit: none for properties that take numbers (`opacity`, `scale`), `px` for lengths (`width`, `translate`), `deg` for angles (`rotate`). Any other value is CSS text the property takes.

**Values pass through to WAAPI as they are** when every keyframe lands on a value you gave. That's when the easing is a cubic Bézier, steps or linear, and either:
- it's a single play, which keeps its easing on the effect; or
- each play and each hold between them eases from one value to the next in one go, without values between 0 and 1.

Then any value works, including colours, filters and transforms, and the browser interpolates them itself.

**Otherwise values are resolved to numbers**, because keyframes fall between them: springs, and values between 0 and 1 in repeats that are played as keyframes, which are repeats with a repeat delay, in `mirror` mode, or inside a repeating sequence. An entry that starts while the one under it is between two values needs numbers too. Then every value must resolve to a single number:
- **a number with a unit**, such as `'2em'`, `'50%'` or `'0.5turn'`;
- **a CSS expression that resolves to one number**, such as `'calc(100% - 2rem)'` or `'var(--size)'`.

Values in different units are resolved against each target, so `{0: 10, 1: '2em'}` ends up in pixels for every element. If they still disagree after resolving, as with `px` and `%`, `animate` throws. An entry that starts from an earlier entry's value, or from the current value, shares its unit, so its values must resolve to that unit, and the current value must then be a single number with a unit.

Properties are written in camelCase (`backgroundPositionX`). Custom properties are written as they are (`'--glow'`), and should be given their units explicitly.

Where values need numbers, each property must take a single number. For compound values, animate a custom property registered with `@property` and use it in your CSS:

```css
@property --y {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
}

.card {
    translate: 0 var(--y);
}
```

```ts
animate(fadeUp, {target: '.card', values: {'--y': {0: '20px', 1: '0px'}}});
```

### Overlaps

When entries animate the same property of the same element, the one declared later shows over the earlier one while it runs. An earlier entry that falls entirely within a later one is dropped, unless the later one adds to it. Only the entry that starts first holds its start values before it starts. An entry holds its end values after it ends, unless one declared before it is still running. A mapping's `fill` overrides both.

<br/><br/>

## Not Yet Supported

- Properties that take more than one value at once, like `transform` or a two-value `translate`, where values need numbers. Use individual properties or a registered custom property instead.

<br/><br/>

## API Overview

- **Transitions**
    - `eased(duration, easing?)`: a timed transition with a CSS easing.
    - `cubicBezier(x1, y1, x2, y2)` and `steps(count, position?)`: easings for `eased`.
    - `spring(options)`: a duration, visual or physical spring.
- **`animation(transition, options?)`**, or **`AnimationDefinition.of(transition, options?)`**: an animation, with `delay`, `repeatCount`, `repeatDelay` and `repeatMode`.
- **`stagger(each, {from?, easing?})`**: a per-target delay.
- **`Sequence.builder()`**: builds a sequence.
    - `.add(name, animation, position?)`, `.add(name, {...transition, ...options}, position?)` or `.add(name, sequence, position?)` adds an entry.
    - `.build(options?)` takes a `delay`, which can be a stagger, and the repeat options.
- **`animate(definition, mapping, {scope?, autoplay?}?)`**: plays a definition on elements and returns its `AnimationControls`.
- **`sequence(options?)`**: builds a sequence with its targets and values.
    - `.add(name?, target, values, animation, position?)` or `.add(name?, sequence, position?)` adds an entry; the animation can be `{...transition, ...options, composite?, fill?}` or `{animation, composite?, fill?}`.
    - `.animate({scope?, autoplay?}?)` plays it.

Everything is exported from the root `timesfps` entry point, along with the types of every option and mapping.
