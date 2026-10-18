import {checkNumber} from "../utils.js";
import type {CSSValue, ValueStops} from "./mapping.js";
import {PropertyStops} from "./stops.js";
import type {TargetValues} from "./tracks.js";

/** The CSS name of a property given in camelCase; a custom property is already given by it. */
export function cssPropertyNameOf(property: string): string {
    if (property.startsWith('--')) return property;
    if (property === 'cssFloat') return 'float';
    if (property === 'cssOffset') return 'offset';
    const hyphenated = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    return /^(webkit|moz|ms)-/.test(hyphenated) ? `-${hyphenated}` : hyphenated;
}

/** The name WAAPI keyframes take the property by; `offset` is the keyframe's own, so it and `float` take a prefix. */
export function keyframePropertyOf(property: string): string {
    if (property === 'float') return 'cssFloat';
    if (property === 'offset') return 'cssOffset';
    return property;
}

export function resolveTargetValues(targets: readonly Element[], values: { [property: string]: ValueStops }): TargetValues[] {
    return targets.map(target => ({
        target,
        properties: Object.fromEntries(Object.entries(values).map(([property, valueStops]) =>
            [property, resolvePropertyStops(target, property, valueStops)]
        ))
    }));
}

/**
 * The stops as numbers in one unit: as given when every value is a number with the same unit; otherwise the values that aren't a number in the property's default unit are resolved on the target.
 * A bare number takes the property's default unit.
 */
function resolvePropertyStops(target: Element, property: string, valueStops: ValueStops): { stops: PropertyStops; unit: string } {
    const cssName = cssPropertyNameOf(property);
    const type = PropertyValueType.of(cssName);
    const texts = Object.entries(valueStops).map(([progress, value]) => [progress, cssTextOf(property, value, type)] as const);
    for (const [, text] of texts) {
        if (!CSS.supports(cssName, text))
            throw new Error(`"${text}" isn't a value "${cssName}" takes.`);
    }

    const given = texts.map(([progress, text]) => [progress, text, parseNumeric(text)] as const);
    const givenUnits = new Set(given.map(([, , numeric]) => numeric?.unit));
    const unitsAgree = givenUnits.size === 1 && !givenUnits.has(undefined);
    const numerics = given.map(([progress, text, numeric]) => {
        if (numeric && (unitsAgree || numeric.unit === type.defaultUnit)) return [progress, numeric] as const;
        const resolved = type.resolve(target, text);
        const resolvedNumeric = parseNumeric(resolved);
        if (!resolvedNumeric) throw new Error(`"${text}" resolves to "${resolved}" for "${cssName}", which isn't a single number with a unit.`);
        return [progress, resolvedNumeric] as const;
    });

    const units = new Set(numerics.map(([, {unit}]) => unit));
    if (units.size > 1)
        throw new Error(`The values of "${cssName}" resolve to different units: ${[...units].map(unit => `"${unit}"`).join(', ')}.`);

    return {
        stops: PropertyStops.of(property, Object.fromEntries(numerics.map(([progress, {value}]) => [progress, value]))),
        unit: numerics[0]?.[1].unit ?? ''
    };
}

function cssTextOf(property: string, value: CSSValue, type: PropertyValueType): string {
    if (typeof value === 'string') return value;
    checkNumber(value, `A value of "${property}"`);
    if (type.defaultUnit === undefined)
        throw new Error(`"${property}" doesn't take a bare number, so ${value} needs a unit.`);
    return `${value}${type.defaultUnit}`;
}

const numericPattern = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)\s*$/i;

function parseNumeric(text: string): { value: number; unit: string } | undefined {
    const [, number, unit] = numericPattern.exec(text) ?? [];
    return number === undefined ? undefined : {value: Number(number), unit: unit!.toLowerCase()};
}

/** A kind of numeric value a property may take, told by whether it takes a sample of it. */
interface ValueKind {
    syntax: string;
    unit: string;
}

const valueKinds: readonly ValueKind[] = [
    {syntax: '<number>', unit: ''},
    {syntax: '<length>', unit: 'px'},
    {syntax: '<percentage>', unit: '%'},
    {syntax: '<angle>', unit: 'deg'},
    {syntax: '<time>', unit: 's'}
];

/**
 * The numeric values a property takes, worked out with `CSS.supports`.
 * Values resolve through a registered custom property of the same syntax, a probe: animations and transitions don't touch it, and its computed value is absolute.
 */
class PropertyValueType {
    private static readonly byCSSName = new Map<string, PropertyValueType>();
    private static readonly probesBySyntax = new Map<string, readonly [string, string]>();

    /** The unit a bare number takes: none when the property takes numbers, then px, then deg. */
    readonly defaultUnit: string | undefined;
    private readonly syntax: string;
    /** The values the two probes start from, which differ, so a value the syntax rejects shows as both. */
    private readonly initialValues: readonly [string, string];

    private constructor(private readonly cssName: string) {
        const kinds = valueKinds.filter(({unit}) => CSS.supports(cssName, `1${unit}`));
        if (kinds.length === 0)
            throw new Error(`"${cssName}" takes no number, length, percentage, angle or time.`);

        const accepts = (unit: string) => kinds.some(kind => kind.unit === unit);
        this.defaultUnit = ['', 'px', 'deg'].find(accepts);
        const syntaxes = kinds.map(({syntax}) => syntax);
        this.syntax = (accepts('px') && accepts('%')
            ? syntaxes.filter(syntax => syntax !== '<percentage>').map(syntax => syntax === '<length>' ? '<length-percentage>' : syntax)
            : syntaxes
        ).join(' | ');
        this.initialValues = [`0${kinds[0]!.unit}`, `1${kinds[0]!.unit}`];
    }

    static of(cssName: string): PropertyValueType {
        let type = PropertyValueType.byCSSName.get(cssName);
        if (!type) PropertyValueType.byCSSName.set(cssName, type = new PropertyValueType(cssName));
        return type;
    }

    /** The value's computed form on the target. */
    resolve(target: Element, text: string): string {
        const [probe, otherProbe] = this.probes();
        const resolved = computedValueOf(target, probe, text);
        if (resolved === this.initialValues[0] && computedValueOf(target, otherProbe, text) === this.initialValues[1])
            throw new Error(`"${text}" doesn't resolve to a single number with a unit for "${this.cssName}".`);
        return resolved;
    }

    private probes(): readonly [string, string] {
        let probes = PropertyValueType.probesBySyntax.get(this.syntax);
        if (probes) return probes;

        const id = PropertyValueType.probesBySyntax.size;
        probes = [`--times-fps-probe-${id}-a`, `--times-fps-probe-${id}-b`];
        probes.forEach((name, index) => {
            try {
                CSS.registerProperty({name, syntax: this.syntax, inherits: false, initialValue: this.initialValues[index]!});
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'InvalidModificationError')) throw error;
            }
        });
        PropertyValueType.probesBySyntax.set(this.syntax, probes);
        return probes;
    }
}

/** Sets the probe on the target with transitions off, reads its computed value, and puts the target's inline style back. */
function computedValueOf(target: Element, probe: string, text: string): string {
    const {style} = target as Element & ElementCSSInlineStyle;
    if (!style) throw new Error("Values can only be resolved on an element with an inline style.");

    const transition = style.getPropertyValue('transition');
    const transitionPriority = style.getPropertyPriority('transition');
    style.setProperty('transition', 'none', 'important');
    style.setProperty(probe, text);
    const resolved = getComputedStyle(target).getPropertyValue(probe).trim();
    style.removeProperty(probe);
    if (transition) style.setProperty('transition', transition, transitionPriority);
    else style.removeProperty('transition');
    return resolved;
}
