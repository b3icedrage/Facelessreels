import { useMemo } from "react";
import type { TickPoint } from "@/lib/deriv";

interface LiveChartProps {
  ticks: TickPoint[];
  className?: string;
}

const W = 600;
const H = 260;
const PAD_X = 8;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

export function LiveChart({ ticks, className }: LiveChartProps) {
  const { linePath, areaPath, points, min, max, first, last, up } = useMemo(() => {
    if (ticks.length < 2) {
      return { linePath: "", areaPath: "", points: [], min: 0, max: 0, first: null, last: null, up: true };
    }
    const values = ticks.map((t) => t.quote);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = range * 0.12;
    const lo = min - pad;
    const hi = max + pad;

    const n = ticks.length;
    const pts = ticks.map((t, i) => {
      const x = PAD_X + (i / (n - 1)) * (W - PAD_X * 2);
      const y = PAD_TOP + (1 - (t.quote - lo) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);
      return { x, y };
    });

    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - PAD_BOTTOM} L${pts[0].x.toFixed(1)},${H - PAD_BOTTOM} Z`;
    return {
      linePath: line,
      areaPath: area,
      points: pts,
      min,
      max,
      first: ticks[0].quote,
      last: ticks[ticks.length - 1].quote,
      up: ticks[ticks.length - 1].quote >= ticks[0].quote,
    };
  }, [ticks]);

  const color = up ? "#10b981" : "#f43f5e";

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Live price chart">
        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={PAD_TOP + f * (H - PAD_TOP - PAD_BOTTOM)}
            y2={PAD_TOP + f * (H - PAD_TOP - PAD_BOTTOM)}
            stroke="hsl(224 14% 16%)"
            strokeDasharray="3 5"
            strokeWidth="1"
          />
        ))}

        {points.length > 1 ? (
          <>
            <path d={areaPath} fill={color} opacity="0.12" />
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {/* last price marker */}
            <line
              x1={points[points.length - 1].x}
              x2={points[points.length - 1].x}
              y1={PAD_TOP}
              y2={H - PAD_BOTTOM}
              stroke={color}
              strokeOpacity="0.35"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill={color} />
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="8" fill={color} opacity="0.2" />
            {/* price labels */}
            <text x={W - PAD_X} y={PAD_TOP + 10} textAnchor="end" fontSize="10" fill={color} fontFamily="JetBrains Mono, monospace">
              {max.toFixed(4)}
            </text>
            <text x={W - PAD_X} y={H - PAD_BOTTOM - 2} textAnchor="end" fontSize="10" fill="hsl(220 12% 60%)" fontFamily="JetBrains Mono, monospace">
              {min.toFixed(4)}
            </text>
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="hsl(220 12% 50%)">
            waiting for market ticks…
          </text>
        )}
      </svg>

      {last != null && first != null && (
        <div className="pointer-events-none absolute right-2 top-2 rounded border border-border/60 bg-background/80 px-2 py-1 font-mono text-[11px] backdrop-blur">
          <span className={up ? "text-emerald-400" : "text-rose-400"}>
            {up ? "▲" : "▼"} {last.toFixed(4)}
          </span>
          <span className="ml-2 text-muted-foreground">
            {up ? "+" : ""}
            {((last - first) / first * 100).toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}
