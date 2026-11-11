import Link from "next/link";
import { Button } from "@/components/ui/button";

const BULLETS = [
  {
    title: "Every message, on the record",
    text: "Capture what your AI SDR sent, to whom, from which prompt and model — from Gmail, CSV or a webhook. Append-only, exportable for SOC 2 evidence.",
  },
  {
    title: "Scored against your facts and rules",
    text: "Each email is checked for hallucinated claims, policy breaks, CAN-SPAM gaps and leaked prospect data — with the exact sentence cited.",
  },
  {
    title: "A gate before the inbox",
    text: "Block-severity violations never send. Anything below your threshold waits in an approval queue: approve, edit, or reject.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="container flex items-center justify-between py-6">
        <span className="text-lg font-bold">AgentLedger</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="hover:underline">Sign in</Link>
          <Button asChild size="sm"><Link href="/signup">Start free</Link></Button>
        </nav>
      </header>

      <section className="container max-w-3xl py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Know exactly what your AI SDR said — and stop it before it lies.</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          AgentLedger is the audit log, eval engine and pre-send gate for AI agents that email your prospects. Built for founders and RevOps teams, not six-figure enterprise procurement.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/login">Sign in</Link></Button>
        </div>
      </section>

      <section className="container grid max-w-5xl gap-6 pb-20 md:grid-cols-3">
        {BULLETS.map((b) => (
          <div key={b.title} className="rounded-lg border p-6">
            <h2 className="font-semibold">{b.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
          </div>
        ))}
      </section>

      <section className="border-t bg-muted/40">
        <div className="container max-w-3xl py-12 text-center">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Pricing</p>
          <p className="mt-2 text-2xl font-semibold">Plans from $99/mo — about what you pay for the tool it governs.</p>
          <p className="mt-2 text-sm text-muted-foreground">Card checkout. No sales call. Cancel any time.</p>
          <Button asChild className="mt-6"><Link href="/signup">Start free</Link></Button>
        </div>
      </section>
    </main>
  );
}
