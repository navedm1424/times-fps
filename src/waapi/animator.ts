import {AnimationDefinition, animationOf, type SimpleAnimation, type TransitionAndOptions} from "../animation.js";
import {checkName, checkPosition, Sequence, type SequenceBuilder, type SequenceOptions} from "../sequence.js";
import type {At, SequenceEntries} from "../types.js";
import {parseAt} from "../utils/positions.js";
import {AnimationControls} from "./controls.js";
import {domValueResolver, keyframePropertyOf, resolveTargetValues} from "./css-values.js";
import {type AnimationMapping, resolveTargets, type SequenceMapping, type Target} from "./mapping.js";
import {cssEasingOf} from "./native-easing.js";
import {entryPathOf, type EntryPath, resolveTimings} from "./timings.js";
import {type AnimationTracks, AnimationTracksResolver, type TargetValues} from "./tracks.js";

export interface AnimateOptions {
    /** Where selectors and target functions look for elements; the document's root element by default. */
    scope?: Element;
    /** Whether the animations start playing right away, which they do by default. */
    autoplay?: boolean;
}

export function animate(animation: SimpleAnimation, mapping: AnimationMapping, options?: AnimateOptions): AnimationControls;
export function animate<SE extends SequenceEntries>(sequence: Sequence<SE>, mapping: SequenceMapping<SE>, options?: AnimateOptions): AnimationControls;
export function animate(
    definition: SimpleAnimation | Sequence,
    mapping: AnimationMapping | SequenceMapping,
    options?: AnimateOptions
): AnimationControls {
    return WAAPIAnimator.animate(definition, mapping, options);
}

/** A sequence built with its targets and values; entries given no name are named as it's played, so positions can't refer to them. */
export function sequence(options?: SequenceOptions): MappedSequenceBuilder {
    return new MappedSequenceBuilder(options);
}

/** A transition with its animation's options, and how its values composite and which fills they keep. */
export type MappedTransitionAndOptions = TransitionAndOptions & Pick<AnimationMapping, 'composite' | 'fill'>;

/** An animation, and how its values composite and which fills they keep. */
export type MappedAnimation = { animation: SimpleAnimation } & Pick<AnimationMapping, 'composite' | 'fill'>;

type AnimationValues = AnimationMapping['values'];
type EntryAnimation = SimpleAnimation | MappedTransitionAndOptions | MappedAnimation;
type AnimationEntryArgs = [target: Target, values: AnimationValues, animation: EntryAnimation, at?: At<string>];
type NamedAnimationEntryArgs = [name: string, target: Target, values: AnimationValues, animation: EntryAnimation, at?: At<string>];
type NestedSequenceArgs = [sequence: MappedSequenceBuilder<string>, at?: At<string>];
type NamedNestedSequenceArgs = [name: string, sequence: MappedSequenceBuilder<string>, at?: At<string>];

/** An entry as it's added, before the unnamed ones get their names. */
type PendingEntry = { name: string | undefined; at: At<string> | undefined } & (
    | { animation: SimpleAnimation; mapping: AnimationMapping }
    | { sequence: MappedSequenceBuilder<string> }
);

/** Builds a sequence and its mapping together; positions can refer to the entries given a name before them. */
export class MappedSequenceBuilder<Names extends string = never> {
    private readonly entries: PendingEntry[] = [];

    constructor(private readonly options: SequenceOptions = {}) {}

    add(target: Target, values: AnimationValues, animation: EntryAnimation, at?: At<Names>): MappedSequenceBuilder<Names>;
    add<N extends string>(name: N, target: Target, values: AnimationValues, animation: EntryAnimation, at?: At<Names>): MappedSequenceBuilder<Names | N>;
    add(sequence: MappedSequenceBuilder<string>, at?: At<Names>): MappedSequenceBuilder<Names>;
    add<N extends string>(name: N, sequence: MappedSequenceBuilder<string>, at?: At<Names>): MappedSequenceBuilder<Names | N>;
    add(...args: AnimationEntryArgs | NamedAnimationEntryArgs | NestedSequenceArgs | NamedNestedSequenceArgs): MappedSequenceBuilder<string> {
        const [name, entryArgs] = isNamed(args)
            ? [args[0], args.slice(1) as AnimationEntryArgs | NestedSequenceArgs]
            : [undefined, args];
        const at = isNestedSequence(entryArgs) ? entryArgs[1] : entryArgs[3];
        const givenNames = this.givenNames;
        if (name !== undefined) {
            if (givenNames.includes(name))
                throw new Error(`An entry named "${name}" already exists in this sequence.`);
            checkName(name);
        }
        checkPosition(name === undefined ? `Entry #${this.entries.length + 1}` : `Entry "${name}"`, parseAt(at ?? '+0'), givenNames);

        if (isNestedSequence(entryArgs)) {
            this.entries.push({name, at, sequence: entryArgs[0]});
            return this;
        }
        const [target, values, animation] = entryArgs;
        if (animation instanceof AnimationDefinition) {
            this.entries.push({name, at, animation, mapping: {target, values}});
            return this;
        }
        if ('animation' in animation) {
            const {animation: simpleAnimation, composite, fill} = animation;
            this.entries.push({name, at, animation: simpleAnimation, mapping: {target, values, ...definedOf({composite, fill})}});
            return this;
        }
        const {composite, fill, ...transitionAndOptions} = animation;
        this.entries.push({name, at, animation: animationOf(transitionAndOptions), mapping: {target, values, ...definedOf({composite, fill})}});
        return this;
    }

    animate(options?: AnimateOptions): AnimationControls {
        const {sequence, mapping} = this.build();
        return WAAPIAnimator.animate(sequence, mapping, options);
    }

    private get givenNames(): string[] {
        return this.entries.flatMap(({name}) => name === undefined ? [] : [name]);
    }

    /** Names the unnamed entries in order, as `a` to `z`, then `aa` and on, skipping the names given. */
    private build(): { sequence: Sequence; mapping: SequenceMapping } {
        const givenNames = new Set(this.givenNames);
        const builder: SequenceBuilder<SequenceEntries> = Sequence.builder();
        const mapping: { [name: string]: AnimationMapping | SequenceMapping } = {};
        let ordinal = 0;
        const nextUnnamedName = () => {
            let name: string;
            do name = alphabeticNameOf(ordinal++);
            while (givenNames.has(name));
            return name;
        };
        for (const entry of this.entries) {
            const name = entry.name ?? nextUnnamedName();
            if ('sequence' in entry) {
                const nested = entry.sequence.build();
                builder.add(name, nested.sequence, entry.at);
                mapping[name] = nested.mapping;
            } else {
                builder.add(name, entry.animation, entry.at);
                mapping[name] = entry.mapping;
            }
        }
        return {sequence: builder.build(this.options), mapping: mapping as SequenceMapping};
    }
}

/** Leaves out the options that weren't given. */
function definedOf<Options extends object>(options: Options): Partial<Options> {
    return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<Options>;
}

/** A named entry's second argument is a sequence, or its fourth is its animation where an unnamed one has its position. */
function isNamed(args: AnimationEntryArgs | NamedAnimationEntryArgs | NestedSequenceArgs | NamedNestedSequenceArgs): args is NamedAnimationEntryArgs | NamedNestedSequenceArgs {
    return args[1] instanceof MappedSequenceBuilder || typeof args[3] === 'object';
}

function isNestedSequence(args: AnimationEntryArgs | NestedSequenceArgs): args is NestedSequenceArgs {
    return args[0] instanceof MappedSequenceBuilder;
}

/** `a` for 0 to `z` for 25, then `aa`, `ab` and on. */
function alphabeticNameOf(index: number): string {
    let name = '';
    for (let remaining = index + 1; remaining > 0; remaining = Math.floor((remaining - 1) / 26))
        name = String.fromCharCode('a'.charCodeAt(0) + (remaining - 1) % 26) + name;
    return name;
}

/**
 * Plays definitions on elements with WAAPI.
 * It resolves the targets and values of the mapping, the timings of the definition, and the tracks those make, then creates an animation for each track's effects.
 */
class WAAPIAnimator {
    static animate(
        definition: SimpleAnimation | Sequence,
        mapping: AnimationMapping | SequenceMapping,
        {scope = document.documentElement, autoplay = true}: AnimateOptions = {}
    ): AnimationControls {
        const tracks = definition instanceof Sequence
            ? WAAPIAnimator.sequenceTracks(definition, mapping as SequenceMapping, scope)
            : WAAPIAnimator.animationTracks(definition, mapping as AnimationMapping, scope);
        const animations = WAAPIAnimator.play(tracks);
        if (!autoplay) for (const animation of animations) animation.pause();
        return new AnimationControls(animations);
    }

    private static animationTracks(animation: SimpleAnimation, mapping: AnimationMapping, scope: Element): AnimationTracks {
        const targetValues = WAAPIAnimator.targetValuesOf(mapping, scope);
        return AnimationTracksResolver.resolve(resolveTimings(animation, targetValues.length), () => targetValues, domValueResolver);
    }

    private static sequenceTracks(sequence: Sequence, mapping: SequenceMapping, scope: Element): AnimationTracks {
        const valuesByPath = new Map<EntryPath, TargetValues[]>();
        WAAPIAnimator.resolveSequenceValues(sequence, mapping, undefined, scope, valuesByPath);
        const targetCounts = new Map([...valuesByPath].map(([path, targetValues]) => [path, targetValues.length]));
        return AnimationTracksResolver.resolve(resolveTimings(sequence, targetCounts), path => valuesByPath.get(path)!, domValueResolver);
    }

    private static resolveSequenceValues(
        sequence: Sequence,
        mapping: SequenceMapping | undefined,
        path: EntryPath | undefined,
        scope: Element,
        valuesByPath: Map<EntryPath, TargetValues[]>
    ): void {
        if (!mapping) throw new Error(path ? `No mapping present for "${path}".` : "No mapping present.");
        for (const name of sequence.names) {
            const entry = sequence.entries[name]!;
            const entryPath = entryPathOf(path, name);
            const entryMapping = mapping[name];
            if (!entryMapping) throw new Error(`No mapping present for "${entryPath}".`);

            if ('sequence' in entry)
                WAAPIAnimator.resolveSequenceValues(entry.sequence, entryMapping as SequenceMapping, entryPath, scope, valuesByPath);
            else if (entry.animation.type === 'simple')
                valuesByPath.set(entryPath, WAAPIAnimator.targetValuesOf(entryMapping as AnimationMapping, scope));
            else
                throw new Error(`Entry "${entryPath}" is a timed tween animation, which isn't supported yet.`);
        }
    }

    private static targetValuesOf({target, values, composite = 'replace', fill = 'both'}: AnimationMapping, scope: Element): TargetValues[] {
        return resolveTargetValues(resolveTargets(target, scope), values, composite, fill);
    }

    /** Creates the effects in their tracks' order, so the ones declared later show over the earlier ones; each is named by its entry's path and its property. */
    private static play(tracks: AnimationTracks): Animation[] {
        return [...tracks].flatMap(([target, effectsByProperty]) => Object.entries(effectsByProperty).flatMap(([property, effects]) => {
            const keyframeProperty = keyframePropertyOf(property);
            return effects.map(({keyframes, easing, delay, duration, iterations, direction, fill, composite, path}) => {
                const animation = target.animate(
                    keyframes.map(keyframe => ({
                        offset: keyframe.offset,
                        [keyframeProperty]: keyframe.value,
                        ...(keyframe.easing && {easing: cssEasingOf(keyframe.easing)})
                    })),
                    {delay: delay * 1000, duration: duration * 1000, iterations, direction, fill, composite, easing: cssEasingOf(easing)}
                );
                animation.id = path ? `${path}:${property}` : property;
                return animation;
            });
        }));
    }
}
