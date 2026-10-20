import type {PropertyStops, StopValue} from "../resolution/stops.js";
import type {Seconds} from "../types.js";
import {landsOnStops} from "./native-effects.js";
import type {PlacedEffect, ResolvedEffect} from "./tracks.js";

/** What resolving values needs from the page. */
export interface CSSValueResolver {
    /** The property's value on the target as it is now. */
    currentValueOf(target: Element, property: string): string;
    /** Whether the property takes the value. */
    accepts(property: string, text: string): boolean;
    /** The value's computed form on the target. */
    resolve(target: Element, property: string, text: string): string;
}

/** Takes values as plain numbers without a unit, for tracks that stand in for no property of an element. */
export const plainNumberResolver: CSSValueResolver = {
    currentValueOf: (_target, property) => {
        throw new Error(`"${property}" has no current value off the page, so it needs a value at 0.`);
    },
    accepts: () => true,
    resolve: (_target, _property, text) => text
};

/** An entry's effects on one track, which share its stops. */
interface EntryEffects {
    stops: PropertyStops;
    effects: PlacedEffect[];
    /** When its first effect starts. */
    start: Seconds;
    /** Where its first effect is declared on the track. */
    declaredIndex: number;
}

/**
 * Resolves the values of a track's effects, and gives each effect its unit, or none when its values pass through to WAAPI as CSS text.
 * An entry without a value at 0 starts from the value the track shows as it starts, which makes it depend on the effect showing it.
 * Entries that depend on each other make a chain, and a chain whose first entry has no value at 0 starts from the property's current value.
 * Values pass through when every keyframe of their effect lands on a stop with text; a chain with any other effect is resolved to numbers in one unit.
 */
export function resolveEffectChains(target: Element, property: string, effects: readonly PlacedEffect[], resolver: CSSValueResolver): ResolvedEffect[] {
    const entries = entryEffectsOf(effects);
    const declaredIndices = new Map(effects.map((effect, index) => [effect, index]));
    const chains = new Map<EntryEffects, EntryEffects[]>();
    const predecessors = new Map<EntryEffects, PlacedEffect>();
    const ordered = [...entries].sort((first, second) => first.start - second.start || first.declaredIndex - second.declaredIndex);
    ordered.forEach((entry, index) => {
        const predecessor = entry.stops.startValue.given
            ? undefined
            : shownEffectAt(entry.start, ordered.slice(0, index), declaredIndices);
        if (!predecessor) {
            chains.set(entry, [entry]);
            return;
        }
        const chain = chains.get(entryOf(predecessor, entries))!;
        chain.push(entry);
        chains.set(entry, chain);
        predecessors.set(entry, predecessor);
    });

    const startsBetweenStops = new Set<EntryEffects>();
    for (const entry of ordered) {
        const start = entry.stops.startValue;
        if (start.given) continue;
        const predecessor = predecessors.get(entry);
        const startText = predecessor ? stopValueShownAt(predecessor, entry.start)?.text : resolver.currentValueOf(target, property);
        if (startText === undefined) startsBetweenStops.add(entry);
        else start.adoptText(startText);
    }

    const passing = new Set(effects.filter(effect => landsOnStops(effect) && !startsBetweenStops.has(entryOf(effect, entries))));
    const units = new Map<EntryEffects[], string>();
    for (const chain of new Set(chains.values())) {
        if (chain.every(({effects}) => effects.every(effect => passing.has(effect))))
            checkGivenValues(property, chain, resolver);
        else
            units.set(chain, resolveChainValues(target, property, chain, resolver));
    }
    for (const entry of ordered) {
        if (startsBetweenStops.has(entry)) entry.stops.startValue.assignNumber(valueShownAt(predecessors.get(entry)!, entry.start)!);
    }

    return effects.map(effect => ({...effect, unit: passing.has(effect) ? undefined : units.get(chains.get(entryOf(effect, entries))!)!}));
}

function entryEffectsOf(effects: readonly PlacedEffect[]): EntryEffects[] {
    const entries = new Map<PropertyStops, EntryEffects>();
    effects.forEach((effect, index) => {
        const entry = entries.get(effect.entryStops);
        if (entry) {
            entry.effects.push(effect);
            entry.start = Math.min(entry.start, effect.delay);
        } else
            entries.set(effect.entryStops, {stops: effect.entryStops, effects: [effect], start: effect.delay, declaredIndex: index});
    });
    return [...entries.values()];
}

function entryOf(effect: PlacedEffect, entries: readonly EntryEffects[]): EntryEffects {
    return entries.find(entry => entry.stops === effect.entryStops)!;
}

/** The effect declared last among the entries' effects that show a value at `time`. */
function shownEffectAt(time: Seconds, entries: readonly EntryEffects[], declaredIndices: ReadonlyMap<PlacedEffect, number>): PlacedEffect | undefined {
    return entries
        .flatMap(({effects}) => effects)
        .filter(effect => iterationTimeAt(effect, time) !== undefined)
        .sort((first, second) => declaredIndices.get(first)! - declaredIndices.get(second)!)
        .at(-1);
}

function valueShownAt(effect: PlacedEffect, time: Seconds): number | undefined {
    const iterationTime = iterationTimeAt(effect, time);
    return iterationTime === undefined ? undefined : effect.run.valueAt(iterationTime);
}

function stopValueShownAt(effect: PlacedEffect, time: Seconds): StopValue | undefined {
    const iterationTime = iterationTimeAt(effect, time);
    return iterationTime === undefined ? undefined : effect.run.stopValueAt(iterationTime);
}

/** Throws for a given value the property doesn't take, without resolving it. */
function checkGivenValues(property: string, chain: readonly EntryEffects[], resolver: CSSValueResolver): void {
    for (const {stops} of chain) {
        for (const value of stops.values) {
            if (value.given && !resolver.accepts(property, value.text!))
                throw new Error(`"${value.text}" isn't a value "${property}" takes.`);
        }
    }
}

/** Where in its run the effect is at `time`, as WAAPI works it out, or undefined when it shows nothing then. */
function iterationTimeAt({delay, duration, iterations, direction, fill}: PlacedEffect, time: Seconds): Seconds | undefined {
    const elapsed = time - delay;
    const activeDuration = duration === 0 ? 0 : duration * iterations;
    let iteration: number;
    let iterationTime: Seconds;
    if (elapsed < 0) {
        if (fill !== 'backwards' && fill !== 'both') return undefined;
        [iteration, iterationTime] = [0, 0];
    } else if (elapsed >= activeDuration) {
        if (fill !== 'forwards' && fill !== 'both') return undefined;
        [iteration, iterationTime] = [Math.max(Math.ceil(iterations) - 1, 0), duration];
    } else {
        iteration = Math.floor(elapsed / duration);
        iterationTime = elapsed - iteration * duration;
    }
    const backwards = direction === 'reverse'
        || (direction === 'alternate' && iteration % 2 === 1)
        || (direction === 'alternate-reverse' && iteration % 2 === 0);
    return backwards ? duration - iterationTime : iterationTime;
}

/**
 * Resolves the values of the chain that have text to numbers in one unit, and gives that unit.
 * Without a value at 0, the chain starts from the property's current value, whose unit the rest must resolve to.
 * Otherwise values that are all numbers in one unit are taken as they are; failing that, the expressions are resolved, and failing that, every value is.
 */
function resolveChainValues(target: Element, property: string, chain: readonly EntryEffects[], resolver: CSSValueResolver): string {
    const [first] = chain;
    const values = chain.flatMap(({stops}) => stops.values).filter(value => value.text !== undefined);
    const resolvedNumericOf = (text: string): Numeric => {
        if (!resolver.accepts(property, text))
            throw new Error(`"${text}" isn't a value "${property}" takes.`);
        const resolved = resolver.resolve(target, property, text);
        const numeric = parseNumeric(resolved);
        if (!numeric) throw new Error(`"${text}" resolves to "${resolved}" for "${property}", which isn't a single number with a unit.`);
        return numeric;
    };

    if (!first!.stops.startValue.given) {
        const current = first!.stops.startValue.text!;
        const currentNumeric = parseNumeric(current);
        if (!currentNumeric)
            throw new Error(`"${property}" is "${current}" now, which isn't a single number with a unit, so it needs a value at 0.`);
        for (const value of values) {
            const given = parseNumeric(value.text!);
            const numeric = given?.unit === currentNumeric.unit ? given : resolvedNumericOf(value.text!);
            if (numeric.unit !== currentNumeric.unit)
                throw new Error(`"${value.text}" resolves to a value in "${numeric.unit}" for "${property}", whose current value is in "${currentNumeric.unit}". ${sameUnitAdvice}`);
            value.assignNumber(numeric.value);
        }
        return currentNumeric.unit;
    }

    const given = values.map(value => parseNumeric(value.text!));
    const givenUnits = new Set(given.map(numeric => numeric?.unit));
    if (givenUnits.size === 1 && !givenUnits.has(undefined)) {
        const unit = given[0]!.unit;
        if (!resolver.accepts(property, `1${unit}`))
            throw new Error(`"${property}" doesn't take values in "${unit}".`);
        values.forEach((value, index) => value.assignNumber(given[index]!.value));
        return unit;
    }

    let numerics = values.map((value, index) => given[index] ?? resolvedNumericOf(value.text!));
    if (new Set(numerics.map(({unit}) => unit)).size > 1)
        numerics = values.map((value, index) => given[index] ? resolvedNumericOf(value.text!) : numerics[index]!);
    const units = new Set(numerics.map(({unit}) => unit));
    if (units.size > 1)
        throw new Error(`The values of "${property}" resolve to different units: ${[...units].map(unit => `"${unit}"`).join(', ')}. ${sameUnitAdvice}`);
    values.forEach((value, index) => value.assignNumber(numerics[index]!.value));
    return numerics[0]!.unit;
}

const sameUnitAdvice = "Use values in one unit, or expressions that resolve to one. "
    + "To have values passed through as they are, use only native easings (cubic Bézier, steps or linear), "
    + "give no values between 0 and 1 to an animation whose repeats are played as keyframes: one with a repeat delay, in mirror mode, or inside a repeating sequence, "
    + "and don't start an entry without a value at 0 while the one under it is between two of its values.";

interface Numeric {
    value: number;
    unit: string;
}

const numericPattern = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)\s*$/i;

/** A number with an optional unit, the only form whose value is known without resolving it. */
export function parseNumeric(text: string): Numeric | undefined {
    const [, number, unit] = numericPattern.exec(text) ?? [];
    return number === undefined ? undefined : {value: Number(number), unit: unit!.toLowerCase()};
}
