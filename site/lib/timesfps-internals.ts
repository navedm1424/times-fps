// The library's internals aren't part of its package exports, so they're reached through its build output.
export {SpringEasing, type CubicBezierEasing} from "../../dist/easing.js";
export {progressPrecision, resolveSpring} from "../../dist/transition.js";
export {SpringSplineFitter, type Spline} from "../../dist/waapi/spring-fit.js";
export {plainNumberResolver} from "../../dist/waapi/effect-chains.js";
export {PropertyStops} from "../../dist/waapi/stops.js";
export {resolveTimings} from "../../dist/waapi/timings.js";
export {AnimationTracksResolver} from "../../dist/waapi/tracks.js";
