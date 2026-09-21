import { useEffect, useRef, useState } from "react";
import type { GroundVolume, SliceState } from "./model-view";
import { SLICE_AXES } from "./model-view";
import type { RealHole } from "./real-types";
import { LITHOLOGY_COLORS } from "./real-engine.mjs";

export default function ModelSliceSection({
  layers,
  slice,
  visible,
  bounds,
  baseElevation,
  topElevation,
  holes,
  linked,
}: {
  layers: GroundVolume[];
  slice: SliceState;
  visible: boolean[];
  bounds: number[];
  baseElevation: number;
  topElevation: number;
  holes: RealHole[];
  linked: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null),
    [width, setWidth] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(() =>
      setWidth(Math.max(260, ref.current!.getBoundingClientRect().width)),
    );
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  const axis = slice.axis,
    level = slice.positions[axis],
    horizontal = axis === "x" ? 1 : 0,
    vertical = axis === "z" ? 1 : 2,
    height = axis === "z" ? 380 : 300,
    x0 = bounds[horizontal],
    x1 = bounds[horizontal + 2],
    y0 = axis === "z" ? bounds[1] : baseElevation,
    y1 = axis === "z" ? bounds[3] : topElevation,
    left = width < 500 ? 56 : 70,
    right = 26,
    top = 26,
    bottom = 48,
    plotW = width - left - right,
    plotH = height - top - bottom,
    // Plan sections retain equal E/N scale; vertical sections use clearly labelled axes.
    planScale = Math.min(plotW / (x1 - x0), plotH / (y1 - y0)),
    x = (n: number) =>
      axis === "z"
        ? left + (plotW - (x1 - x0) * planScale) / 2 + (n - x0) * planScale
        : left + ((n - x0) / (x1 - x0)) * plotW,
    y = (n: number) =>
      axis === "z"
        ? top + (plotH + (y1 - y0) * planScale) / 2 - (n - y0) * planScale
        : height - bottom - ((n - y0) / (y1 - y0)) * plotH,
    path = (ps: number[]) => {
      let d = "";
      for (let i = 0; i < ps.length; i += 9) {
        d += `M${x(ps[i + horizontal])},${y(ps[i + vertical])}L${x(ps[i + 3 + horizontal])},${y(ps[i + 3 + vertical])}L${x(ps[i + 6 + horizontal])},${y(ps[i + 6 + vertical])}Z`;
      }
      return d;
    },
    hasSection = layers.some((l, i) => visible[i] && !!l.capPositions?.length),
    labels = width < 500 ? 3 : 5;
  return (
    <section className="real-panel real-slice-panel">
      <div className="real-panel-heading">
        <div>
          <h2>{SLICE_AXES[axis].title}</h2>
          <p>
            {SLICE_AXES[axis].coordinate}{" "}
            {level.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} m · 3D
            {linked
              ? "메쉬와 같은 절단면"
              : "절단 꺼짐 · 선택 좌표의 참고 단면"}
          </p>
        </div>
        <span className="real-slice-badge">
          {axis === "z" ? "평면 · 동일 축척" : "단면 · 표고 기준"}
        </span>
      </div>
      <svg
        ref={ref}
        className="real-section"
        style={{ height }}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${SLICE_AXES[axis].title} ${level}m 지층 단면`}
      >
        {Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4).map(
          (n) => (
            <g key={n}>
              <line
                x1={x(x0)}
                x2={x(x1)}
                y1={y(n)}
                y2={y(n)}
                stroke="#e3eaf0"
              />
              <text x={x(x0) - 8} y={y(n) + 4} textAnchor="end">
                {n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
              </text>
            </g>
          ),
        )}
        {layers.map(
          (l, i) =>
            visible[i] && (
              <path
                key={l.id}
                d={path(l.capPositions ?? [])}
                fill={l.color}
                aria-label={`${l.name} 절단 영역`}
              />
            ),
        )}
        {holes
          .filter(
            (h) =>
              axis === "z" ||
              Math.abs((axis === "x" ? h.easting : h.northing) - level) <= 3,
          )
          .map((h) => {
            if (axis === "z") {
              if (level > h.collar || level < h.collar - h.observedBottom)
                return null;
              return (
                <g key={h.id}>
                  <circle
                    cx={x(h.easting)}
                    cy={y(h.northing)}
                    r={3}
                    fill="#fff"
                    stroke="#1c344e"
                  />
                  <title>{h.label} · 관측 시추공</title>
                </g>
              );
            }
            return (
              <g key={h.id}>
                {h.layers.map((l, i) => (
                  <rect
                    key={i}
                    x={x(axis === "x" ? h.northing : h.easting) - 3}
                    y={y(h.collar - l.from)}
                    width={6}
                    height={Math.max(
                      0.2,
                      y(h.collar - l.to) - y(h.collar - l.from),
                    )}
                    fill={
                      (LITHOLOGY_COLORS as Record<string, string>)[l.name] ??
                      "#aaa"
                    }
                    stroke="white"
                    strokeWidth={0.6}
                  />
                ))}
                <title>{h.label} · 단면에서 3m 이내의 관측 주상도</title>
              </g>
            );
          })}
        {!hasSection && (
          <text x={width / 2} y={height / 2} textAnchor="middle">
            이 위치에는 표시할 지층 단면이 없습니다.
          </text>
        )}
        {Array.from(
          { length: labels },
          (_, i) => x0 + ((x1 - x0) * i) / (labels - 1),
        ).map((n) => (
          <text key={n} x={x(n)} y={height - 25} textAnchor="middle">
            {n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
          </text>
        ))}
        <text x={left} y={15}>
          {axis === "z" ? "Y · 북쪽 N (m)" : "Z · 표고 EL. (m)"}
        </text>
        <text x={width - right} y={height - 6} textAnchor="end">
          {axis === "x" ? "Y · 북쪽 N (m)" : "X · 동쪽 E (m)"}
        </text>
      </svg>
      <p className="real-muted">
        {axis === "z"
          ? "원은 이 높이에서 관측된 시추공 위치입니다."
          : "막대는 단면에서 3m 이내의 관측 주상도입니다."}{" "}
        암반 하부는 모델 표시 하한까지의 가정입니다.
      </p>
    </section>
  );
}
