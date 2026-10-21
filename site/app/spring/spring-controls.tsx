"use client";

import {useState} from "react";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Slider} from "@/components/ui/slider";
import {parametersByKind, type SpringKind, springKindLabels, type SpringParameter, type SpringValues} from "./spring-parameters";

interface SpringControlsProps {
    kind: SpringKind;
    values: SpringValues;
    onKindChange(kind: SpringKind): void;
    onValueChange(name: string, value: number): void;
}

export function SpringControls({kind, values, onKindChange, onValueChange}: SpringControlsProps) {
    return (
        <div className="grid gap-6">
            <div className="grid gap-2">
                <Label htmlFor="spring-kind">Type</Label>
                <Select items={springKindLabels} value={kind} onValueChange={value => onKindChange(value as SpringKind)}>
                    <SelectTrigger id="spring-kind" className="w-full">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(springKindLabels) as SpringKind[]).map(kind => (
                            <SelectItem key={kind} value={kind}>{springKindLabels[kind]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {parametersByKind[kind].map(parameter => (
                <ParameterControl
                    key={`${kind}-${parameter.name}`}
                    parameter={parameter}
                    value={values[parameter.name]!}
                    onChange={value => onValueChange(parameter.name, value)}
                />
            ))}
        </div>
    );
}

function ParameterControl({parameter: {name, min, max, step}, value, onChange}: { parameter: SpringParameter; value: number; onChange(value: number): void }) {
    const [draft, setDraft] = useState<string>();
    const inputId = `parameter-${name}`;

    function changeDraft(text: string) {
        setDraft(text);
        const typed = Number(text);
        if (text.trim() !== "" && typed >= min && typed <= max) onChange(typed);
    }

    return (
        <div className="grid gap-2">
            <Label htmlFor={inputId}>{name}</Label>
            <div className="flex items-center gap-3">
                <Slider
                    aria-label={name}
                    min={min}
                    max={max}
                    step={step}
                    value={[value]}
                    onValueChange={values => {
                        setDraft(undefined);
                        onChange((values as number[])[0]!);
                    }}
                />
                <Input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={max}
                    step={step}
                    value={draft ?? String(value)}
                    onChange={event => changeDraft(event.target.value)}
                    onBlur={() => setDraft(undefined)}
                    className="h-8 w-22 shrink-0 tabular-nums"
                />
            </div>
        </div>
    );
}
