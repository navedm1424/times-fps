import type {At, Seconds} from "../types.js";

/** Sequence-local times an entry's position can refer to. */
export type EntryReferences = { start: Seconds; end: Seconds };

export type ParsedAt<N extends string> =
    | { kind: 'absolute'; time: Seconds }
    | { kind: 'relative'; reference: N | undefined; anchor: keyof EntryReferences; offset: Seconds };

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
