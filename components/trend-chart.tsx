/** Dependency-free SVG line chart of daily average score. */
export function TrendChart({ data, threshold }: { data: { day: string; avgScore: number | null; messages: number }[]; threshold: number }) {
  const W = 640, H = 160, P = 24;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P);
  const pts = data.map((d, i) => (d.avgScore == null ? null : `${x(i)},${y(d.avgScore)}`));
  const segments: string[][] = [[]];
  pts.forEach((p) => (p ? segments[segments.length - 1].push(p) : segments.push([])));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="Daily average compliance score">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="stroke-muted" strokeWidth={1} />
          <text x={2} y={y(v) + 4} className="fill-muted-foreground text-[10px]">{v}</text>
        </g>
      ))}
      <line x1={P} x2={W - P} y1={y(threshold)} y2={y(threshold)} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />
      {segments.filter((s) => s.length).map((s, i) => (
        <polyline key={i} points={s.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />
      ))}
      {data.map((d, i) =>
        d.avgScore == null ? null : (
          <circle key={d.day} cx={x(i)} cy={y(d.avgScore)} r={3} className={d.avgScore < threshold ? "fill-red-500" : "fill-foreground"}>
            <title>{`${d.day}: ${d.avgScore} avg over ${d.messages} message(s)`}</title>
          </circle>
        ),
      )}
      <text x={P} y={H - 4} className="fill-muted-foreground text-[10px]">{data[0]?.day}</text>
      <text x={W - P} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{data[data.length - 1]?.day}</text>
    </svg>
  );
}
