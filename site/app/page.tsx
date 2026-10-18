import Link from "next/link";
import {demos} from "./demos";

export default function Home() {
    return (
        <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-16 sm:px-6">
            <header className="grid gap-2">
                <h1 className="font-heading text-3xl font-semibold tracking-tight">TimesFPS demos</h1>
                <p className="text-muted-foreground">Native springs and sequences on the Web Animations API.</p>
            </header>
            <ul className="grid gap-3">
                {demos.map(({href, title, description}) => (
                    <li key={href}>
                        <Link href={href} className="grid gap-1 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
                            <span className="font-medium">{title}</span>
                            <span className="text-sm text-muted-foreground">{description}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </main>
    );
}
