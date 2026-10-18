import {resolveSpring, spring, type SpringTransition} from "timesfps";
import {progressPrecision} from "@/lib/timesfps-internals";

export type SpringKind = "physical" | "perceptual" | "visual";

export interface SpringParameter {
    name: string;
    min: number;
    max: number;
    step: number;
    initial: number;
}

export type SpringValues = { [name: string]: number };

export const springKindLabels: { [Kind in SpringKind]: string } = {
    physical: "Physical",
    perceptual: "Perceptual",
    visual: "Visual"
};

const velocity: SpringParameter = {name: "velocity", min: -20, max: 20, step: 0.5, initial: 0};
const bounce: SpringParameter = {name: "bounce", min: -0.9, max: 0.95, step: 0.05, initial: 0.3};

export const parametersByKind: { [Kind in SpringKind]: SpringParameter[] } = {
    physical: [
        {name: "stiffness", min: 1, max: 1000, step: 1, initial: 260},
        {name: "damping", min: 0.5, max: 100, step: 0.5, initial: 22},
        {name: "mass", min: 0.1, max: 10, step: 0.1, initial: 1},
        {name: "restDelta", min: 0.0001, max: 0.01, step: 0.0001, initial: progressPrecision},
        velocity
    ],
    perceptual: [
        {name: "duration", min: 0.1, max: 3, step: 0.05, initial: 0.8},
        bounce,
        velocity
    ],
    visual: [
        {name: "visualDuration", min: 0.1, max: 2, step: 0.05, initial: 0.5},
        bounce,
        velocity
    ]
};

export const initialValuesByKind = Object.fromEntries(Object.entries(parametersByKind).map(([kind, parameters]) =>
    [kind, Object.fromEntries(parameters.map(({name, initial}) => [name, initial]))]
)) as { [Kind in SpringKind]: SpringValues };

export function transitionOf(kind: SpringKind, values: SpringValues): SpringTransition {
    switch (kind) {
        case "physical":
            return spring({stiffness: values.stiffness!, damping: values.damping!, mass: values.mass!, restDelta: values.restDelta!, velocity: values.velocity!});
        case "perceptual":
            return spring({duration: values.duration!, bounce: values.bounce!, velocity: values.velocity!});
        case "visual":
            return spring({visualDuration: values.visualDuration!, bounce: values.bounce!, velocity: values.velocity!});
    }
}

/** Stiffness, damping and mass that follow the same equation as the transition, with its velocity in progress per second. */
export function physicsOf(transition: SpringTransition) {
    const {naturalFrequency, dampingRatio, initialVelocity} = resolveSpring(transition).spring;
    return {
        stiffness: naturalFrequency * naturalFrequency,
        damping: 2 * dampingRatio * naturalFrequency,
        mass: 1,
        velocity: initialVelocity
    };
}
