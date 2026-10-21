export {animation, sequence} from "./definitions.js";
export type {AnimationDefinition, Definition, EntryPlacementOptions, PropertyTimings, SequenceDefinition, SequenceDefinitionBuilder} from "./definitions.js";
export {stagger} from "./stagger.js";
export type {StaggerOptions} from "./stagger.js";
export {cubicBezier, steps} from "./easing.js";
export type {CubicBezierEasingDescriptor, EasingDescriptor, EasingFunction, StepPosition, StepsEasingDescriptor} from "./easing.js";
export {AnimationTiming} from "./animation.js";
export type {AnimationTimingDescriptor} from "./animation.js";
export {SequenceTiming} from "./sequence.js";
export type {SequenceTimingBuilder} from "./sequence.js";
export type {AnimationPlaybackOptions, SequencePlaybackOptions} from "./playback-options.js";
export type {At} from "./at.js";
export type {
    DurationSpringTransitionOptions, EasedTransitionOptions, PhysicalSpringTransitionOptions, SpringTransitionOptions, TransitionOptions,
    VisualSpringTransitionOptions
} from "./transition.js";
export type {Progress, RepeatMode, RepeatOptions, Seconds, Stagger} from "./types.js";
export type {AnimationMapping, AnimationValues, CSSSelector, CSSValue, SequenceMapping, Target, ValueStops} from "./waapi/mapping.js";
export type {PlayOptions} from "./waapi/animator.js";
export type {AnimationControls} from "./waapi/controls.js";
