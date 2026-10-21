import type {Metadata} from "next";
import {SpringDemo} from "./spring-demo";

export const metadata: Metadata = {
    title: "Spring motion · TimesFPS",
    description: "The same spring played with CSS linear(), TimesFPS on WAAPI, and Motion on animation frames."
};

export default function SpringPage() {
    return (
        <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:px-6">
            <header className="grid gap-1.5">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">Spring motion</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    One spring, played three ways. TimesFPS fits it with cubic Bézier keyframes that follow it within 0.1%, plotted below against the true spring.
                </p>
            </header>
            <SpringDemo/>
        </main>
    );
}
