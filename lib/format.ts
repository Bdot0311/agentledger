export function fmtDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
