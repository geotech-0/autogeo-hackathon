import {
  inverse,
  semivariance,
  validateParameters,
  convexHull,
  pointInHull,
} from "./engine.mjs";
export const REAL_GROUND_VERSION = "source-linked-variable-strata-2.0";
export const LITHOLOGY_COLORS = {
  표토층: "#cab18b",
  매립층: "#bb925f",
  전답층: "#9d9470",
  붕적층: "#d5ad6a",
  퇴적층: "#d5ad6a",
  풍화토: "#78aa9c",
  풍화암: "#627f99",
  연암: "#6e6c91",
};
export const HORIZONS = [
  {
    id: "collar",
    name: "조사 당시 공구 표고",
    color: "#c6a475",
    observed: (h) => h.collar,
  },
  {
    id: "weathered-top",
    name: "풍화토 상단",
    color: "#71a797",
    observed: (h) => {
      const l = h.layers.find((l) => l.name === "풍화토");
      return l ? h.collar - l.from : null;
    },
  },
  {
    id: "rock-top",
    name: "암반 출현면 (풍화암·연암)",
    color: "#667f9c",
    observed: (h) => {
      const l = h.layers.find((l) => ["풍화암", "연암"].includes(l.name));
      return l ? h.collar - l.from : null;
    },
  },
];
export function validateRealHoles(holes) {
  if (!Array.isArray(holes) || !holes.length || holes.length > 1000)
    return ["1~1,000개 시추 기록이 필요합니다."];
  const errors = [],
    ids = new Set();
  for (const h of holes) {
    if (!h || typeof h.id !== "string" || ids.has(h.id)) {
      errors.push("공 ID가 없거나 중복됩니다.");
      continue;
    }
    ids.add(h.id);
    if (
      ![
        "easting",
        "northing",
        "collar",
        "declaredTotalDepth",
        "observedBottom",
      ].every((k) => Number.isFinite(h[k]))
    )
      errors.push(`${h.id}: 좌표·표고·심도를 확인하세요.`);
    if (!Array.isArray(h.layers) || !h.layers.length) {
      errors.push(`${h.id}: 지층이 없습니다.`);
      continue;
    }
    let end = 0;
    for (const l of h.layers) {
      if (
        typeof l.name !== "string" ||
        !Number.isFinite(l.from) ||
        !Number.isFinite(l.to) ||
        l.from < 0 ||
        l.to <= l.from ||
        Math.abs(l.from - end) > 1e-6
      )
        errors.push(`${h.id}: 지층 순서·연속성을 확인하세요.`);
      end = l.to;
    }
    if (Math.abs(end - h.observedBottom) > 1e-6)
      errors.push(`${h.id}: 관찰 구간 종료심도가 다릅니다.`);
    if (h.declaredTotalDepth <= 0 || h.observedBottom > 1000)
      errors.push(`${h.id}: 심도 범위를 확인하세요.`);
  }
  return [...new Set(errors)];
}
export function scalarKriging(samples, p) {
  const errors = validateParameters(p);
  if (errors.length) throw Error(errors.join(" "));
  if (samples.length < 3)
    throw Error("한 경계면에 확인된 관측공 3개 이상이 필요합니다.");
  const seen = new Set();
  for (const q of samples) {
    if (![q.easting, q.northing, q.value].every(Number.isFinite))
      throw Error("관측값은 유한한 숫자여야 합니다.");
    const key = `${q.easting},${q.northing}`;
    if (seen.has(key))
      throw Error(
        "같은 경계면의 중복 좌표를 병합하지 않습니다. 조사차수를 분리하세요.",
      );
    seen.add(key);
  }
  const hull = convexHull(samples.map((s) => [s.easting, s.northing]));
  if (hull.length < 3)
    throw Error("관측공이 한 직선에 있어 면을 만들 수 없습니다.");
  const n = samples.length,
    A = Array.from({ length: n + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) =>
        i === n
          ? j === n
            ? 0
            : 1
          : j === n
            ? 1
            : semivariance(
                Math.hypot(
                  samples[i].easting - samples[j].easting,
                  samples[i].northing - samples[j].northing,
                ),
                p,
              ),
      ),
    ),
    inv = inverse(A);
  return {
    hull,
    samples,
    predict(easting, northing) {
      if (!Number.isFinite(easting) || !Number.isFinite(northing))
        throw Error("예측 좌표를 확인하세요.");
      const rhs = [
          ...samples.map((q) =>
            semivariance(
              Math.hypot(easting - q.easting, northing - q.northing),
              p,
            ),
          ),
          1,
        ],
        sol = inv.map((r) => r.reduce((s, v, j) => s + v * rhs[j], 0)),
        value = samples.reduce((s, q, i) => s + sol[i] * q.value, 0),
        variance =
          sol.slice(0, n).reduce((s, v, i) => s + v * rhs[i], 0) + sol[n];
      if (!Number.isFinite(value) || variance < -1e-7)
        throw Error("크리깅 수치 확인이 필요합니다.");
      return {
        value,
        variance: Math.max(0, variance),
        weightSum: sol.slice(0, n).reduce((a, b) => a + b, 0),
        extrapolated: !pointInHull([easting, northing], hull),
      };
    },
  };
}
export function realBounds(holes, pad = 15) {
  const e = holes.map((h) => h.easting),
    n = holes.map((h) => h.northing);
  return [
    Math.min(...e) - pad,
    Math.min(...n) - pad,
    Math.max(...e) + pad,
    Math.max(...n) + pad,
  ];
}
export function createRealModel(holes, p) {
  const errors = validateRealHoles(holes);
  if (errors.length) throw Error(errors.join(" "));
  const horizons = HORIZONS.map((h) => {
    const samples = holes
      .map((q) => ({
        id: q.id,
        easting: q.easting,
        northing: q.northing,
        value: h.observed(q),
      }))
      .filter((q) => q.value !== null);
    try {
      return {
        ...h,
        model: scalarKriging(samples, p),
        sampleCount: samples.length,
        error: null,
      };
    } catch (e) {
      return {
        ...h,
        model: null,
        sampleCount: samples.length,
        error: e.message,
      };
    }
  });
  return { horizons, bounds: realBounds(holes), parameters: p, holes };
}
export function realGrid(model, nx = 35, ny = 35) {
  const b = model.bounds,
    points = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const e = b[0] + (i / (nx - 1)) * (b[2] - b[0]),
        n = b[1] + (j / (ny - 1)) * (b[3] - b[1]);
      points.push({
        e,
        n,
        values: model.horizons.map((h) => h.model?.predict(e, n) ?? null),
      });
    }
  return { nx, ny, bounds: b, points };
}
export function realSection(model, north, count = 71) {
  const b = model.bounds;
  return Array.from({ length: count }, (_, i) => {
    const e = b[0] + (i / (count - 1)) * (b[2] - b[0]);
    return {
      e,
      n: north,
      values: model.horizons.map((h) => h.model?.predict(e, north) ?? null),
    };
  });
}
export function realLOO(model) {
  return model.horizons.map((h) => {
    if (!h.model || h.model.samples.length < 4)
      return { id: h.id, name: h.name, count: 0, rmse: null, rows: [] };
    const samples = h.model.samples,
      rows = [];
    for (let i = 0; i < samples.length; i++) {
      const q = samples[i];
      try {
        const pred = scalarKriging(
          samples.filter((_, j) => i !== j),
          model.parameters,
        ).predict(q.easting, q.northing);
        rows.push({
          id: q.id,
          observed: q.value,
          predicted: pred.value,
          residual: pred.value - q.value,
          extrapolated: pred.extrapolated,
        });
      } catch {}
    }
    return {
      id: h.id,
      name: h.name,
      count: rows.length,
      rmse: rows.length
        ? Math.sqrt(rows.reduce((s, r) => s + r.residual ** 2, 0) / rows.length)
        : null,
      rows,
    };
  });
}
export function restoreRealGround(payload, knownIds, expectedHoles) {
  if (
    !payload ||
    payload.kind !== "real-ground-model" ||
    payload.frame?.id !== "icheon-local-m"
  )
    throw Error("이천 현장 지반 기록을 선택하세요.");
  if (typeof payload.sourceRevision !== "string")
    throw Error("자료 개정 정보가 없습니다.");
  const errors = validateParameters(payload.parameters ?? {});
  if (errors.length) throw Error(errors.join(" "));
  const v = payload.view;
  const campaigns = ["2021-02", "2022-01", "2022-08", "2023-11"];
  if (
    !v ||
    !Number.isFinite(v.sectionNorth) ||
    v.sectionNorth < 520000 ||
    v.sectionNorth > 523000 ||
    !["ground", "dsm", "pointcloud"].includes(v.mode) ||
    !["all", ...campaigns].includes(v.modelCampaign)
  )
    throw Error("저장된 보기 설정이 올바르지 않습니다.");
  if (
    !Array.isArray(payload.holeIds) ||
    payload.holeIds.length !== knownIds.length ||
    new Set(payload.holeIds).size !== knownIds.length ||
    payload.holeIds.some((id) => !knownIds.includes(id))
  )
    throw Error("현재 자료 목록과 저장된 시추공 ID가 다릅니다.");
  if (expectedHoles) {
    const err = validateRealHoles(payload.holes);
    if (err.length) throw Error(err.join(" "));
    for (const q of expectedHoles) {
      const h = payload.holes.find((h) => h.id === q.id);
      if (
        !h ||
        [
          "easting",
          "northing",
          "collar",
          "declaredTotalDepth",
          "observedBottom",
        ].some((k) => h[k] !== q[k]) ||
        JSON.stringify(h.layers) !== JSON.stringify(q.layers)
      )
        throw Error(
          "저장된 원자료 수치가 현재 검수 자료와 다릅니다. 원문을 확인한 뒤 별도 자료로 등록하세요.",
        );
    }
  }
  const defaults = {
    tab: "map",
    shownCampaigns: campaigns,
    visible: [true, true, true],
    showHoles: true,
    showCAD: true,
    showCADLinework: false,
    showGCP: false,
    extrapolate: false,
    showVariance: false,
    verticalScale: 1.5,
    registration: { east: 0, north: 0, rotation: 0, scale: 1, height: 0 },
  };
  const out = { ...defaults, ...v };
  if (
    !["map", "model", "sources", "quality"].includes(out.tab) ||
    !Array.isArray(out.shownCampaigns) ||
    out.shownCampaigns.some((x) => !campaigns.includes(x)) ||
    !Array.isArray(out.visible) ||
    out.visible.length !== 3 ||
    out.visible.some((x) => typeof x !== "boolean") ||
    ![
      "showHoles",
      "showCAD",
      "showCADLinework",
      "showGCP",
      "extrapolate",
      "showVariance",
    ].every((k) => typeof out[k] === "boolean") ||
    ![1, 1.5, 2].includes(out.verticalScale)
  )
    throw Error("저장된 레이어·보기 설정을 확인하세요.");
  const r = out.registration;
  if (
    !r ||
    !["east", "north", "rotation", "scale", "height"].every((k) =>
      Number.isFinite(r[k]),
    ) ||
    Math.abs(r.east) > 100 ||
    Math.abs(r.north) > 100 ||
    Math.abs(r.rotation) > 30 ||
    r.scale < 0.5 ||
    r.scale > 1.5 ||
    r.height !== 0
  )
    throw Error("검수되지 않은 정합·높이 보정값은 복원할 수 없습니다.");
  return {
    ...out,
    selected: knownIds.includes(v.selected) ? v.selected : knownIds[0],
    parameters: {
      model: payload.parameters.model,
      range: String(payload.parameters.range),
      sill: String(payload.parameters.sill),
      nugget: String(payload.parameters.nugget),
    },
  };
}
