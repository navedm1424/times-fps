import type {Seconds} from "./types.js";

type AnchorMark = '<' | '>' | '>>';
type AtOffsetSign = '+' | '-';
type AtOffset = `${AtOffsetSign}${number}` | `${AtOffsetSign}${number}%` | `${AtOffsetSign}=${number}%`;

/**
 * A number is absolute time from the start of the sequence's iteration.
 * A string is relative: `>` to the previous entry's end, which is the default, `<` to its start, and `>>` to the end of everything so far.
 * An offset after it is in seconds, in shares of the referenced entry (`%`), or in shares of the entry being added (`=%`), and needs a sign.
 * A name before `<` or `>` refers to that entry instead of the previous one.
 */
export type At<Names extends string> =
    | Seconds
    | AnchorMark
    | AtOffset
    | `${AnchorMark}${AtOffset}`
    | `${Names}${'<' | '>'}`
    | `${Names}${AtOffset}`
    | `${Names}${'<' | '>'}${AtOffset}`;

/** What a relative position is relative to. */
export type AtReference<Name extends string> =
    | { kind: 'previous' }
    | { kind: 'everything-so-far' }
    | { kind: 'entry'; name: Name };

/** The point of the reference an `at` is relative to. */
export type AtAnchor = 'start' | 'end';

/** Seconds, or a share of the referenced span or of the inserted entry's own span. */
export type AtOffsetUnit = 'seconds' | 'referenced-span' | 'inserted-span';

export type ParsedAt<Name extends string> =
    | { kind: 'absolute'; time: Seconds }
    | { kind: 'relative'; reference: AtReference<Name>; anchor: AtAnchor; offset: number; offsetUnit: AtOffsetUnit };

export function parseAt<Name extends string>(at: At<Name>): ParsedAt<Name> {
    if (typeof at === 'number') return {kind: 'absolute', time: at};
    const fail = (reason: string) => new Error(`Can't parse the position "${at}": ${reason}`);

    const [, name = '', mark, offsetText = ''] = /^(\w*)(<<|>>|<|>)?(.*)$/s.exec(at) ?? [];
    if (mark === '<<') throw fail("`<<` isn't a position.");
    if (name && mark === '>>') throw fail("`>>` takes no name before it.");
    if (!mark && !offsetText) throw fail(name ? "a name needs `<`, `>` or an offset after it." : "it's empty.");

    const reference: AtReference<Name> = mark === '>>' ? {kind: 'everything-so-far'} : name ? {kind: 'entry', name: name as Name} : {kind: 'previous'};
    const anchor: AtAnchor = mark === '<' ? 'start' : 'end';
    if (!offsetText) return {kind: 'relative', reference, anchor, offset: 0, offsetUnit: 'seconds'};

    const [, sign, equals, amountText = '', percent] = /^([+-]?)(=?)(.*?)(%?)$/s.exec(offsetText) ?? [];
    if (!sign) throw fail("offsets need a sign, such as `+0.2`.");
    if (equals && !percent) throw fail("`=` only goes with `%`.");
    const amount = Number(amountText);
    if (!amountText.trim() || Number.isNaN(amount)) throw fail(`"${amountText}" isn't a number.`);

    const signed = sign === '-' ? -amount : amount;
    return {
        kind: 'relative',
        reference,
        anchor,
        offset: percent ? signed / 100 : signed,
        offsetUnit: percent ? (equals ? 'inserted-span' : 'referenced-span') : 'seconds'
    };
}
