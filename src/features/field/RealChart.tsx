import { useEffect, useRef, useState } from "react";
export type PlotPoint = {
  x: number;
  y: number;
  label: string;
  detail?: string;
};
export default function RealChart({
  points,
  xLabel,
  yLabel,
  thresholds = [],
  onPoint,
  invertY = false,
}: {
  points: PlotPoint[];
  xLabel: string;
  yLabel: string;
  thresholds?: number[];
  onPoint?: (index: number) => void;
  invertY?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const measure = () => setWidth(Math.max(270, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [points.length]);
  const right = width - 20,
    plotWidth = right - 66;
  const valid = points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (!valid.length)
    return <div className="rf-empty">선택한 기간의 수치가 없습니다.</div>;
  const minX = Math.min(...valid.map((p) => p.x)),
    maxX = Math.max(...valid.map((p) => p.x));
  const allY = [...valid.map((p) => p.y), ...thresholds];
  const minY = Math.min(0, ...allY),
    maxY = Math.max(...allY, minY + 0.01);
  const pad = (maxY - minY) * 0.1 || 1;
  const low = minY - pad,
    high = maxY + pad;
  const sx = (x: number) => 66 + ((x - minX) / (maxX - minX || 1)) * plotWidth;
  const sy = (y: number) =>
    invertY
      ? 40 + ((y - low) / (high - low)) * 235
      : 275 - ((y - low) / (high - low)) * 235;
  const current =
    selected === null ? valid.at(-1) : valid[selected] || valid.at(-1);
  return (
    <div className="rf-plot" ref={host}>
      <svg
        viewBox={`0 0 ${width} 335`}
        role="img"
        aria-label={`${xLabel} 대비 ${yLabel} 차트, ${valid.length}개 데이터점`}
      >
        <text x="16" y="20" className="rf-axis-title">
          {yLabel}
        </text>
        {Array.from({ length: 5 }, (_, i) => {
          const v = low + ((high - low) * i) / 4;
          return (
            <g key={i}>
              <line x1="66" x2={right} y1={sy(v)} y2={sy(v)} stroke="#e7ecf2" />
              <text x="57" y={sy(v) + 4} textAnchor="end">
                {v.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}
              </text>
            </g>
          );
        })}
        {thresholds.map((t, i) => (
          <g key={i}>
            <line
              x1="66"
              x2={right}
              y1={sy(t)}
              y2={sy(t)}
              stroke={["#e79428", "#dc6950", "#b42943"][i]}
              strokeDasharray="6 4"
            />
            <text x={right - 2} y={sy(t) - 5} textAnchor="end" fill="#a36518">
              {i + 1}차 {t.toFixed(2)}
            </text>
          </g>
        ))}
        <polyline
          points={valid.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
          fill="none"
          stroke="#0f6fff"
          strokeWidth="2.5"
        />
        {valid.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={selected === i ? 5 : 3}
            fill={selected === i ? "#e56c3e" : "#0f6fff"}
            tabIndex={0}
            role="button"
            aria-label={`${p.label}, ${yLabel} ${p.y}`}
            onFocus={() => setSelected(i)}
            onMouseEnter={() => setSelected(i)}
            onClick={() => {
              setSelected(i);
              onPoint?.(points.indexOf(p));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onPoint?.(points.indexOf(p));
            }}
          >
            <title>
              {p.label}: {p.y} · {p.detail}
            </title>
          </circle>
        ))}
        {(width < 500 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f, i) => {
          return (
            <text key={i} x={66 + plotWidth * f} y="298" textAnchor="middle">
              {xLabel.includes("날짜")
                ? new Date(minX + (maxX - minX) * f).toISOString().slice(5, 10)
                : (minX + (maxX - minX) * f).toFixed(1)}
            </text>
          );
        })}
        <text
          x={(66 + right) / 2}
          y="326"
          textAnchor="middle"
          className="rf-axis-title"
        >
          {xLabel}
        </text>
      </svg>
      <div className="rf-point">
        <strong>{current?.label}</strong>
        <span>
          {current?.y.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}{" "}
          {yLabel}
        </span>
        <span>{current?.detail}</span>
      </div>
    </div>
  );
}
