import type {ButtonHTMLAttributes} from "react";
import "./tray.css";

/** A single icon button in the tray's colours, for actions that stand apart from a tray. */
export function TrayIconButton({label, ...props}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "className"> & { label: string }) {
    return <button type="button" className="tray-icon-button" aria-label={label} {...props}/>;
}
