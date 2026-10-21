/** Throws for NaN, and for an infinite number unless `allowInfinity` is set; otherwise gives the value back. */
export function checkNumber<Value extends number | undefined>(value: Value, label: string, {allowInfinity = false} = {}): Value {
    if (value !== undefined && (Number.isNaN(value) || (!allowInfinity && !Number.isFinite(value))))
        throw new RangeError(`${label} must be ${allowInfinity ? "a number" : "a finite number"}.`);
    return value;
}

/** Throws unless the value, when it's given, is a finite number above 0. */
export function checkPositive(value: number | undefined, label: string): void {
    if (checkNumber(value, label) !== undefined && !(value! > 0))
        throw new RangeError(`${label} must be positive, not ${value}.`);
}
