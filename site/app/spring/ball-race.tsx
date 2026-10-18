"use client";

import {useRef, useState} from "react";
import {spring, type SpringTransition} from "timesfps";
import {PlayIcon} from "@/components/icons/play-icon";
import {ChipTray} from "@/components/tray/chip-tray";
import {TrayIconButton} from "@/components/tray/tray-icon-button";
import {type BallId, nextFrameTime, playToEnd, returnToStart} from "./ball-players";

const balls: { id: BallId; title: string; method: string }[] = [
    {id: "css", title: "CSS", method: "uses linear()"},
    {id: "timesfps", title: "TimesFPS", method: "uses WAAPI"},
    {id: "motion", title: "Motion", method: "uses rAF"}
];

/** Brings the balls back to the start, a moment after the last of them reaches the end. */
const returnSpring = spring({visualDuration: 0.35, bounce: 0});
const returnDelayInMilliseconds = 1000;

export function BallRace({transition}: { transition: SpringTransition }) {
    const [playing, setPlaying] = useState(false);
    const [playAllSelection, setPlayAllSelection] = useState<BallId[]>(balls.map(({id}) => id));
    const ballElements = useRef<{ [Id in BallId]?: HTMLElement | null }>({});

    async function play(ids: readonly BallId[]) {
        const playedBalls = ids.map(id => ({id, ball: ballElements.current[id]!}));
        setPlaying(true);
        const startTime = await nextFrameTime();
        await Promise.all(playedBalls.map(({id, ball}) => playToEnd(id, ball, transition, startTime)));
        await new Promise(resolve => setTimeout(resolve, returnDelayInMilliseconds));
        await returnToStart(playedBalls.map(({ball}) => ball), returnSpring);
        setPlaying(false);
    }

    return (
        <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-base font-medium">Playback</h2>
                <ChipTray
                    label="Balls to play"
                    options={balls.map(({id, title}) => ({value: id, label: title}))}
                    value={playAllSelection}
                    onValueChange={selection => setPlayAllSelection(selection as BallId[])}
                    action={{
                        id: "play",
                        label: "Play the selected balls",
                        icon: <PlayIcon/>,
                        onSelect: () => play(playAllSelection),
                        disabled: playing || playAllSelection.length === 0
                    }}
                />
            </div>
            <div className="grid gap-6">
                {balls.map(({id, title, method}) => (
                    <div key={id} className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-medium">
                                {title} <span className="font-normal text-muted-foreground">{method}</span>
                            </h3>
                            <TrayIconButton label={`Play ${title}`} disabled={playing} onClick={() => play([id])}>
                                <PlayIcon/>
                            </TrayIconButton>
                        </div>
                        <div className="" style={{ backgroundImage: "linear-gradient(to bottom, transparent calc(50% - 1px), var(--muted) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px))" }}>
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
