export type {Progress, Seconds} from "./types.ts";

export type {Easing} from "./easing.ts";
export {cubicBezier, steps} from "./easing-specifier.ts";
export type {CubicBezierEasingParams, EasingPreset, EasingSpecifier, StepPosition, StepsEasingParams} from "./easing-specifier.ts";

export type {
    DurationSpringTransitionOptions, EasedTransitionOptions, PhysicalSpringTransitionOptions, SpringTransitionOptions, TransitionOptions,
    VisualSpringTransitionOptions
} from "./transition.ts";

export type {AnimationPlaybackOptions, RepeatMode, RepeatOptions, SequencePlaybackOptions, Stagger} from "./playback-options.ts";
export {stagger} from "./stagger.ts";
export type {StaggerOptions, StaggerOrigin, StaggerSpacing} from "./stagger.ts";

export {AnimationTiming} from "./animation.ts";
export type {AnimationTimingOptions} from "./animation.ts";
export type {At} from "./at.ts";
export {SequenceTiming} from "./sequence.ts";
export type {SequenceTimingBuilder, SequenceTimingEntries} from "./sequence.ts";

export type {AnimationMapping, AnimationValues, CSSSelector, CSSValue, PlayOptions, SequenceMapping, Target, ValueStops} from "./dom/mapping.ts";

export type {AnimationControls} from "./waapi/controls.ts";

export {animation, sequence} from "./definitions.ts";
export type {AnimationDefinition, Definition, EntryPlacementOptions, PropertyTimings, SequenceDefinition, SequenceDefinitionBuilder} from "./definitions.ts";
