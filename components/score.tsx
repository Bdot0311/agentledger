import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MessageStatus, Violation } from "@/lib/types";

export function ScoreBadge({ score, threshold = 80 }: { score: number | null | undefined; threshold?: number }) {
  if (score == null) return <Badge variant="outline">not scored</Badge>;
  const variant = score >= threshold ? "success" : score >= 50 ? "warning" : "destructive";
  return <Badge variant={variant}>{score}</Badge>;
}

const STATUS_VARIANT: Record<MessageStatus, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  sent: "success",
  approved: "success",
  flagged: "warning",
  blocked: "destructive",
  rejected: "secondary",
  pending: "outline",
  received: "outline",
};

export function StatusBadge({ status }: { status: MessageStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

export function CheckScores({ scores }: { scores: { hallucination: number | null; policy: number | null; regulatory: number | null; pii: number | null } }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center text-xs">
      {Object.entries(scores).map(([k, v]) => (
        <div key={k} className="rounded-md border p-2">
          <div className="text-muted-foreground">{k === "pii" ? "PII" : k[0].toUpperCase() + k.slice(1)}</div>
          <div className={cn("text-lg font-semibold", v != null && v < 80 && "text-destructive")}>{v ?? "–"}</div>
        </div>
      ))}
    </div>
  );
}

/** Renders the email body with every cited offending sentence highlighted. */
export function HighlightedBody({ body, violations }: { body: string; violations: Violation[] }) {
  const needles = Array.from(new Set(violations.map((v) => v.offending_sentence.trim()).filter((s) => s.length > 3 && body.includes(s))));
  if (!needles.length) return <pre className="whitespace-pre-wrap font-sans text-sm">{body}</pre>;
  const escaped = needles.sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = body.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return (
    <pre className="whitespace-pre-wrap font-sans text-sm">
      {parts.map((p, i) =>
        needles.includes(p) ? (
          <mark key={i} className="rounded bg-red-100 px-0.5 text-red-900">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </pre>
  );
}

export function ViolationList({ violations }: { violations: Violation[] }) {
  if (!violations.length) return <p className="text-sm text-emerald-700">No violations.</p>;
  return (
    <ul className="space-y-2">
      {violations.map((v, i) => (
        <li key={i} className="rounded-md border p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={v.severity === "block" ? "destructive" : "warning"}>{v.severity}</Badge>
            <Badge variant="outline">{v.check}</Badge>
            <span className="font-medium">{v.rule}</span>
          </div>
          <blockquote className="border-l-2 border-red-300 pl-2 italic">“{v.offending_sentence}”</blockquote>
          <p className="mt-1 text-muted-foreground">{v.explanation}</p>
          {v.fact_sheet_line && (
            <p className="mt-1 text-xs">
              <span className="font-medium">Fact sheet:</span> <code className="rounded bg-muted px-1">{v.fact_sheet_line}</code>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
