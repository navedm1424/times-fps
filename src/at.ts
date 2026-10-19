import type {Seconds} from "./types.js";

type AtOperator = '+' | '-' | '<+' | '<-';
/**
 * A number is absolute time.
 * `+n` / `-n` is relative to the previous entry's last referenceable point: for an infinite repeat, the end of its first iteration.
 * `<+n` / `<-n` is relative to the previous entry's start, and `<` alone is `<+0`; a name before the operator makes it relative to that entry instead.
 */
export type At<N extends string> = Seconds | '<' | `${AtOperator}${number}` | `${N}<` | `${N}${AtOperator}${number}`;

/** The point of the entry an `at` is relative to. */
export type AtAnchor = 'start' | 'end';

export type ParsedAt<N extends string> =
    | { kind: 'absolute'; time: Seconds }
    | { kind: 'relative'; reference: N | undefined; anchor: AtAnchor; offset: Seconds };

export function parseAt<N extends string>(at: At<N>): ParsedAt<N> {
    if (typeof at === 'number') return {kind: 'absolute', time: at};
    const [, startReference] = /^(\w*)<$/.exec(at) ?? [];
    if (startReference !== undefined)
        return {kind: 'relative', reference: startReference ? startReference as N : undefined, anchor: 'start', offset: 0};

    const [, reference, startMarker, sign, amountText] = /^(\w*)(<?)([+-])(.+)$/.exec(at) ?? [];
    const amount = Number(amountText);
    if (!amountText?.trim() || Number.isNaN(amount))
        throw new Error(`Can't parse the position "${at}".`);

    return {
        kind: 'relative',
        reference: reference ? reference as N : undefined,
        anchor: startMarker ? 'start' : 'end',
        offset: sign === '-' ? -amount : amount
    };
}
