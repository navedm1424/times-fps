import {remap, saturate} from "./utils/numbers.js";
import {Segment} from "./segment.js";

type DoComputeSubarray<
    Remaining extends any[],
    From extends number | any,
    To extends number | any,
    I extends null[] = [],
    Output extends any[] = [],
    Include extends boolean = From extends I["length"] | Remaining[0] ? true : false
> = 0 extends Remaining["length"]
    ? Output
    : To extends I["length"] | Remaining[0]
        ? Include extends true
            ? [...Output, Remaining[0]]
            : Output
        : Remaining extends [infer H, ...infer Tail]
            ? Include extends true
                ? DoComputeSubarray<Tail, From, To, [...I, null], [...Output, H], true>
                : From extends I["length"] | H
                    ? DoComputeSubarray<Tail, From, To, [...I, null], [...Output, H], true>
                    : DoComputeSubarray<Tail, From, To, [...I, null], Output>
            : Output;

type StrToNum<S extends string> = S extends `${infer N extends number}` ? N : never;

type TupleIndex<T extends readonly unknown[]> =
    number extends T['length']
        ? number
        : StrToNum<Exclude<keyof T, keyof any[]> & string>;

type ZeroIfNegative<N extends number> = `${N}` extends `-${number}` ? 0 : N;

type ComputeSubarray<
    Full extends any[],
    From extends number | any,
    To extends number | any
> = /*Full["length"] extends 0
    ? []
    : */
    To extends number
        ? `${To}` extends `-${number}`
            ? []
            : From extends To
                ? From extends TupleIndex<Full>
                    ? [Full[From]] : []
                : From extends number
                    ? DoComputeSubarray<Full,
                        From extends TupleIndex<Full> ? From : ZeroIfNegative<From>,
                        To extends TupleIndex<Full> ? To : LengthMinusOne<Full>>
                    : DoComputeSubarray<Full, From, To extends TupleIndex<Full> ? To : LengthMinusOne<Full>>
        : From extends number
            ? DoComputeSubarray<Full, From extends TupleIndex<Full> ? From : ZeroIfNegative<From>, To>
            : DoComputeSubarray<Full, From, To>;

type LengthMinusOne<L extends any[]> = string[] extends L ? number : L extends [...infer H, string] ? H["length"] : number;

type Subsequence<S extends string[], From extends number | S[number] = 0, To extends number | S[number] = LengthMinusOne<S>> =
    string[] extends S ? Sequence<S> : Sequence<ComputeSubarray<S, From, To>>;

class SequenceConstructionLicense<S extends string[]> {
    constructor(readonly segments: {
        [K in keyof S]: [name: S[K], segment: Segment];
    }) { }
}

export class Sequence<S extends string[]> {
    #brand = true;
    readonly [key: number]: Segment;
    readonly length: S["length"] extends number ? S["length"] : number;
    readonly segments: {
        readonly [K in S[number]]: Segment;
    };

    private constructor(license?: any) {
        if (!(license && license instanceof SequenceConstructionLicense))
            throw new Error("A sequence can only be created using the factory methods.");

        const segments = {} as {
            [K in S[number]]: Segment;
        };
        for (let i = 0; i < license.segments.length; i++) {
            const segment: [S[number], Segment] = license.segments[i]!;
            segments[segment[0]] = segment[1];
            (this as any)[i] = segment[1];
        }

        this.length = license.segments.length;
        this.segments = Object.freeze(segments);
        Object.freeze(this);
    }

    static fromRatios<const S extends [string, ...string[]]>(...ratios: { [K in keyof S]: [name: S[K], duration: number] }) {
        if (!(Array.isArray(ratios) && ratios.length > 0))
            throw new Error("A sequence must at least have one element.");
        if (!ratios.every(s =>
            Array.isArray(s)
            && typeof (s[0]) === "string"
            && typeof (s[1]) === "number"
        ))
            throw new Error("Invalid inputs: the first element of each tuple should be a string and the second element should be a number.");

        return {
            scaleToRange(start: number, end: number): Sequence<S> {
                if (start > end)
                    [start, end] = [end, start];
                start = saturate(start);
                end = saturate(end);
                const segments = [] as { [K in keyof S]: [S[K], Segment] };
                let totalTime = ratios.reduce(
                    (acc, cur) => acc + Math.abs(cur[1]), 0
                );
                let currentTime = 0;
                for (let i = 0; i < ratios.length; i++) {
                    const interval = ratios[i]! as [S[number], number];
                    const name = interval[0];
                    const duration = Math.abs(interval[1]);
                    segments[i] = [
                        name,
                        Segment.from(remap(currentTime, 0, totalTime, start, end))
                            .to(remap(currentTime += duration, 0, totalTime, start, end))
                    ];
                }
                return new Sequence(new SequenceConstructionLicense(segments));
            }
        };
    }
    static [Symbol.hasInstance](value: any): value is Sequence<any> {
        return typeof value === "object" && #brand in value && value.#brand;
    }

    get start(): number {
        if (this.length === 0)
            throw new Error("Invalid state: sequence instantiated with no segments.");
        return this[0]!.start;
    }
    get end(): number {
        if (this.length === 0)
            throw new Error("Invalid state: sequence instantiated with no segments.");
        return this[this.length - 1]!.end;
    }
    subsequence<From extends number | S[number] = 0, To extends number | S[number] = LengthMinusOne<S>>(
        from: From = 0 as From, to: To = this.length - 1 as To
    ): Subsequence<S, From, To> {
        if (this.length === 0)
            throw new Error("Invalid state: sequence instantiated with no segments.");

        const output: [name: string, Segment][] = [];
        const segmentNames = Object.keys(this.segments);
        let startPushing = false;
        if (typeof from === "number" && typeof to === "number") {
            if (to < from)
                return new Sequence<any>(new SequenceConstructionLicense(output));
            if (Object.is(from, to) && from >= 0 && from < segmentNames.length) {
                const segmentName = segmentNames[from]!;
                output.push([segmentName, this.segments[segmentName]!]);
                return new Sequence<any>(new SequenceConstructionLicense(output));
            }
        }
        if (typeof from === "number") {
            if (from > segmentNames.length - 1)
                return new Sequence<any>(new SequenceConstructionLicense(output));
            if (from < 0)
                from = 0 as From;
        }
        if (typeof to === "number") {
            if (to < 0)
                return new Sequence<any>(new SequenceConstructionLicense(output));
            if (to > segmentNames.length - 1)
                to = segmentNames.length - 1 as To;
        }

        for (let i = typeof from === "number" ? from : 0; i < segmentNames.length; i++) {
            const segmentName = segmentNames[i]!;
            if (Object.is(to, i) || Object.is(to, segmentName)) {
                if (startPushing) output.push([segmentName, this.segments[segmentName]!]);
                break;
            }
            if (startPushing || Object.is(from, i) || Object.is(from, segmentName)) {
                startPushing = true;
                output.push([segmentName, this.segments[segmentName]!]);
            }
        }

        return new Sequence<any>(new SequenceConstructionLicense(output));
    }
    toArray(): Segment[] {
        const result: Segment[] = [];
        for (let i = 0; i < this.length; i++) {
            result[i] = this[i]!;
        }
        return result;
    }
}

Object.freeze(Sequence);
Object.freeze(Sequence.prototype);