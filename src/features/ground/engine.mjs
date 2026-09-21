/** Ordinary kriging in a local metre frame. No external service or hidden correction. */
export const GROUND_VERSION = "ordinary-kriging-1.0.0";
export const FRAME = {
  id: "local-synthetic-meters",
  extent: [0, 0, 120, 100],
  unit: "m",
  origin: [0, 0, 0],
};
export const EXCAVATION = { minE: 35, maxE: 85, minN: 25, maxN: 75, depth: 10 };
export const STRATA = [
  { id: "fill", name: "매립층", color: "#C39D6B" },
  { id: "alluvium", name: "퇴적층", color: "#DEA85D" },
  { id: "weathered", name: "풍화대", color: "#8DADA5" },
  { id: "bedrock", name: "기반암", color: "#607D93" },
];
export const DEFAULT_PARAMETERS = {
  model: "spherical",
  range: 95,
  sill: 4,
  nugget: 0,
};
export function trueHorizons(e, n) {
  const ground =
    36 + 0.012 * e - 0.008 * n + 0.45 * Math.sin(e / 42) * Math.cos(n / 48);
  return [
    ground,
    ground - (3.5 + 0.007 * e + 0.3 * Math.sin(n / 35)),
    25 + 0.023 * e - 0.012 * n + 0.7 * Math.sin(e / 32) * Math.cos(n / 45),
    17 + 0.015 * e + 0.01 * n + 0.6 * Math.cos(e / 43),
    ground - 28,
  ];
}
export function makeSyntheticBoreholes() {
  const points = [
    [8, 9],
    [42, 10],
    [77, 9],
    [111, 12],
    [10, 49],
    [43, 48],
    [78, 51],
    [109, 48],
    [9, 91],
    [43, 89],
    [76, 90],
    [110, 88],
  ];
  return points.map(([e, n], i) => {
    const h = trueHorizons(e, n);
    return {
      id: `BH-${String(i + 1).padStart(2, "0")}`,
      easting: e,
      northing: n,
      collar: h[0],
      totalDepth: 28,
      origin: "synthetic",
      layers: STRATA.map((s, j) => ({
        id: s.id,
        from: j === 0 ? 0 : h[0] - h[j],
        to: h[0] - h[j + 1],
      })),
    };
  });
}
export const syntheticBoreholes = makeSyntheticBoreholes();
export function horizonsFor(hole) {
  return [hole.collar, ...hole.layers.map((l) => hole.collar - l.to)];
}
export function validateParameters(p) {
  const errors = [];
  if (!["spherical", "exponential", "gaussian"].includes(p.model))
    errors.push("베리오그램 모델을 확인하세요.");
  for (const key of ["range", "sill", "nugget"])
    if (typeof p[key] !== "number" || !Number.isFinite(p[key]))
      errors.push(`${key}: 유한한 숫자가 필요합니다.`);
  if (!(p.range > 0 && p.range <= 10000))
    errors.push("범위는 0보다 크고 10,000 m 이하여야 합니다.");
  if (!(p.sill > 0 && p.sill <= 10000))
    errors.push("부분 문턱값은 0보다 크고 10,000 m² 이하여야 합니다.");
  if (!(p.nugget >= 0 && p.nugget <= 10000))
    errors.push("너깃은 0~10,000 m² 범위입니다.");
  return errors;
}
export function validateBoreholes(holes) {
  const errors = [];
  if (!Array.isArray(holes) || holes.length < 3 || holes.length > 100)
    return ["시추공은 3~100개가 필요합니다."];
  const ids = new Set();
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    if (!h || typeof h.id !== "string" || !h.id.trim()) {
      errors.push(`${i + 1}행 공번이 없습니다.`);
      continue;
    }
    if (h.id.length > 60 || /[\r\n,"]/u.test(h.id) || /^[=+@-]/.test(h.id))
      errors.push(
        `${h.id.slice(0, 20)}: 공번에 지원하지 않는 문자가 있습니다.`,
      );
    if (ids.has(h.id)) errors.push(`${h.id}: 공번이 중복됩니다.`);
    ids.add(h.id);
    for (const k of ["easting", "northing", "collar", "totalDepth"])
      if (typeof h[k] !== "number" || !Number.isFinite(h[k]))
        errors.push(`${h.id}: ${k} 값이 없습니다.`);
    if (!(h.totalDepth > 0 && h.totalDepth <= 1000))
      errors.push(`${h.id}: 총심도 범위를 확인하세요.`);
    for (let j = 0; j < i; j++)
      if (
        Math.hypot(
          h.easting - holes[j]?.easting,
          h.northing - holes[j]?.northing,
        ) < 1e-6
      )
        errors.push(`${h.id}/${holes[j].id}: 위치가 중복됩니다.`);
    if (!Array.isArray(h.layers) || h.layers.length !== STRATA.length) {
      errors.push(
        `${h.id}: 매립층·퇴적층·풍화대·기반암의 4개 연속 구간이 필요합니다.`,
      );
      continue;
    }
    let previous = 0;
    h.layers.forEach((l, j) => {
      if (!l || typeof l !== "object") {
        errors.push(`${h.id}: 층 구간이 없습니다.`);
        return;
      }
      if (l.id !== STRATA[j].id)
        errors.push(`${h.id}: 층 순서가 예제 모델과 다릅니다.`);
      if (
        !Number.isFinite(l.from) ||
        !Number.isFinite(l.to) ||
        l.from < 0 ||
        l.to <= l.from ||
        Math.abs(l.from - previous) > 1e-6
      )
        errors.push(`${h.id}: ${j + 1}층 심도 역전·중첩·공백이 있습니다.`);
      previous = l.to;
    });
    if (Math.abs(previous - h.totalDepth) > 1e-6)
      errors.push(`${h.id}: 마지막 층과 총심도가 다릅니다.`);
  }
  if (
    holes.length >= 3 &&
    holes.every(
      (h) => Number.isFinite(h?.easting) && Number.isFinite(h?.northing),
    ) &&
    convexHull(holes.map((h) => [h.easting, h.northing])).length < 3
  )
    errors.push("시추공이 한 직선에 있습니다. 면 모델을 만들 수 없습니다.");
  return [...new Set(errors)];
}
export function semivariance(distance, p) {
  if (distance === 0) return 0;
  const r = distance / p.range;
  const shape =
    p.model === "spherical"
      ? r >= 1
        ? 1
        : 1.5 * r - 0.5 * r * r * r
      : p.model === "exponential"
        ? 1 - Math.exp(-3 * r)
        : 1 - Math.exp(-3 * r * r);
  return p.nugget + p.sill * shape;
}
/** Partial-pivot Gauss-Jordan; throws rather than silently regularizing singular input. */
export function inverse(matrix) {
  const n = matrix.length,
    a = matrix.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);
  const norm = Math.max(...matrix.flat().map(Math.abs), 1);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let j = k + 1; j < n; j++)
      if (Math.abs(a[j][k]) > Math.abs(a[pivot][k])) pivot = j;
    if (Math.abs(a[pivot][k]) < norm * 1e-13)
      throw new Error(
        "크리깅 행렬이 특이합니다. 중복 좌표와 베리오그램을 확인하세요.",
      );
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const divisor = a[k][k];
    for (let c = 0; c < 2 * n; c++) a[k][c] /= divisor;
    for (let r = 0; r < n; r++) {
      if (r === k) continue;
      const factor = a[r][k];
      for (let c = 0; c < 2 * n; c++) a[r][c] -= factor * a[k][c];
    }
  }
  return a.map((r) => r.slice(n));
}
export function createKriging(holes, parameters = DEFAULT_PARAMETERS) {
  const errors = [
    ...validateBoreholes(holes),
    ...validateParameters(parameters),
  ];
  if (errors.length) throw new Error(errors.join(" "));
  const p = { ...parameters },
    n = holes.length;
  const values = holes.map(horizonsFor);
  const matrix = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === n
        ? j === n
          ? 0
          : 1
        : j === n
          ? 1
          : semivariance(
              Math.hypot(
                holes[i].easting - holes[j].easting,
                holes[i].northing - holes[j].northing,
              ),
              p,
            ),
    ),
  );
  const inv = inverse(matrix),
    hull = convexHull(holes.map((h) => [h.easting, h.northing]));
  return {
    parameters: p,
    hull,
    predict(e, north) {
      if (!Number.isFinite(e) || !Number.isFinite(north))
        throw new Error("예측 위치는 유한한 숫자여야 합니다.");
      const rhs = [
        ...holes.map((h) =>
          semivariance(Math.hypot(e - h.easting, north - h.northing), p),
        ),
        1,
      ];
      const solution = inv.map((row) =>
        row.reduce((v, x, j) => v + x * rhs[j], 0),
      );
      const heights = values[0].map((_, k) =>
        values.reduce((v, row, i) => v + solution[i] * row[k], 0),
      );
      const rawVariance =
        solution.slice(0, n).reduce((v, w, i) => v + w * rhs[i], 0) +
        solution[n];
      if (rawVariance < -1e-7 || !heights.every(Number.isFinite))
        throw new Error("크리깅 결과를 수치적으로 확인할 수 없습니다.");
      return {
        heights,
        variance: Math.max(0, rawVariance),
        weights: solution.slice(0, n),
        weightSum: solution.slice(0, n).reduce((a, b) => a + b, 0),
        extrapolated: !pointInHull([e, north], hull),
        crossed: heights.some((h, i) => i > 0 && h >= heights[i - 1]),
      };
    },
  };
}
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [],
    upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
export function pointInHull(p, hull) {
  if (hull.length < 3) return false;
  return hull.every((a, i) => {
    const b = hull[(i + 1) % hull.length];
    return (
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-7
    );
  });
}
export function buildGrid(model, nx = 31, ny = 21) {
  const xs = [
    ...new Set([
      ...Array.from({ length: nx }, (_, i) => (120 * i) / (nx - 1)),
      EXCAVATION.minE,
      EXCAVATION.maxE,
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      ...Array.from({ length: ny }, (_, i) => (100 * i) / (ny - 1)),
      EXCAVATION.minN,
      EXCAVATION.maxN,
    ]),
  ].sort((a, b) => a - b);
  nx = xs.length;
  ny = ys.length;
  const points = [];
  let crossed = 0,
    maxVariance = 0,
    extrapolated = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const e = xs[i],
        n = ys[j],
        result = model.predict(e, n);
      if (result.crossed) crossed++;
      if (result.extrapolated) extrapolated++;
      maxVariance = Math.max(maxVariance, result.variance);
      points.push({ e, n, ...result });
    }
  return { nx, ny, xs, ys, points, crossed, maxVariance, extrapolated };
}
export function sectionAt(model, north = 50, count = 61) {
  return Array.from({ length: count }, (_, i) => {
    const e = (120 * i) / (count - 1);
    return { e, n: north, ...model.predict(e, north) };
  });
}
export function leaveOneOut(holes, p) {
  if (holes.length < 4)
    return { rows: [], rmse: null, bias: null, maxAbsolute: null };
  const rows = holes.map((h, i) => {
    const prediction = createKriging(
      holes.filter((_, j) => i !== j),
      p,
    ).predict(h.easting, h.northing);
    const observed = horizonsFor(h);
    return {
      id: h.id,
      observed,
      predicted: prediction.heights,
      residuals: prediction.heights.map((v, k) => v - observed[k]),
      variance: prediction.variance,
    };
  });
  const all = rows.flatMap((r) => r.residuals.slice(1, -1));
  return {
    rows,
    rmse: Math.sqrt(all.reduce((s, v) => s + v * v, 0) / all.length),
    bias: all.reduce((s, v) => s + v, 0) / all.length,
    maxAbsolute: Math.max(...all.map(Math.abs)),
  };
}
export function syntheticError(grid) {
  const residuals = grid.points.flatMap((p) =>
    p.heights.slice(1, -1).map((v, i) => v - trueHorizons(p.e, p.n)[i + 1]),
  );
  return {
    rmse: Math.sqrt(
      residuals.reduce((s, v) => s + v * v, 0) / residuals.length,
    ),
    maxAbsolute: Math.max(...residuals.map(Math.abs)),
    count: residuals.length,
  };
}
export function encodeBoreholeCsv(holes) {
  return (
    "hole_id,easting,northing,collar_elevation,total_depth,from_depth,to_depth,lithology,horizontal_unit,vertical_unit\n" +
    holes
      .flatMap((h) =>
        h.layers.map((l) =>
          [
            h.id,
            h.easting,
            h.northing,
            h.collar,
            h.totalDepth,
            l.from,
            l.to,
            l.id,
            "m",
            "m",
          ].join(","),
        ),
      )
      .join("\n")
  );
}
export function parseBoreholeCsv(text) {
  const rows = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((s) => s.trim());
  if (rows.length > 401)
    throw new Error("시추 입력은 최대 400개 층 구간입니다.");
  const header =
    rows
      .shift()
      ?.split(",")
      .map((x) => x.trim()) || [];
  const required = [
    "hole_id",
    "easting",
    "northing",
    "collar_elevation",
    "total_depth",
    "from_depth",
    "to_depth",
    "lithology",
    "horizontal_unit",
    "vertical_unit",
  ];
  if (required.some((k) => !header.includes(k)))
    throw new Error("표준 CSV의 10개 열과 m 단위를 확인하세요.");
  const map = new Map();
  for (const [i, line] of rows.entries()) {
    const cells = line.split(",").map((x) => x.trim()),
      row = Object.fromEntries(header.map((key, j) => [key, cells[j] ?? ""]));
    if (cells.length !== header.length)
      throw new Error(
        `${i + 2}행의 열 수가 다릅니다. 표준 CSV는 따옴표·쉼표가 포함된 공번을 지원하지 않습니다.`,
      );
    if (row.horizontal_unit !== "m" || row.vertical_unit !== "m")
      throw new Error(`${i + 2}행: 수평·수직 단위 m를 명시하세요.`);
    for (const key of [
      "easting",
      "northing",
      "collar_elevation",
      "total_depth",
      "from_depth",
      "to_depth",
    ])
      if (row[key] === "" || !Number.isFinite(Number(row[key])))
        throw new Error(`${i + 2}행: ${key} 숫자를 확인하세요.`);
    const current = {
      id: row.hole_id,
      easting: Number(row.easting),
      northing: Number(row.northing),
      collar: Number(row.collar_elevation),
      totalDepth: Number(row.total_depth),
      origin: "imported",
      layers: [],
    };
    let hole = map.get(current.id);
    if (
      hole &&
      ["easting", "northing", "collar", "totalDepth"].some(
        (k) => hole[k] !== current[k],
      )
    )
      throw new Error(`${current.id}: 행마다 위치·표고·총심도가 다릅니다.`);
    if (!hole) {
      hole = current;
      map.set(hole.id, hole);
    }
    hole.layers.push({
      id: row.lithology,
      from: Number(row.from_depth),
      to: Number(row.to_depth),
    });
  }
  const holes = [...map.values()],
    errors = validateBoreholes(holes);
  if (errors.length) throw new Error(errors.join(" "));
  return holes;
}
function validateTransform(point, p) {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !point.every(Number.isFinite) ||
    !p ||
    !["east", "north", "rotation", "scale"].every((k) =>
      Number.isFinite(p[k]),
    ) ||
    p.scale <= 0
  )
    throw new Error("변환 좌표·계수는 유한한 숫자이고 축척은 양수여야 합니다.");
}
export function transformPoint(point, p) {
  validateTransform(point, p);
  const angle = (p.rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    x = point[0],
    y = point[1];
  return [
    p.scale * (c * x - s * y) + p.east,
    p.scale * (s * x + c * y) + p.north,
  ];
}
export function inversePoint(point, p) {
  validateTransform(point, p);
  if (!Number.isFinite(p.scale) || p.scale <= 0)
    throw new Error("변환 축척은 양수여야 합니다.");
  const a = (-p.rotation * Math.PI) / 180,
    x = (point[0] - p.east) / p.scale,
    y = (point[1] - p.north) / p.scale;
  return [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];
}
export function fitSimilarity(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2)
    throw new Error(
      "회전·축척 적합에는 서로 다른 대응점 2개 이상이 필요합니다.",
    );
  if (
    pairs.some(
      (p) =>
        !p ||
        !Array.isArray(p.source) ||
        !Array.isArray(p.target) ||
        p.source.length !== 2 ||
        p.target.length !== 2 ||
        ![...p.source, ...p.target].every(Number.isFinite),
    )
  )
    throw new Error("대응점 좌표는 유한한 숫자여야 합니다.");
  const mean = (key) =>
    [0, 1].map(
      (k) => pairs.reduce((sum, p) => sum + p[key][k], 0) / pairs.length,
    );
  const a = mean("source"),
    b = mean("target");
  let dot = 0,
    cross = 0,
    den = 0;
  for (const p of pairs) {
    const x = p.source[0] - a[0],
      y = p.source[1] - a[1],
      u = p.target[0] - b[0],
      v = p.target[1] - b[1];
    dot += x * u + y * v;
    cross += x * v - y * u;
    den += x * x + y * y;
  }
  if (den < 1e-12) throw new Error("서로 다른 적합점이 필요합니다.");
  const c = dot / den,
    s = cross / den,
    scale = Math.hypot(c, s);
  if (scale < 1e-12) throw new Error("목표 대응점이 한 점으로 모였습니다.");
  return {
    scale,
    rotation: (Math.atan2(s, c) * 180) / Math.PI,
    east: b[0] - c * a[0] + s * a[1],
    north: b[1] - s * a[0] - c * a[1],
    height: 0,
  };
}
export function registrationResiduals(pairs, p) {
  const rows = pairs.map((pair) => {
    const q = transformPoint(pair.source, p),
      de = q[0] - pair.target[0],
      dn = q[1] - pair.target[1];
    return { ...pair, de, dn, residual: Math.hypot(de, dn) };
  });
  return {
    rows,
    rmse: rows.length
      ? Math.sqrt(rows.reduce((s, r) => s + r.residual ** 2, 0) / rows.length)
      : null,
    max: rows.length ? Math.max(...rows.map((r) => r.residual)) : null,
  };
}
/** EN column-vector homogeneous matrix, mapping reference coordinates to master coordinates. */
export function registrationMatrix(p) {
  validateTransform([0, 0], p);
  const a = (p.rotation * Math.PI) / 180,
    c = p.scale * Math.cos(a),
    s = p.scale * Math.sin(a);
  return [
    [c, -s, p.east],
    [s, c, p.north],
    [0, 0, 1],
  ];
}
/** Asset-local ENH -> native ENH -> registration -> scene-local Three (E,H,-N). */
export function assetPointToScene(point, assetOrigin, p, sceneOrigin) {
  if (
    ![...point, ...assetOrigin, ...sceneOrigin, p.height].every(
      Number.isFinite,
    ) ||
    point.length !== 3 ||
    assetOrigin.length !== 3 ||
    sceneOrigin.length !== 3
  )
    throw new Error("3D 좌표·원점·높이 변환값을 확인하세요.");
  const q = transformPoint(
    [point[0] + assetOrigin[0], point[1] + assetOrigin[1]],
    p,
  );
  return [
    q[0] - sceneOrigin[0],
    point[2] + assetOrigin[2] + p.height - sceneOrigin[2],
    -(q[1] - sceneOrigin[1]),
  ];
}
export function scenePointToAsset(point, assetOrigin, p, sceneOrigin) {
  if (
    ![...point, ...assetOrigin, ...sceneOrigin, p.height].every(
      Number.isFinite,
    ) ||
    point.length !== 3 ||
    assetOrigin.length !== 3 ||
    sceneOrigin.length !== 3
  )
    throw new Error("3D 좌표·원점·높이 변환값을 확인하세요.");
  const q = inversePoint(
    [point[0] + sceneOrigin[0], -point[2] + sceneOrigin[1]],
    p,
  );
  return [
    q[0] - assetOrigin[0],
    q[1] - assetOrigin[1],
    point[1] + sceneOrigin[2] - p.height - assetOrigin[2],
  ];
}
