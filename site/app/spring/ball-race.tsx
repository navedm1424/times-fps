"use client";

import {PlayIcon} from "lucide-react";
import {useRef, useState} from "react";
import {spring, type SpringTransition} from "timesfps";
import {Button} from "@/components/ui/button";
import {ToggleGroup, ToggleGroupItem} from "@/components/ui/toggle-group";
import {type BallId, playToEnd, returnToStart} from "./ball-players";

const balls: { id: BallId; title: string; method: string }[] = [
    {id: "css", title: "CSS", method: "uses linear()"},
    {id: "timesfps", title: "TimesFPS", method: "uses WAAPI"},
    {id: "motion", title: "Motion", method: "uses rAF"}
];

/** Brings the balls back to the start, a moment after the last of them reaches the end. */
const returnSpring = spring({visualDuration: 0.35, bounce: 0});
const returnDelayInMilliseconds = 250;

export function BallRace({transition}: { transition: SpringTransition }) {
    const [playing, setPlaying] = useState(false);
    const [playAllSelection, setPlayAllSelection] = useState<BallId[]>(balls.map(({id}) => id));
    const ballElements = useRef<{ [Id in BallId]?: HTMLElement | null }>({});

    async function play(ids: readonly BallId[]) {
        const playedBalls = ids.map(id => ({id, ball: ballElements.current[id]!}));
        setPlaying(true);
        await Promise.all(playedBalls.map(({id, ball}) => playToEnd(id, ball, transition)));
        await new Promise(resolve => setTimeout(resolve, returnDelayInMilliseconds));
        await returnToStart(playedBalls.map(({ball}) => ball), returnSpring);
        setPlaying(false);
    }

    return (
        <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <PlayButton label="Play all" disabled={playing || playAllSelection.length === 0}
                                onClick={() => play(playAllSelection)}/>
                    <h2 className="font-heading text-base font-medium">Playback</h2>
                </div>
                <div className="flex items-center gap-2">
                    <span id="play-all-selection" className="text-xs text-muted-foreground">Play all</span>
                    <ToggleGroup
                        multiple
                        variant="outline"
                        size="sm"
                        spacing={0}
                        aria-labelledby="play-all-selection"
                        value={playAllSelection}
                        onValueChange={selection => setPlayAllSelection(selection as BallId[])}
                    >
                        {balls.map(({id, title}) => (
                            <ToggleGroupItem key={id} value={id} className="text-muted-foreground aria-pressed:text-foreground">
                                {title}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
            </div>
            <div className="grid gap-4">
                {balls.map(({id, title, method}) => (
                    <div key={id} className="grid gap-2.5">
                        <div className="flex items-center gap-3">
                            <PlayButton label={`Play ${title}`} disabled={playing} onClick={() => play([id])}/>
                            <h3 className="text-sm font-medium">
                                {title} <span className="font-normal text-muted-foreground">{method}</span>
                            </h3>
                        </div>
                        <div className="rounded-full bg-muted p-1">
                            <div className="@container">
                                <div
                                    ref={element => {
                                        ballElements.current[id] = element;
                                    }}
                                    className="relative z-1 size-6 rounded-full bg-primary shadow-sm data-[position=end]:translate-x-[calc(100cqw-100%)]"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function PlayButton({label, disabled, onClick}: { label: string; disabled: boolean; onClick(): void }) {
    return (
        <Button variant="outline" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
            <PlayIcon className="fill-current"/>
        </Button>
    );
}
