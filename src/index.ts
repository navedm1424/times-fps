export {animation, sequence} from "./definitions.ts";
export type {AnimationDefinition, Definition, EntryPlacementOptions, PropertyTimings, SequenceDefinition, SequenceDefinitionBuilder} from "./definitions.ts";
export {stagger} from "./stagger.ts";
export type {StaggerOptions} from "./stagger.ts";
export {cubicBezier, steps} from "./easing.ts";
export type {CubicBezierEasingDescriptor, EasingDescriptor, EasingFunction, StepPosition, StepsEasingDescriptor} from "./easing.ts";
export {AnimationTiming} from "./animation.ts";
export type {AnimationTimingDescriptor} from "./animation.ts";
export {SequenceTiming} from "./sequence.ts";
export type {SequenceTimingBuilder} from "./sequence.ts";
export type {AnimationPlaybackOptions, SequencePlaybackOptions, Stagger, RepeatMode, RepeatOptions} from "./playback-options.ts";
export type {At} from "./at.ts";
export type {
    DurationSpringTransitionOptions, EasedTransitionOptions, PhysicalSpringTransitionOptions, SpringTransitionOptions, TransitionOptions,
    VisualSpringTransitionOptions
} from "./transition.ts";
export type {Progress, Seconds} from "./types.ts";
export type {AnimationMapping, AnimationValues, CSSSelector, CSSValue, PlayOptions, SequenceMapping, Target, ValueStops} from "./dom/mapping.ts";
export type {AnimationControls} from "./waapi/controls.ts";
