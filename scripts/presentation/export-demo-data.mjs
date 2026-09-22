import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createRealModel,
  realGrid,
  realGridQuality,
  realLOO,
} from "../../src/features/ground/real-engine.mjs";
import { siteModelDomain } from "../../src/features/ground/model-domain.mjs";
import { buildLayerVolumes } from "../../src/features/ground/volume-geometry.mjs";
import { sliceClosedMesh } from "../../src/features/ground/mesh-slicer.mjs";
import {
  evaluateSensor,
  monitoringMetric,
} from "../../src/features/field/real-engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../..");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(app, name), "utf8"));
const sha = (name) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(app, name)))
    .digest("hex");
const write = (name, value) =>
  fs.writeFileSync(path.join(here, name), JSON.stringify(value));
const boreholes = read("src/data/real-ground/boreholes.json");
const assets = read("public/data/ground/site-assets.json");
const holes = boreholes.holes.filter((h) => h.campaign === "2022-08");
const parameters = { model: "spherical", range: 150, sill: 50, nugget: 0 };
const domain = siteModelDomain(boreholes.holes, assets.cad.boundaryEN);
const model = createRealModel(holes, parameters, domain);
const grid = realGrid(model, 65, 65);
const rockHeights = grid.points.flatMap((p) =>
  p.values[2] ? [p.values[2].value] : [],
);
const maxBase =
  Math.floor(
    (Math.min(
      ...rockHeights,
      ...holes.map((h) => h.collar - h.observedBottom),
    ) -
      1) *
      10,
  ) / 10;
const baseElevation = Math.min(
  maxBase - 1,
  Math.floor(Math.min(...holes.map((h) => h.collar - h.observedBottom)) / 5) *
    5 -
    5,
);
const volumes = buildLayerVolumes(grid, {
  extrapolate: true,
  hulls: model.horizons.map((h) => h.model?.hull ?? null),
  baseElevation,
});
const origin = [
  (domain.bounds[0] + domain.bounds[2]) / 2,
  (domain.bounds[1] + domain.bounds[3]) / 2,
  50,
];
const r = (n) => Math.round(n * 1e8) / 1e8;
const en = (p) => [r(p[0] - origin[0]), r(p[1] - origin[1])];
const enh = (p) => [
  r(p[0] - origin[0]),
  r(p[1] - origin[1]),
  r(p[2] - origin[2]),
];
const positions = [];
const ids = new Map();
const layers = volumes.layers.map((layer) => {
  const indices = [];
  for (let i = 0; i < layer.positions.length; i += 3) {
    const p = enh(layer.positions.slice(i, i + 3));
    const key = p.join(",");
    let id = ids.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      ids.set(key, id);
      positions.push(...p);
    }
    indices.push(id);
  }
  return {
    id: layer.id,
    name: layer.name,
    color: layer.color,
    indices,
    stats: layer.stats,
  };
});
const ground = {
  schemaVersion: 1,
  siteLabel: "이천 OO현장",
  campaign: "2022-08",
  modelHoleCount: holes.length,
  allCampaignHoleCount: boreholes.holes.length,
  units: "m",
  coordinateOrder: ["E-local", "N-local", "H-local"],
  originENH: origin,
  boundsEN: domain.bounds,
  localBoundsEN: [
    ...en(domain.bounds.slice(0, 2)),
    ...en(domain.bounds.slice(2)),
  ],
  baseElevation,
  topElevation: Math.ceil(
    Math.max(
      ...grid.points.flatMap((p) =>
        p.values.filter(Boolean).map((h) => h.value),
      ),
    ) + 2,
  ),
  verticalExaggeration: 1.5,
  parameters,
  domain,
  grid: { nx: grid.nx, ny: grid.ny, quality: realGridQuality(grid) },
  positions,
  layers,
  cadBoundaryEN: assets.cad.boundaryEN.map(en),
  observationHullEN: model.horizons[0].model.hull.map(en),
  holes: holes.map((h) => ({
    id: h.id,
    label: h.label,
    campaign: h.campaign,
    position: enh([h.easting, h.northing, h.collar]),
    collar: h.collar,
    observedBottom: h.observedBottom,
    layers: h.layers.map((l) => ({ name: l.name, from: l.from, to: l.to })),
  })),
  crossValidation: realLOO(model).map(({ id, name, count, rmse }) => ({
    id,
    name,
    count,
    rmse,
  })),
  provenance: {
    boreholesSha256: sha("src/data/real-ground/boreholes.json"),
    siteAssetsSha256: sha("public/data/ground/site-assets.json"),
    engine: "createRealModel → realGrid(65,65) → buildLayerVolumes",
    codePaths: [
      "src/features/ground/real-engine.mjs",
      "src/features/ground/model-domain.mjs",
      "src/features/ground/volume-geometry.mjs",
    ],
  },
  limitations: [
    "관측공 사이와 밖의 지층은 크리깅 추정입니다. 관측공 밖은 외삽입니다.",
    `암반 하부는 표시 하한 EL. ${baseElevation} m까지 연장한 가정이며 관측한 암반 바닥이 아닙니다.`,
    "시추공 좌표계는 원문에 명시되지 않았고 수직기준 일치는 확정되지 않았습니다.",
    "현장명만 가렸으며 실제 자료에서 만든 형상과 수치는 합성 데이터가 아닙니다.",
  ],
};
write("ground-demo.json", ground);

const monitoring = read("src/data/real-field/monitoring.json");
const plan = read("src/data/real-field/monitoring-plan.json");
const selected = ["INC-1", "F-2"];
const monitorDemo = {
  schemaVersion: 1,
  siteLabel: "이천 OO현장",
  period: monitoring.period,
  sensorCount: monitoring.sensors.length,
  reportCount: monitoring.reports.length,
  plan: {
    viewBox: plan.viewBox,
    geometry: plan.geometry,
    locations: plan.locations,
    annotations: plan.annotations,
    source: {
      reportId: plan.source.reportId,
      page: plan.source.page,
      title: plan.source.title,
      note: plan.source.note,
    },
    limitations: plan.source.limitations,
  },
  sensors: monitoring.sensors.map((sensor) => {
    const location = plan.locations.find((p) => p.id === sensor.id);
    const evaluation = evaluateSensor(sensor);
    return {
      id: sensor.id,
      kind: sensor.kind,
      label: sensor.label,
      location: sensor.location,
      point: location?.point ?? null,
      positionNote: location?.note ?? "위치 미확인",
      unit: sensor.unit,
      criteria: sensor.criteria,
      criteriaConfirmed: sensor.criteriaConfirmed,
      evaluation,
      chartAvailable: selected.includes(sensor.id),
      ...(selected.includes(sensor.id)
        ? {
            metric: sensor.kind === "F" ? "일간 유량" : "최대 누적변위 절댓값",
            rows: sensor.rows.map((row) => ({
              date: row.date,
              value:
                sensor.kind === "F"
                  ? monitoringMetric(sensor, row)
                  : Math.abs(monitoringMetric(sensor, row)),
              rawValue: row.value,
              ...(Number.isFinite(row.calculatedRate)
                ? { calculatedRate: row.calculatedRate }
                : {}),
              source: { report: row.source.report, page: row.source.page },
            })),
            qc: sensor.qc,
            limitations:
              sensor.kind === "INC"
                ? [
                    "화면 판정은 누적변위 기준입니다. 토사·암반별 속도기준은 적용 구간 확인이 필요합니다.",
                  ]
                : sensor.qc,
          }
        : {}),
    };
  }),
  provenance: {
    monitoringSha256: sha("src/data/real-field/monitoring.json"),
    planSha256: sha("src/data/real-field/monitoring-plan.json"),
    engine:
      "monitoringMetric / evaluateSensor from src/features/field/real-engine.mjs",
  },
  limitations: [
    "보고서에서 읽은 도면 상대 위치이며 현장 측량 좌표가 아닙니다.",
    "원문 이미지·이름·연락처는 포함하지 않았습니다. 보고서 제공 기간의 기록이며 실시간 데이터가 아닙니다.",
  ],
};
write("monitoring-demo.json", monitorDemo);

// Verify the indexed export remains closed and supports exact caps in local coordinates.
const checks = layers.flatMap((layer) => {
  const expanded = layer.indices.flatMap((id) =>
    positions.slice(id * 3, id * 3 + 3),
  );
  return [45, 50, 55, 60].map((elevation) => {
    const sliced = sliceClosedMesh(
      { positions: expanded },
      { axis: "z", value: elevation - origin[2], keep: "below" },
    );
    return { layer: layer.id, elevation, ...sliced.stats };
  });
});
const receipt = {
  generatedAt: new Date().toISOString(),
  sourceModelParametersMatchAppDefaults: true,
  modelHoleCount: holes.length,
  allCampaignHoleCount: boreholes.holes.length,
  grid: [65, 65],
  baseElevation,
  bounds: domain.bounds,
  vertexCount: positions.length / 3,
  triangleCount: layers.reduce((n, layer) => n + layer.indices.length / 3, 0),
  files: ["ground-demo.json", "monitoring-demo.json"].map((name) => ({
    name,
    bytes: fs.statSync(path.join(here, name)).size,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(here, name)))
      .digest("hex"),
  })),
  sliceChecks: checks,
  monitoring: {
    sensors: monitoring.sensors.length,
    located: plan.locations.filter((p) => p.point).length,
    chartIds: selected,
  },
};
fs.writeFileSync(
  path.join(here, "data-verification.json"),
  JSON.stringify(receipt, null, 2),
);
console.log(
  JSON.stringify(
    { ...receipt, sliceChecks: `${checks.length} passed` },
    null,
    2,
  ),
);
