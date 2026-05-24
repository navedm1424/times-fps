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
    return saturate((v - start) / (end - start));
}

export function remap(
    value: number,
    currentStart: number,
    currentEnd: number,
    newStart: number,
    newEnd: number
) {
    const delta = currentEnd - currentStart;
    if (delta === 0)
        return NaN;
    if (currentStart === newStart && currentEnd === newEnd)
        return value;
    if ((delta > 0 && value <= currentStart) || (delta < 0 && value >= currentStart))
        return newStart;
    if ((delta > 0 && value >= currentEnd) || (delta < 0 && value <= currentEnd))
        return newEnd;

    // same as lerp(newStart, newEnd, invLerp(currentStart, currentEnd, value))
    return (
        newStart + (newEnd - newStart) * ((value - currentStart) / (currentEnd - currentStart))
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