import { useEffect, useRef, useState } from "react";

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, entries[0].contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
const display = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
type PlatePoint = {
  rowNumber: number;
  pressure: number | null;
  settlement: number | null;
  time: number | null;
  stage: string;
  problems: string[];
};
export function PlateChart({
  rows,
  limit,
  selected,
  onSelect,
}: {
  rows: PlatePoint[];
  limit: number | null;
  selected: number;
  onSelect: (row: number) => void;
}) {
  const { ref, width } = useWidth();
  const height = 340;
  const left = 56,
    right = width - 22,
    top = 32,
    bottom = height - 50;
  const points = rows.filter(
    (r) => !r.problems.length && r.pressure !== null && r.settlement !== null,
  );
  const maxX = Math.max(100, ...points.map((p) => p.pressure!)) * 1.1;
  const maxY =
    Math.max(5, limit || 0, ...points.map((p) => p.settlement!)) * 1.15;
  const x = (v: number) => left + (v / maxX) * (right - left);
  const y = (v: number) => top + (v / maxY) * (bottom - top);
  const colors: Record<string, string> = {
    재하: "#1767dc",
    유지: "#b76b00",
    제하: "#6796b5",
  };
  return (
    <div className="field-chart-frame" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="압력과 침하 곡선. 원을 선택하면 해당 원시 측정값을 확인합니다."
      >
        <text x={left} y={16} className="field-axis-title">
          침하 (mm) ↓
        </text>
        {Array.from({ length: 5 }, (_, i) => {
          const v = (maxY * i) / 4;
          return (
            <g key={`y${i}`}>
              <line
                x1={left}
                x2={right}
                y1={y(v)}
                y2={y(v)}
                className="field-gridline"
              />
              <text
                x={left - 10}
                y={y(v) + 4}
                textAnchor="end"
                className="field-axis-label"
              >
                {display(v)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const v = (maxX * i) / 4;
          return (
            <g key={`x${i}`}>
              <line
                x1={x(v)}
                x2={x(v)}
                y1={top}
                y2={bottom}
                className="field-gridline field-gridline-vertical"
              />
              <text
                x={x(v)}
                y={bottom + 22}
                textAnchor="middle"
                className="field-axis-label"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        <text
          x={(left + right) / 2}
          y={height - 6}
          textAnchor="middle"
          className="field-axis-title"
        >
          재하 압력 (kPa)
        </text>
        {limit !== null && limit > 0 && (
          <g>
            <line
              x1={left}
              x2={right}
              y1={y(limit)}
              y2={y(limit)}
              className="field-limit-line"
            />
            <text
              x={right - 4}
              y={y(limit) - 7}
              textAnchor="end"
              className="field-limit-label"
            >
              관리기준 {display(limit)} mm
            </text>
          </g>
        )}
        {points.slice(1).map((p, i) => {
          const prev = points[i];
          return (
            <line
              key={`segment${p.rowNumber}`}
              x1={x(prev.pressure!)}
              y1={y(prev.settlement!)}
              x2={x(p.pressure!)}
              y2={y(p.settlement!)}
              stroke={colors[p.stage]}
              strokeWidth="2.5"
              strokeDasharray={p.stage === "제하" ? "6 4" : undefined}
            />
          );
        })}
        {points.map((p) => (
          <circle
            key={p.rowNumber}
            cx={x(p.pressure!)}
            cy={y(p.settlement!)}
            r={p.rowNumber === selected ? 7 : 4.5}
            fill={p.rowNumber === selected ? "#fff" : colors[p.stage]}
            stroke={colors[p.stage]}
            strokeWidth={p.rowNumber === selected ? 3 : 1}
            tabIndex={0}
            role="button"
            aria-label={`${p.rowNumber}행 ${p.stage}, ${p.pressure!.toFixed(1)} kPa, 침하 ${p.settlement} mm`}
            onClick={() => onSelect(p.rowNumber)}
            onFocus={() => onSelect(p.rowNumber)}
            onMouseEnter={() => onSelect(p.rowNumber)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(p.rowNumber);
              }
            }}
          >
            <title>
              {p.rowNumber}행 · {p.time}분 · {p.stage} ·{" "}
              {p.pressure!.toFixed(2)} kPa · {p.settlement} mm
            </title>
          </circle>
        ))}
        {!points.length && (
          <text
            x={width / 2}
            y={160}
            textAnchor="middle"
            className="field-axis-title"
          >
            검토 가능한 측정값이 없습니다
          </text>
        )}
      </svg>
      <div className="field-chart-legend">
        <span>
          <i style={{ background: colors["재하"] }} />
          재하
        </span>
        <span>
          <i style={{ background: colors["유지"] }} />
          유지
        </span>
        <span>
          <i style={{ background: colors["제하"] }} />
          제하
        </span>
        <span className="field-legend-hint">측정점을 선택해 원시 행 확인</span>
      </div>
    </div>
  );
}

type MonitoringPoint = {
  rowNumber: number;
  stamp: number | null;
  magnitude: number | null;
  sensor: string;
  problems: string[];
};
export function MonitoringChart({
  rows,
  warning,
  action,
  selected,
  onSelect,
}: {
  rows: MonitoringPoint[];
  warning: number | null;
  action: number | null;
  selected: number;
  onSelect: (row: number) => void;
}) {
  const { ref, width } = useWidth();
  const height = 320;
  const left = 52,
    right = width - 25,
    top = 30,
    bottom = height - 48;
  const points = rows.filter(
    (r) => !r.problems.length && r.stamp !== null && r.magnitude !== null,
  );
  const minimumTime = Math.min(...points.map((p) => p.stamp!));
  const maximumTime = Math.max(...points.map((p) => p.stamp!));
  const maxY =
    Math.max(
      10,
      warning || 0,
      action || 0,
      ...points.map((p) => p.magnitude!),
    ) * 1.22;
  const x = (v: number) =>
    left +
    ((v - minimumTime) / (maximumTime - minimumTime || 1)) * (right - left);
  const y = (v: number) => bottom - (v / maxY) * (bottom - top);
  const sensors = [...new Set(points.map((p) => p.sensor))];
  const palette = ["#1767dc", "#0b8577", "#7251aa", "#b06b19"];
  const date = (stamp: number) =>
    new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Seoul",
    }).format(stamp);
  return (
    <div className="field-chart-frame" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="시간별 기준 대비 변위 절댓값과 주의·조치 기준"
      >
        <text x={left} y={16} className="field-axis-title">
          기준 대비 변위 |Δ| (mm)
        </text>
        {Array.from({ length: 5 }, (_, i) => {
          const v = (maxY * i) / 4;
          return (
            <g key={`y${i}`}>
              <line
                x1={left}
                x2={right}
                y1={y(v)}
                y2={y(v)}
                className="field-gridline"
              />
              <text
                x={left - 9}
                y={y(v) + 4}
                textAnchor="end"
                className="field-axis-label"
              >
                {display(v)}
              </text>
            </g>
          );
        })}
        {points.length > 0 &&
          Array.from({ length: 4 }, (_, i) => {
            const t = minimumTime + ((maximumTime - minimumTime) * i) / 3;
            return (
              <text
                key={i}
                x={x(t)}
                y={bottom + 23}
                textAnchor="middle"
                className="field-axis-label"
              >
                {date(t)}
              </text>
            );
          })}
        <text
          x={right}
          y={height - 5}
          textAnchor="end"
          className="field-axis-label"
        >
          측정일 · KST
        </text>
        {[
          { value: warning, name: "주의", color: "#b97608" },
          { value: action, name: "조치", color: "#c54238" },
        ].map(
          (t) =>
            t.value !== null &&
            t.value > 0 && (
              <g key={t.name}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(t.value)}
                  y2={y(t.value)}
                  stroke={t.color}
                  strokeWidth="1.5"
                  strokeDasharray="6 5"
                />
                <text
                  x={right - 3}
                  y={y(t.value) - 6}
                  textAnchor="end"
                  fill={t.color}
                  fontSize="12"
                  fontWeight="600"
                >
                  {t.name} {t.value} mm
                </text>
              </g>
            ),
        )}
        {sensors.map((sensor, i) => (
          <polyline
            key={sensor}
            points={points
              .filter((p) => p.sensor === sensor)
              .map((p) => `${x(p.stamp!)},${y(p.magnitude!)}`)
              .join(" ")}
            fill="none"
            stroke={palette[i % palette.length]}
            strokeWidth="2.5"
          />
        ))}
        {points.map((p) => {
          const color = palette[sensors.indexOf(p.sensor) % palette.length];
          return (
            <circle
              key={p.rowNumber}
              cx={x(p.stamp!)}
              cy={y(p.magnitude!)}
              r={selected === p.rowNumber ? 6.5 : 4}
              fill={selected === p.rowNumber ? "#fff" : color}
              stroke={color}
              strokeWidth="2.5"
              tabIndex={0}
              role="button"
              aria-label={`${p.rowNumber}행 ${p.sensor}, 변위 ${p.magnitude} mm`}
              onMouseEnter={() => onSelect(p.rowNumber)}
              onFocus={() => onSelect(p.rowNumber)}
              onClick={() => onSelect(p.rowNumber)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p.rowNumber);
                }
              }}
            >
              <title>
                {p.rowNumber}행 · {p.sensor} · {p.magnitude} mm
              </title>
            </circle>
          );
        })}
        {!points.length && (
          <text
            x={width / 2}
            y={155}
            textAnchor="middle"
            className="field-axis-title"
          >
            검토 가능한 측정값이 없습니다
          </text>
        )}
      </svg>
      <div className="field-chart-legend">
        {sensors.map((sensor, i) => (
          <span key={sensor}>
            <i style={{ background: palette[i % palette.length] }} />
            {sensor}
          </span>
        ))}
        <span className="field-legend-hint">각 점은 원시 측정 1행입니다</span>
      </div>
    </div>
  );
}
