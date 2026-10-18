"use client";

import {useMemo, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {BallRace} from "./ball-race";
import {FitCharts} from "./fit-charts";
import {SpringControls} from "./spring-controls";
import {fitSpring} from "./spring-fit";
import {initialValuesByKind, type SpringKind, transitionOf} from "./spring-parameters";

export function SpringDemo() {
    const [kind, setKind] = useState<SpringKind>("physical");
    const [valuesByKind, setValuesByKind] = useState(initialValuesByKind);
    const values = valuesByKind[kind];
    const transition = useMemo(() => transitionOf(kind, values), [kind, values]);
    const fit = useMemo(() => {
        try {
            return fitSpring(transition);
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    }, [transition]);

    return (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 gap-6">
                <Card className="overflow-visible">
                    <CardContent>
                        <BallRace transition={transition}/>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Fit</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {fit instanceof Error
                            ? <p className="text-sm text-destructive">{fit.message}</p>
                            : <FitCharts fit={fit}/>}
                    </CardContent>
                </Card>
            </div>
            <Card className="lg:sticky lg:top-6">
                <CardHeader>
                    <CardTitle>Spring</CardTitle>
                </CardHeader>
                <CardContent>
                    <SpringControls
                        kind={kind}
                        values={values}
                        onKindChange={setKind}
                        onValueChange={(name, value) => setValuesByKind(current => ({...current, [kind]: {...current[kind], [name]: value}}))}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
