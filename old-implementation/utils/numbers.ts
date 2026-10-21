export function lerp(
    start: number,
    end: number,
    t: number
) {
    return clamp(start + (end - start) * t, start, end);
}

export function invLerp(
    start: number,
    end: number,
    v: number
) {
    const denominator = end - start;
    if (denominator === 0)
        return NaN;
    return saturate((v - start) / denominator);
}

export function remap(
    value: number,
    currentStart: number,
    currentEnd: number,
    newStart: number,
    newEnd: number
) {
    const currentRange = currentEnd - currentStart;
    if (currentRange === 0)
        return NaN;
    if (currentStart === newStart && currentEnd === newEnd)
        return value;
    if ((currentRange > 0 && value <= currentStart) || (currentRange < 0 && value >= currentStart))
        return newStart;
    if ((currentRange > 0 && value >= currentEnd) || (currentRange < 0 && value <= currentEnd))
        return newEnd;

    // same as lerp(newStart, newEnd, invLerp(currentStart, currentEnd, value))
    return (
        newStart + (newEnd - newStart) * ((value - currentStart) / currentRange)
    );
}

export function clamp(
    v: number,
    min: number,
    max: number
) {
    if (min > max)
        [min, max] = [max, min];

    if (v > max)
        return max;
    if (v < min)
        return min;
    return v;
}

export function saturate(v: number) {
    if (v > 1)
        return 1;
    if (v < 0)
        return 0;
    return v;
}