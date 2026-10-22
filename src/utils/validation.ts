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

/** Throws unless the value is a number. */
export function requireNumber(value: number | undefined, label: string): asserts value is number {
    if (typeof value !== 'number') throw new TypeError(`${label} is required.`);
}

/** Throws unless the object has the property, as anything but `undefined`; `label` names the property in messages. */
export function requireProperty<Subject extends object, Key extends keyof Subject>(
    subject: Subject,
    key: Key,
    label: string
): asserts subject is Subject & { [K in Key]-?: Exclude<Subject[K], undefined> } {
    if (subject[key] === undefined) throw new TypeError(`${label} is required.`);
}
