# Documentation

## README.md

`README.md` speaks to the people who use the library. They're developers.

**Flow.** Keep this order in every edit:

1. The pitch.
2. The two entry points, `animation` and `sequence`, with broad, concise examples that show what the library can do.
3. `animation`, in this order:
    1. Targets: one element, many elements, a selector, or a function that derives them from the scope.
    2. Values, and what each form of them means.
    3. Timing: transitions and easings.
4. `sequence`, and how it works.
5. Only once both functions are covered: the timing models, that both functions also take these reusable timing objects, and how each one is created.
6. The controls.
7. Migrating from other libraries, for DOM-based animations only.

**Tone.** Approachable and warm without becoming casual. Talk to the reader ("you can …"), and keep it human. It's technical writing for developers, never a sales pitch.

**Content.** Detailed and comprehensive about the API surface, and only about the API surface. Cover everything a user needs to know, precisely: every form a parameter takes, every rule, every default, every error, and the conceptual model behind each API. The position syntax, for example, gets a complete, exact table. Leave out implementation details and anything else a user doesn't need. Focus on what each thing means to the person using it.

**Outcomes and rules, never mechanisms.** For each way of passing an input, say what it produces, and outline any rule that applies, as a condition and its consequence. Never explain how the library carries a rule out: nothing about keyframes, values passing through or being resolved, curve fitting, probes or anything else the library does internally.

**Comparisons belong in Migrating.** Sections that document the API never compare it with other libraries or frameworks. Differences from a library go in that library's part of Migrating, and only for libraries the README migrates from.

**Scannability.** Keep it very easy to scan and absorb. Anyone should find what they're looking for at a glance.

## SPEC.md

`SPEC.md` speaks to the people who work on the library.

**Flow.** It starts with:

1. The purpose: what the library is and why it exists.
2. The API surface, in this order:
    1. The timing models, with easings, repeats and everything they depend on.
    2. The definition API: targets, values, timing and options.
    3. The controls.

The sections after these keep their own flow.

**Content.** Detailed, comprehensive, precise and technical. Cover every detail of everything, implementation details included: everything a developer new to the project needs.

**Scannability.** Even more than the README: comprehensive, yet incredibly easy to scan and absorb.
