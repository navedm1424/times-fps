## times-fps

`times-fps` is a TypeScript library for designing animations that play natively in the browser.

- **Truly fluid native springs.** Springs are fitted as cubic Béziers that follow the real motion within 0.1%, not sampled into `linear()` approximations.
- **Yoyo and mirror repeats.** Every other play runs backwards (`reverse`), or swaps its values while its easing keeps running forwards (`mirror`).
- **Repeat delays,** on animations and sequences alike.
- **Compounding nested repeats.** Sequences nest, and an animation repeating inside a repeating sequence plays all of its repeats in every iteration of the sequence.

It's built on the Web Animations API. You describe an animation once and map it onto elements and CSS values, and it runs as native animations, with no JavaScript per frame.

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

## Quick Start

```ts
import {AnimationDefinition, eased, WAAPIAdapter} from "times-fps";

const fadeIn = AnimationDefinition.of(eased(0.4, 'easeOut'));

const adapter = new WAAPIAdapter();
const animations = adapter.animate(fadeIn, {
    target: '.card',
    values: {
        opacity: {0: 0, 1: 1},
        scale: {0: 0.95, 1: 1}
    }
});
```

`animate` returns the native `Animation` objects it creates, so you can `pause()`, `cancel()` or await `finished` on them as usual.

<br/><br/>

## Transitions

A transition is how one play of an animation moves from start to end.

### Eased

```ts
import {eased} from "times-fps";

eased(0.4);                              // linear, 0.4 seconds
eased(0.4, 'easeInOut');                 // 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'easeInOut'
eased(0.6, [0.3, 1.6, 0.6, 1]);          // a cubic Bézier, as in CSS cubic-bezier()
eased(1, [4, 'jumpStart']);              // steps: 'jumpStart' | 'jumpEnd' | 'jumpNone' | 'jumpBoth'
```

### Springs

Springs come in three flavours. Each works out how long it runs.

```ts
import {spring} from "times-fps";

// Perceptual: comes to rest exactly at `duration`; `bounce` 0 means no overshoot.
spring({duration: 0.6, bounce: 0.3});

// Visual: `visualDuration` sets how fast it swings; it runs on until it's at rest.
spring({visualDuration: 0.4, bounce: 0.2});

// Physical: stiffness, damping and mass, as in m·x″ = −k·x − c·x′.
spring({stiffness: 260, damping: 22, mass: 1});
```

All three take an optional `velocity`, in progress per second. Physical springs also take `restDelta`, how close to the target counts as at rest.

Springs are played as fitted cubic Bézier keyframes, within 0.1% of the true motion.

<br/><br/>

## Animations

```ts
import {AnimationDefinition, eased, stagger} from "times-fps";

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

Invalid numbers (`NaN`, or infinite times) throw. Negative delays and repeats become 0, and fractional repeat counts round down.

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
import {AnimationDefinition, eased, spring, Sequence} from "times-fps";

const intro = Sequence.builder()
    .add('title', AnimationDefinition.of(spring({duration: 0.6, bounce: 0.2})))
    .add('subtitle', AnimationDefinition.of(eased(0.4, 'easeOut')), '-0.3')
    .add('button', AnimationDefinition.of(eased(0.3)), 'title>+0.2')
    .build({delay: 0.1});
```

An entry's position, its third argument, can be:

| Position     | Means                                                          |
|--------------|----------------------------------------------------------------|
| omitted      | right after the previous entry, the same as `'+0'`             |
| `1.5`        | 1.5 seconds from the start of the sequence                     |
| `'+0.2'`     | 0.2 seconds after the previous entry ends                      |
| `'-0.3'`     | 0.3 seconds before the previous entry ends                     |
| `'>+0.1'`    | 0.1 seconds after the previous entry starts (`'>-0.1'`: before) |
| `'title+0'`  | when the entry named `title` ends                              |
| `'title>+0'` | when the entry named `title` starts                            |

An entry that repeats forever counts as ending after its first play. Names may only contain letters, digits and underscores.

### Nesting and repeating

Sequences nest, and take the same repeat options as animations:

```ts
const card = Sequence.builder()
    .add('lift', AnimationDefinition.of(eased(0.3, 'easeOut')))
    .add('glow', AnimationDefinition.of(eased(0.5)), '>+0')
    .build({repeatCount: 2, repeatDelay: 0.5, repeatMode: 'reverse'});

const page = Sequence.builder()
    .add('intro', intro)
    .add('card', card, '-0.2')
    .build();
```

Repeats compound: an animation that repeats inside a sequence that repeats plays all of its own repetitions in every iteration of the sequence. The exception is an animation that repeats forever. It plays only its first iteration in each iteration of the sequence, and carries on repeating once the sequence is done.

<br/><br/>

## Playing with WAAPI

```ts
const adapter = new WAAPIAdapter();
adapter.animate(definition, mapping, scope);
```

### Mappings

For an animation, the mapping says which elements to animate and which values to animate them through:

```ts
adapter.animate(pulse, {
    target: '.dot',
    values: {
        opacity: {0: 0.4, 0.5: 1, 1: 0.4},
        width: {0: 10, 1: '2em'}
    }
});
```

For a sequence, the mapping mirrors its entries by name, nested sequences included:

```ts
adapter.animate(page, {
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

The scope defaults to `document.documentElement`. A target that matches nothing throws.

### Values

Values are keyed by progress, from 0 to 1. Progress is how far a play has gone through its change, not through its time. A missing 0 or 1 takes the nearest value. Between keys, values change linearly with progress, and a spring that overshoots carries them past the end values.

A value can be:

- **a number**, which takes the property's default unit: none for properties that take numbers (`opacity`, `scale`), `px` for lengths (`width`, `translate`), `deg` for angles (`rotate`);
- **a number with a unit**, such as `'2em'`, `'50%'` or `'0.5turn'`;
- **any CSS expression that resolves to one number**, such as `'calc(100% - 2rem)'` or `'var(--size)'`.

Values in different units are resolved against each target, so `{0: 10, 1: '2em'}` ends up in pixels for every element. If they still disagree after resolving, as with `px` and `%`, `animate` throws.

Properties are written in camelCase (`backgroundPositionX`). Custom properties are written as they are (`'--glow'`), and should be given their units explicitly.

Each property must take a single numeric value. For compound values, animate a custom property registered with `@property` and use it in your CSS:

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
adapter.animate(fadeUp, {target: '.card', values: {'--y': {0: '20px', 1: '0px'}}});
```

### Overlaps

When entries animate the same property of the same element, the one declared later shows over the earlier one while it runs. An earlier entry that falls entirely within a later one is dropped. Only the entry that starts first holds its start values before it starts. An entry holds its end values after it ends, unless one declared before it is still running.

<br/><br/>

## Not Yet Supported

- Animations made of timed tweens, `AnimationDefinition.of([...tweens])`, can be defined, but the WAAPI adapter doesn't play them yet.
- Properties that take more than one value at once, like `transform` or a two-value `translate`. Use individual properties or a registered custom property instead.

<br/><br/>

## API Overview

- **Transitions**
    - `eased(duration, easing?)`: a timed transition with a CSS easing.
    - `spring(options)`: a perceptual, visual or physical spring.
- **`AnimationDefinition.of(transition, options?)`**: an animation, with `delay`, `repeatCount`, `repeatDelay` and `repeatMode`.
- **`stagger(each, {from?, easing?})`**: a per-target delay.
- **`Sequence.builder()`**: builds a sequence.
    - `.add(name, animationOrSequence, position?)` adds an entry.
    - `.build(options?)` takes a `delay` and the repeat options.
- **`new WAAPIAdapter().animate(definition, mapping, scope?)`**: plays a definition on elements and returns the native `Animation`s.

Everything is exported from the root `times-fps` entry point, along with the types of every option and mapping.
