import type {Progress} from "./types.ts";

/** How close two progresses must be to count as the same: how near its target a spring is at rest, and how closely a curve fitted to a spring follows it. */
export const PRECISION: Progress = 0.001;
