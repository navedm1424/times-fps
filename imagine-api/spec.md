# Animation Definition API — Specification

## 1. Purpose

This API defines animations without knowing what they animate. A definition describes the **timing** of changes: how long each change takes, how it progresses, when it happens relative to other changes, and how often it happens. It never describes **values**, **properties** or **targets**.

Work happens in two phases:

1. **Definition.** Animations and sequences are built from transitions, tweens and positions. Definitions are engine-agnostic and reusable.
2. **Adaptation.** An adapter takes a definition plus a **mapping** that supplies targets and values, and turns them into something an engine can play, such as WAAPI keyframe effects or Motion animations.

Because definitions don't know about values, one definition can drive any number of targets and properties, and one definition can be adapted for different engines.

## 2. The core abstraction: a change

Every change is a progression from **0 to 1**. The definition knows only that something goes from 0 to 1. What 0, 1, or 0.5 *mean* (an opacity, a translation, a colour) is decided in the mapping.

A definition answers four questions about each change:

| Question | Answered by |
|---|---|
| How long does it take? | A transition's duration, or a share (ratio) of an animation's duration |
| How does it progress? | A transition's easing or spring |
| When does it happen relative to everything else? | A sequence entry's position (`at`) |
| How often does it happen? | `Repeat` |

### Units

| Type | Meaning |
|---|---|
| `Seconds` | Time |
| `Ratio` | A share of an animation's duration, from 0 to 1 |
| `Progress` | A position on the 0→1 change axis |

## 3. Transitions: how long and how

A transition describes a change's duration and the shape of its progress. Transitions vary by `type`.

### 3.1 Eased transition

```ts
{ type: 'eased', duration, easing? }
```

A fixed duration with an easing curve.

```ts
type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | CubicBezierDefinition;
```

`CubicBezierDefinition` is the four control-point coordinates `[x1, y1, x2, y2]`.

### 3.2 Spring transitions

A spring transition comes in one of two forms. Both share `type: 'spring'`.

**Physical spring.** Defined by `stiffness`, `damping` and an optional `mass`. A physical spring **works out its own duration**: it runs until it comes to rest.

```ts
{ type: 'spring', stiffness, damping, mass?, velocity?, restDelta? }
```

**Perceptual spring.** Defined by a `duration` and a `bounce` (0 means no overshoot). The spring's shape is stretched to fit the given duration.

```ts
{ type: 'spring', duration, bounce, velocity? }
```

### 3.3 Spring quantities are in progress units

Values are abstract, so spring quantities that would normally be in value units are measured on the 0→1 change axis:

- `velocity` is in **progress per second**.
- `restDelta` is a **`Progress`**, the distance from the end, as a fraction of the change, at which the spring counts as at rest.

This is sound because a spring's motion is linear in its distance. A spring from 0 to 1 is a scaled copy of the same spring between any two values.

### 3.4 Factories

```ts
eased(duration, easing?)   // → EasedTransition
spring({ stiffness, damping, mass?, velocity?, restDelta? })  // → PhysicalSpringTransition
spring({ duration, bounce, velocity? })                       // → PerceptualSpringTransition
```

The factories return plain transition objects. They're a convenience, so writing the object literal directly is equivalent.

### 3.5 Stretchable transitions

```ts
type StretchableTransition =
    | Omit<EasedTransition, 'duration'>
    | Omit<PerceptualSpringTransition, 'duration'>;
```

Some tweens get their duration from outside (see §5.2). They can only take transitions whose shape can be stretched over a given duration: an eased transition's easing, or a perceptual spring's bounce. A physical spring can't appear there, because it works out its own duration, which would conflict with the one it's given.

## 4. Repeat: how often

```ts
interface Repeat {
    count: number;         // repetitions after the first play
    delay?: Seconds;
    mode?: 'loop' | 'reverse' | 'mirror';
}
```

- **`count`** is the number of repetitions *after* the first play. `count: 2` plays three times in total. `Infinity` is a valid count where infinite repetition is allowed. Where it isn't, it's rejected at runtime, not by the types.
- **`delay`** is the pause *between* plays. It never follows the last play.
- **`mode`**:
  - `loop`: every play runs forwards.
  - `reverse`: every other play runs backwards in time, so its easing is reversed too.
  - `mirror`: every other play swaps the start and end and keeps the easing running forwards. This is usually what you want for springs, because a spring played backwards in time starts wobbly and ends calm.

Where `Repeat` can appear, and whether it can be infinite:

| On | Infinite allowed |
|---|---|
| Timed tween | No |
| Animation (any kind) | Yes |
| Sequence | Yes, unless the sequence contains an infinitely repeating animation. That's rejected at runtime. |

## 5. Tweens

A **tween** is a single change: one span going from 0 to 1. It's the smallest unit of an animation. A tween has a `name`, which the mapping uses to supply its value (§8).

There are two kinds of tween, matching the two ways an animation can manage time.

### 5.1 Timed tween

```ts
interface TimedTween<Name> {
    name: Name;
    transition: Transition;
    delay?: Seconds;
    repeat?: Repeat;       // count must be finite
}
```

A timed tween owns its time. Its transition supplies its duration: an eased transition or perceptual spring states it, and a physical spring works it out. It can wait for `delay` before starting, and it can repeat a finite number of times.

### 5.2 Ratio tween

```ts
interface RatioTween<Name> {
    name: Name;
    ratio?: Ratio;
    transition?: StretchableTransition;
}
```

A ratio tween gets its time from its animation. `ratio` is its share of the animation's duration. Ratio tweens that leave `ratio` out split whatever duration is left equally among themselves. A ratio tween has no delay and no repeat. A pause can be made with a tween whose start and end values are the same in the mapping.

## 6. Animations

An animation is one or more tweens that **run one after another**. Each tween starts where the previous one ended. Animations are made with `Animation.of`, and come in three kinds, told apart by `type`.

Animations **have no name**. They only gain an identity when they're placed in a sequence, as a named entry (§7). A single animation definition can therefore be placed many times under different names.

Every animation can have a `repeat`, and infinite repetition is allowed.

### 6.1 Simple animation: `type: 'simple'`

```ts
Animation.of(transition, repeat?)
```

A single tween. The animation is the tween, so there are no tween names. Its transition supplies both duration and easing.

### 6.2 Self-timed animation: `type: 'self-timed'`

```ts
Animation.of(transition, ratioTweens, repeat?)
```

The **animation owns the time**. Its `transition` (any `Transition`, including a physical spring) has two roles:

- **Duration:** it supplies the animation's total duration, which the tweens divide among themselves by ratio (§5.2).
- **Easing:** its easing or spring curve runs across the whole animation and **compounds** with each tween's own transition. The animation's curve shapes overall progress through the animation, and each tween's curve shapes progress within that tween's span.

### 6.3 Tween-timed animation: `type: 'tween-timed'`

```ts
Animation.of(timedTweens, repeat?)
```

**Each tween owns its time** (§5.1). The animation's duration is the total of its tweens' delays, durations and repeats.

This kind has no animation-level easing. Compound easing has been deliberately left out for now and may be added later.

### 6.4 Multi-tween animations

`MultiTweenAnimation` is the union of the self-timed and tween-timed kinds. Both name their tweens, and their mappings take a value per tween (§8).

### 6.5 Parallel changes on one target

Within an animation, tweens run one after another. Changes that should run at the same time with different timing (for example, a quick fade alongside a slow spring) are **separate animations**, placed in a sequence so they start together (`'>+0'`) and mapped to the same target.

## 7. Sequences: when

A sequence places animations, and other sequences, on a shared timeline.

### 7.1 Building

```ts
Sequence.builder()
    .add(name, animationOrSequence, at?, stagger?)
    ...
    .build(repeat?)
```

- Every entry has a **name**, which must be unique within its sequence. The name is the entry's identity. Positions refer to entries by name (§7.3), and the mapping is keyed by name (§8).
- There are three kinds of entry: a simple animation entry, a multi-tween animation entry, and a nested sequence entry. The kind is tracked in the types so the mapping can be derived from it.
- `stagger` is only available on animation entries.
- `build(repeat?)` produces the `Sequence` and optionally sets how it repeats.
- Entries keep the order they were added in. How that order is stored is an implementation detail and isn't reflected in the types.

### 7.2 Nesting

A sequence can be an entry in another sequence. It behaves as one unit on the outer timeline: its start is its first entry's start, and its last referenceable point is the latest last referenceable point of its entries (§7.4).

### 7.3 Positions (`at`)

```ts
type AtOperator = '+' | '-' | '>+' | '>-';

type At<N> =
    | Seconds
    | `${AtOperator}${number}`
    | `${N}${AtOperator}${number}`;
```

| Form | Meaning |
|---|---|
| `n` (a number) | Absolute time from the start of the sequence |
| `+n` / `-n` | Relative to the previous entry's last referenceable point |
| `>+n` / `>-n` | Relative to the previous entry's start |
| `name+n` / `name-n` | Relative to the named entry's last referenceable point |
| `name>+n` / `name>-n` | Relative to the named entry's start |

- **No sign-less relative form exists.** Starting exactly at the previous end is `'+0'`, and starting with it is `'>+0'`.
- **References can only point backwards.** `N` is the set of names of entries added earlier, so the types reject references to the entry itself or to later entries.
- **References are local.** They resolve within the same sequence and can't reach into nested sequences.
- **An omitted `at` means `'+0'`:** start when the previous entry ends.
- **The first entry's previous point** is the start of the sequence, so a relative position on the first entry counts from there.

### 7.4 Last referenceable point

`+` and `-` positions resolve against an entry's **last referenceable point**:

- **Finite animation:** its end, including all repetitions. A repeat delay never follows the last play, so it doesn't extend the end.
- **Infinitely repeating animation:** infinity can't be referenced, so the last referenceable point is the **end of its first iteration**. The animation keeps running while later entries play.
- **Nested sequence:** the latest last referenceable point among its entries.

### 7.5 Stagger

```ts
type Stagger = (index: number, total: number) => Seconds;

stagger(each, { from?, easing? })   // → Stagger
```

Stagger applies when an animation entry is mapped to several targets. A stagger is a function that takes a target's index and the total number of targets, and returns that target's start delay.

The `stagger` factory builds the common case. Each target starts `each` seconds after the next one closer to the origin given by `from`: `'first'`, `'last'`, `'center'`, or a target index. `easing` distributes the start delays non-linearly across the targets. Any other pattern can be written as a function directly.

Stagger is a timing decision, so it belongs in the definition, even though the number of targets is only known at adaptation.

## 8. Adaptation

### 8.1 Adapter

```ts
interface Adapter<Output> {
    adapt<const Definition extends Sequence | Animation>(
        definition: Definition,
        mapping: MappingOf<Definition>,
    ): Output;
}
```

An adapter accepts either a sequence or a single animation, together with a mapping whose shape is **derived from the definition's type**. The compiler therefore requires exactly the right keys: every entry name, and every tween name of every multi-tween animation.

`Target` and `Value` are the adapter's target and value types, such as `Element` and CSS values for WAAPI. The definition never constrains them. A consumer can pass several targets where the adapter's `Target` type allows it, and stagger (§7.5) then applies.

### 8.2 Property values

```ts
type PropertyValues = { [property: string]: Value };
```

`PropertyValues` gives one value per property. It's where the abstract 0 and 1 of a change become concrete values.

### 8.3 Simple animation mapping

```ts
{ target, from: PropertyValues, to: PropertyValues }
```

The start and end values. A simple animation has exactly one change, so these are its 0 and 1.

### 8.4 Multi-tween animation mapping

```ts
{ target, from: PropertyValues, to: { [tweenName]: PropertyValues } }
```

`from` is the animation's start values. `to` maps each named tween to its **end** values, and each tween starts from the previous tween's end values. The first tween starts from `from`.

### 8.5 Sequence mapping

A sequence's mapping is an object keyed by entry name:

- An **animation entry** takes the mapping for its animation kind (§8.3 or §8.4).
- A **nested sequence entry** takes a nested sequence mapping, keyed by the nested sequence's entry names.

The mapping therefore mirrors the shape of the sequence tree.

### 8.6 Telling definitions apart

Every sequence is structurally also an animation, because `Animation`'s only member is the optional `repeat`. `MappingOf` therefore checks for `Sequence` first and falls back to the animation mappings.

## 9. Example

```ts
const fadeIn = Animation.of(eased(0.2, 'ease-out'));             // simple
const rise = Animation.of(spring({ stiffness: 260, damping: 22 })); // simple, duration from physics

const heartbeat = Animation.of(                                  // tween-timed
    [
        { name: 'grow', transition: spring({ duration: 0.3, bounce: 0.4 }) },
        { name: 'settle', transition: eased(0.25, 'ease-in-out'), delay: 0.08 },
    ],
    { count: Infinity, delay: 0.9 },
);

const nudge = Animation.of(                                      // self-timed
    eased(0.48, 'ease-out'),                                     // 0.48s total; ease-out compounds
    [
        { name: 'away', ratio: 0.2 },
        { name: 'back', ratio: 0.3, transition: { type: 'eased', easing: 'ease-in-out' } },
        { name: 'home', transition: { type: 'spring', bounce: 0.5 } },  // the remaining 0.5
    ],
);

const reveal = Sequence.builder()
    .add('backdrop', fadeIn)
    .add('card', rise, '>+0.08')     // 0.08s after backdrop starts
    .build();

const intro = Sequence.builder()
    .add('reveal', reveal)
    .add('badge', heartbeat, '+0.3') // 0.3s after reveal ends
    .add('cta', fadeIn, '+0')        // after badge's first beat; badge keeps beating
    .add('hint', nudge, '>+0')       // together with cta
    .build();

const effects = waapi.adapt(intro, {
    reveal: {
        backdrop: { target: backdrop, from: { opacity: 0 }, to: { opacity: 1 } },
        card: { target: card, from: { opacity: 0, translate: '0 24px' }, to: { opacity: 1, translate: '0 0' } },
    },
    badge: { target: badge, from: { scale: 1 }, to: { grow: { scale: 1.15 }, settle: { scale: 1 } } },
    cta: { target: cta, from: { opacity: 0 }, to: { opacity: 1 } },
    hint: {
        target: arrow,
        from: { translate: '0 0' },
        to: { away: { translate: '-6px 0' }, back: { translate: '8px 0' }, home: { translate: '0 0' } },
    },
});
```

The same `fadeIn` definition is placed twice, as `backdrop` and `cta`, and mapped to different targets. Its identity comes from the entry name, not from the animation.

## 10. Decision summary

| Decision | Rationale |
|---|---|
| Definitions are value-free; every change is 0→1 | One definition serves any properties, targets and engine |
| Duration lives in the transition | A physical spring's duration comes from its physics, so duration and progress shape can't be separated |
| Transitions vary by `type`; easings are only curves | Springs are transitions, not easings |
| Spring velocity and rest threshold are in progress units | Value units don't exist at definition time; spring motion scales linearly with distance |
| Ratio tweens take only duration-less transitions | Their duration is given to them; a physical spring would conflict with it |
| Two multi-tween kinds: animation-owned time (self-timed) and tween-owned time (tween-timed) | The two ways a designer budgets time |
| Self-timed animations take a full `Transition` | It supplies both the total duration and a curve that compounds with the tweens' curves |
| No animation-level easing on tween-timed animations | Deliberately left out for now |
| Infinite repeat on animations and sequences, never on tweens | A tween inside an animation must end for the next tween to start |
| Animations are unnamed; entries are named | The same animation can be placed many times; identity belongs to the placement |
| Motion-style string positions with backward-only named references | Short to write, and the types catch references to entries that don't exist yet |
| `+`/`-` resolve to the last referenceable point | Infinity can't be referenced, so the end of the first iteration is used instead |
| Mappings derived from definition types | The compiler requires every entry and tween to be given values |
| Simple mappings take start and end only; multi-tween mappings take a start plus one value per tween | Keeps mappings simple; intermediate values are made with more tweens |
| Mapping nested by sequence | Mirrors the definition tree; entry names only need to be unique within their own sequence |
| Stagger defined in the definition, targets supplied in the mapping | Stagger is timing; how many targets there are is binding |
| Entry order is an implementation detail | Not reflected in the types |
