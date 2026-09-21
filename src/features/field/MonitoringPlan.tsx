import { ExternalLink, MapPin } from "lucide-react";
import planData from "../../data/real-field/monitoring-plan.json";

type PlanLocation = {
  id: string;
  point: [number, number] | null;
  confidence: "approximate" | "unlocated";
  note: string;
  group?: string;
};
type Plan = {
  source: { title: string; url: string; page: number; note: string };
  viewBox: [number, number, number, number];
  geometry: {
    kind: "boundary" | "retaining" | "building" | "context";
    points: [number, number][];
    closed: boolean;
  }[];
  locations: PlanLocation[];
  annotations?: { text: string; x: number; y: number }[];
};
const plan = planData as unknown as Plan;

export default function MonitoringPlan({
  sensorId,
  sensorLabel,
}: {
  sensorId: string;
  sensorLabel: string;
}) {
  const selected = plan.locations.find((location) => location.id === sensorId);
  const point = selected?.point;
  const [left, top, width, height] = plan.viewBox;
  const labelWidth = sensorId.length * 28 + 36;
  const labelX = point
    ? Math.max(
        left + 12,
        Math.min(point[0] + 38, left + width - labelWidth - 12),
      )
    : 0;
  const labelY = point
    ? Math.max(top + 12, Math.min(point[1] - 78, top + height - 78))
    : 0;
  const markers = new Map<string, { point: [number, number]; ids: string[] }>();
  for (const location of plan.locations) {
    if (!location.point) continue;
    const key = location.point.join(",");
    const marker = markers.get(key);
    if (marker) marker.ids.push(location.id);
    else markers.set(key, { point: location.point, ids: [location.id] });
  }

  return (
    <section className="rf-card rf-monitor-plan" aria-label="선택 계측기 위치">
      <div className="rf-monitor-plan-heading">
        <h2>
          <MapPin size={16} aria-hidden="true" />
          계측 위치
        </h2>
        <span>보고서 기준 대략 위치</span>
      </div>
      <div className="rf-monitor-plan-body">
        <div className="rf-monitor-plan-drawing">
          <svg
            viewBox={plan.viewBox.join(" ")}
            role="img"
            aria-label={
              point
                ? `계측계획 평면도 · ${sensorId} 위치 강조`
                : `계측계획 평면도 · ${sensorId} 위치 미확인`
            }
          >
            <title>
              {point
                ? `${sensorId}의 보고서 평면도상 대략 위치`
                : `${sensorId}의 위치는 평면도에서 확인되지 않았습니다`}
            </title>
            {plan.geometry.map((line, index) => (
              <path
                key={index}
                className={`rf-plan-line rf-plan-${line.kind}`}
                d={`${line.points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ")}${line.closed ? " Z" : ""}`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {plan.annotations?.map((annotation, index) => (
              <text
                key={index}
                x={annotation.x}
                y={annotation.y}
                className="rf-plan-annotation"
                textAnchor="middle"
              >
                {annotation.text}
              </text>
            ))}
            {[...markers.entries()].map(([key, marker]) => (
              <circle
                key={key}
                cx={marker.point[0]}
                cy={marker.point[1]}
                r={11}
                className="rf-plan-marker"
                vectorEffect="non-scaling-stroke"
              >
                <title>{marker.ids.join(" · ")}</title>
              </circle>
            ))}
            {point && (
              <g className="rf-plan-selected" data-sensor-id={sensorId}>
                <circle
                  cx={point[0]}
                  cy={point[1]}
                  r={35}
                  className="rf-plan-halo"
                />
                <circle
                  cx={point[0]}
                  cy={point[1]}
                  r={16}
                  className="rf-plan-selected-dot"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={labelX}
                  y={labelY}
                  width={labelWidth}
                  height={64}
                  rx={10}
                />
                <text
                  x={labelX + labelWidth / 2}
                  y={labelY + 46}
                  textAnchor="middle"
                >
                  {sensorId}
                </text>
              </g>
            )}
          </svg>
        </div>
        <div className="rf-monitor-plan-summary">
          <span className="rf-eyebrow">선택한 계측기</span>
          <strong>{sensorId}</strong>
          <span>{sensorLabel}</span>
          <p>
            {point
              ? selected?.note || "평면도의 파란 점으로 위치를 확인하세요."
              : "평면도에서 위치 미확인"}
          </p>
          <a
            href={plan.source.url}
            target="_blank"
            rel="noreferrer"
            className="rf-monitor-plan-source"
          >
            계측계획 평면도 · p{plan.source.page}
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
      </div>
      <p className="rf-monitor-plan-caption">
        보고서의 설치기호를 옮긴 안내도입니다. 측량 좌표와 일치하는 위치 정보는
        아닙니다.
      </p>
    </section>
  );
}
