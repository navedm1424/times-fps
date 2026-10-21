/** The motion presets of uiarc.dev's components, which the tray's morphs follow. */
export const motionTokens = {
    duration: {instant: 0.12, fast: 0.16},
    ease: {standard: [0.22, 1, 0.36, 1] as [number, number, number, number]},
    spring: {
        /** Shape morphs and width changes that follow new content. */
        morph: {type: "spring", visualDuration: 0.42, bounce: 0.16}
    },
    blur: {subtle: 2}
} as const;
