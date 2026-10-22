export type {Progress, Seconds} from "./types.ts";

export type {CubicBezierEasingParams, StepPosition, StepsEasingParams} from "./easing.ts";
export {cubicBezier, steps} from "./easing-specifier.ts";
export type {EasingPreset, EasingSpecifier} from "./easing-specifier.ts";

export type {
    DurationSpringTransitionOptions, EasedTransitionOptions, PhysicalSpringTransitionOptions, SpringTransitionOptions, TransitionOptions,
    VisualSpringTransitionOptions
} from "./transition.ts";

export type {PlaybackDescriptor, PlaybackOptions, RepeatMode, RepeatOptions, Stagger, StaggeredDelays} from "./playback-options.ts";
export {stagger} from "./stagger.ts";
export type {StaggerOptions, StaggerOrigin, StaggerSpacing} from "./stagger.ts";

export {AnimationTiming} from "./animation.ts";
export type {AnimationTimingOptions} from "./animation.ts";
export type {At, PositionAnchor, PositionDescriptor, PositionOffset, PositionReference} from "./at.ts";
export {SequenceTiming} from "./sequence.ts";
export type {
    AnimationTimingEntry, SequenceTimingBuilder, SequenceTimingEntries, SequenceTimingEntry, SubsequenceTimingEntry
} from "./sequence.ts";

export type {AnimationMapping, AnimationValues, CSSSelector, CSSValue, AnimatorOptions, SequenceMapping, Target, ValueStops} from "./dom/mapping.ts";

export {animator} from "./animator.ts";
export type {Animator} from "./animator.ts";
export type {AnimationControls} from "./waapi/controls.ts";

export {animation, sequence} from "./definitions.ts";
export type {AnimationDefinition, Definition, EntryPlacementOptions, SequenceDefinition, SequenceDefinitionBuilder} from "./definitions.ts";
