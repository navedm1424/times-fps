"use client";

import {animate, motion, type MotionValue, useMotionValue, useReducedMotion, useTransform} from "motion/react";
import {type KeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState} from "react";
import {motionTokens} from "@/lib/motion-tokens";
import "./tray.css";

export interface ChipTrayOption {
    value: string;
    label: string;
    /** Follows the label, such as a key to what the option shows. */
    icon?: ReactNode;
}

export interface ChipTrayAction {
    id: string;
    /** The accessible name; the action shows only its icon. */
    label: string;
    icon: ReactNode;
    onSelect(): void;
    disabled?: boolean;
}

interface ChipTrayProps {
    /** The accessible name of the toolbar. */
    label: string;
    options: readonly ChipTrayOption[];
    value: readonly string[];
    onValueChange(value: string[]): void;
    /** Follows the chips after a divider. */
    action?: ChipTrayAction;
}

/** The width the check takes from the label: a 12px glyph and the space after it. */
const checkSlot = 16;

/** Jumps the lag by the change, then springs it back to 0 from wherever and however fast it's moving. */
function absorb(lag: MotionValue<number>, change: number, reduce: boolean): void {
    if (reduce) return lag.jump(0);
    const velocity = lag.getVelocity();
    lag.jump(lag.get() + change);
    animate(lag, 0, {...motionTokens.spring.morph, velocity});
}

/**
 * Selectable chips in a quiet tray, after uiarc.dev's floating button group and chip group.
 * Selecting morphs the chip: a check draws in, the label slides over, and the chip's edge, its neighbours and the tray's own edges follow on a spring.
 * Arrow keys move between the items, Home and End jump to the ends, Space or Enter acts.
 */
export function ChipTray({label, options, value, onValueChange, action}: ChipTrayProps) {
    const reduce = !!useReducedMotion();
    const tray = useRef<HTMLDivElement>(null);
    const boxBeforeToggle = useRef<DOMRect>(null);
    const leftInset = useMotionValue(0);
    const rightInset = useMotionValue(0);
    const [focusedId, setFocusedId] = useState<string>();
    const ids = [...options.map(option => option.value), ...(action ? [action.id] : [])];
    const tabStop = focusedId !== undefined && ids.includes(focusedId) ? focusedId : ids[0];
    const layoutTransition = {layout: reduce ? {duration: 0} : motionTokens.spring.morph};

    // The tray's box changes in one frame; its surface keeps its old edges and springs to the new ones.
    useLayoutEffect(() => {
        const before = boxBeforeToggle.current;
        if (!before) return;
        boxBeforeToggle.current = null;
        const after = tray.current!.getBoundingClientRect();
        absorb(leftInset, before.left - after.left, reduce);
        absorb(rightInset, after.right - before.right, reduce);
    }, [value, leftInset, rightInset, reduce]);

    function toggle(toggled: string) {
        boxBeforeToggle.current = tray.current!.getBoundingClientRect();
        onValueChange(options.filter(option => option.value === toggled ? !value.includes(toggled) : value.includes(option.value)).map(option => option.value));
    }

    function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        const last = buttons.length - 1;
        const targets: { [key: string]: number } = {
            ArrowRight: index === last ? 0 : index + 1,
            ArrowLeft: index === 0 ? last : index - 1,
            Home: 0,
            End: last
        };
        if (!(event.key in targets)) return;
        event.preventDefault();
        buttons[targets[event.key]!]!.focus();
    }

    return (
        <div ref={tray} className="tray" role="toolbar" aria-label={label} onKeyDown={moveFocus}>
            <motion.span className="tray-surface" style={{left: leftInset, right: rightInset}} aria-hidden="true"/>
            {options.map(option => (
                <TrayChip
                    key={option.value}
                    option={option}
                    selected={value.includes(option.value)}
                    tabbable={tabStop === option.value}
                    reduce={reduce}
                    onToggle={toggle}
                    onFocus={setFocusedId}
                />
            ))}
            {action && (
                <>
                    <motion.span className="tray-separator" role="separator" aria-orientation="vertical" layout="position" transition={layoutTransition}/>
                    <motion.button
                        type="button"
                        className="tray-item tray-icon-item"
                        aria-label={action.label}
                        disabled={action.disabled}
                        tabIndex={tabStop === action.id ? 0 : -1}
                        onClick={action.onSelect}
                        onFocus={() => setFocusedId(action.id)}
                        layout="position"
                        transition={layoutTransition}
                    >
                        <span className="tray-item-body">
                            <span className="tray-item-surface" aria-hidden="true"/>
                            {action.icon}
                        </span>
                    </motion.button>
                </>
            )}
        </div>
    );
}

interface TrayChipProps {
    option: ChipTrayOption;
    selected: boolean;
    tabbable: boolean;
    reduce: boolean;
    onToggle(value: string): void;
    onFocus(value: string): void;
}

function TrayChip({option, selected, tabbable, reduce, onToggle, onFocus}: TrayChipProps) {
    const body = useRef<HTMLSpanElement>(null);
    const lag = useWidthLag(body, selected, reduce);
    const edge = useTransform(lag, value => -value);
    // How far the check has grown: its slot, less the width the label still lags behind, so the two never overlap.
    const grown = useMotionValue(selected ? 1 : 0);
    const checkScale = useTransform(grown, value => Math.min(value, 1.1));
    const checkOpacity = useTransform(grown, value => Math.min(1, value * 1.4));
    const checkBlur = useTransform(grown, value => value >= 1 ? "none" : `blur(${((1 - value) * motionTokens.blur.subtle).toFixed(2)}px)`);
    const checkDraw = useTransform(grown, value => Math.min(1, Math.max(0.001, value)));

    // After the transforms, so they're subscribed when a reduced-motion selection jumps straight to the end.
    useLayoutEffect(() => {
        const slot = selected ? checkSlot : 0;
        const update = () => grown.set(Math.max(0, (slot + lag.get()) / checkSlot));
        update();
        return lag.on("change", update);
    }, [selected, lag, grown]);

    return (
        <motion.button
            type="button"
            className="tray-item"
            aria-pressed={selected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onToggle(option.value)}
            onFocus={() => onFocus(option.value)}
            layout="position"
            transition={{layout: reduce ? {duration: 0} : motionTokens.spring.morph}}
        >
            <span ref={body} className="tray-item-body" data-selected={selected}>
                <motion.span className="tray-item-surface" style={{right: edge}} aria-hidden="true"/>
                <motion.span className="tray-check" style={{scale: checkScale, opacity: checkOpacity, filter: checkBlur}} aria-hidden="true">
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
                        <motion.path d="M4 12.5 9.5 18 20 6.5" style={{pathLength: checkDraw}}/>
                    </svg>
                </motion.span>
                <span className="tray-check-slot" aria-hidden="true"/>
                <motion.span className="tray-chip-content" style={{x: lag}}>
                    {option.label}
                    {option.icon}
                </motion.span>
            </span>
        </motion.button>
    );
}

/**
 * How far the chip's visible edge trails its layout edge: the layout width changes in one frame, so neighbours can glide,
 * while the edge jumps back by the change and springs after it. Passive resizes, like a late web font, only re-baseline it.
 */
function useWidthLag(node: RefObject<HTMLElement | null>, selected: boolean, reduce: boolean): MotionValue<number> {
    const lag = useMotionValue(0);
    const width = useRef<number>(null);

    useLayoutEffect(() => {
        const next = node.current!.offsetWidth;
        const previous = width.current;
        width.current = next;
        if (previous !== null && previous !== next) absorb(lag, previous - next, reduce);
    }, [selected, lag, node, reduce]);

    useEffect(() => {
        const element = node.current!;
        const observer = new ResizeObserver(() => width.current = element.offsetWidth);
        observer.observe(element);
        return () => observer.disconnect();
    }, [node]);

    return lag;
}
