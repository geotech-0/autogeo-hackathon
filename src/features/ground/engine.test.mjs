import test from "node:test";
import assert from "node:assert/strict";
import {
  syntheticBoreholes,
  DEFAULT_PARAMETERS,
  STRATA,
  createKriging,
  buildGrid,
  leaveOneOut,
  syntheticError,
  semivariance,
  validateBoreholes,
  parseBoreholeCsv,
  encodeBoreholeCsv,
  inverse,
  fitSimilarity,
  transformPoint,
  inversePoint,
  registrationResiduals,
  sectionAt,
} from "./engine.mjs";
const near = (a, b, t = 1e-9) =>
  assert.ok(Math.abs(a - b) <= t, `${a} ≠ ${b} within ${t}`);
const copy = () => structuredClone(syntheticBoreholes);
const simple = (id, e, n, collar = 36) => ({
  id,
  easting: e,
  northing: n,
  collar,
  totalDepth: 28,
  layers: STRATA.map((s, i) => ({
    id: s.id,
    from: [0, 4, 11, 19][i],
    to: [4, 11, 19, 28][i],
  })),
});
test("ordinary kriging matches an independent equilateral three-point closed form", () => {
  const holes = [
    simple("A", 0, 0, 30),
    simple("B", 2, 0, 36),
    simple("C", 1, Math.sqrt(3), 42),
  ];
  const p = createKriging(holes, {
    model: "spherical",
    range: 2,
    sill: 1,
    nugget: 0,
  }).predict(1, Math.sqrt(3) / 3);
  // All inter-point gamma=1, all center gamma=4/(3√3). By symmetry w=1/3;
  // μ=gamma(center)-2/3 and σ²=2*gamma(center)-2/3.
  p.weights.forEach((w) => near(w, 1 / 3));
  near(p.heights[0], 36);
  near(p.variance, 8 / (3 * Math.sqrt(3)) - 2 / 3);
  near(p.weightSum, 1);
});
test("all measured horizons are exactly honored at the 12 observation locations", () => {
  for (const model of ["spherical", "exponential", "gaussian"]) {
    const m = createKriging(copy(), { ...DEFAULT_PARAMETERS, model });
    for (const h of syntheticBoreholes) {
      const p = m.predict(h.easting, h.northing);
      near(p.heights[0], h.collar, 1e-7);
      h.layers.forEach((l, i) => near(p.heights[i + 1], h.collar - l.to, 1e-7));
      near(p.variance, 0, 1e-7);
      near(p.weightSum, 1, 1e-8);
    }
  }
});
test("constant fields remain constant including outside the observed convex hull", () => {
  const holes = syntheticBoreholes.map((h) =>
      simple(h.id, h.easting, h.northing, 36),
    ),
    m = createKriging(holes);
  for (const [e, n] of [
    [0, 0],
    [60, 50],
    [160, 130],
  ]) {
    const p = m.predict(e, n);
    [36, 32, 25, 17, 8].forEach((v, i) => near(p.heights[i], v));
    near(p.weightSum, 1);
  }
  assert.equal(m.predict(0, 0).extrapolated, true);
  assert.equal(m.predict(60, 50).extrapolated, false);
});
test("kriging variance depends on geometry and model, not observed height values", () => {
  const moved = copy();
  moved.forEach((h) => (h.collar += 8 * Math.sin(h.easting)));
  const a = createKriging(copy()).predict(60, 50),
    b = createKriging(moved).predict(60, 50);
  near(a.variance, b.variance);
  assert.ok(Math.abs(a.heights[0] - b.heights[0]) > 0.01);
  const c = createKriging(copy(), { ...DEFAULT_PARAMETERS, range: 35 }).predict(
    60,
    50,
  );
  assert.ok(Math.abs(a.variance - c.variance) > 0.1);
});
test("LOO excludes the withheld observation rather than reporting interpolator residuals", () => {
  const a = leaveOneOut(copy(), DEFAULT_PARAMETERS),
    holes = copy();
  holes[0].collar += 5;
  const b = leaveOneOut(holes, DEFAULT_PARAMETERS);
  a.rows[0].predicted.forEach((v, i) => near(v, b.rows[0].predicted[i]));
  near(b.rows[0].residuals[2], a.rows[0].residuals[2] - 5);
  assert.ok(a.rmse > 0.1 && a.rmse < 1);
  assert.equal(a.rows.length, 12);
});
test("grid, section and known synthetic truth use the same unmodified interpolator", () => {
  const m = createKriging(copy()),
    g = buildGrid(m),
    s = sectionAt(m, 50),
    err = syntheticError(g);
  assert.equal(g.crossed, 0);
  assert.ok(g.maxVariance > 0);
  assert.ok(g.extrapolated > 0);
  assert.ok(g.xs.includes(35) && g.xs.includes(85));
  assert.ok(g.ys.includes(25) && g.ys.includes(75));
  near(s[30].heights[2], m.predict(60, 50).heights[2]);
  assert.ok(err.rmse > 0.01 && err.rmse < 0.25);
  assert.equal(err.count, g.points.length * 3);
});
test("semivariogram model definitions honor zero distance, sill and practical range", () => {
  near(
    semivariance(0, { model: "spherical", range: 10, sill: 4, nugget: 1 }),
    0,
  );
  near(
    semivariance(10, { model: "spherical", range: 10, sill: 4, nugget: 1 }),
    5,
  );
  near(
    semivariance(10, { model: "exponential", range: 10, sill: 4, nugget: 1 }),
    1 + 4 * (1 - Math.exp(-3)),
  );
  assert.throws(() =>
    createKriging(copy(), { ...DEFAULT_PARAMETERS, range: 0 }),
  );
  assert.throws(() =>
    createKriging(copy(), { ...DEFAULT_PARAMETERS, nugget: NaN }),
  );
  assert.throws(() => createKriging(copy()).predict(Infinity, 0));
});
test("input QC rejects duplicate positions, missing layers, inverted or gapped intervals and collinear sites", () => {
  const holes = copy();
  holes[1].easting = holes[0].easting;
  holes[1].northing = holes[0].northing;
  assert.throws(() => createKriging(holes), /위치가 중복/);
  for (const value of [
    null,
    { from: 4, to: 3, id: "alluvium" },
    { from: 5, to: 10, id: "alluvium" },
  ]) {
    const h = copy();
    h[0].layers[1] = value;
    assert.ok(validateBoreholes(h).length > 0);
  }
  assert.ok(validateBoreholes([null, ...copy().slice(1)]).length > 0);
  assert.ok(
    validateBoreholes([
      simple("A", 0, 0),
      simple("B", 1, 1),
      simple("C", 2, 2),
    ]).some((e) => e.includes("직선")),
  );
  assert.throws(
    () =>
      inverse([
        [1, 1],
        [1, 1],
      ]),
    /특이/,
  );
});
test("CSV round trip preserves all coordinates and intervals and enforces explicit metre units", () => {
  const csv = encodeBoreholeCsv(copy()),
    restored = parseBoreholeCsv(csv);
  assert.deepEqual(
    restored.map(({ origin, ...h }) => h),
    copy().map(({ origin, ...h }) => h),
  );
  assert.throws(() => parseBoreholeCsv(csv.replace(/,m,m/g, ",mm,m")), /단위/);
  assert.throws(
    () => parseBoreholeCsv(csv.replace("BH-01,8,9", "BH-01,,9")),
    /숫자/,
  );
  const lines = csv.split("\n");
  lines[2] = lines[2].replace("BH-01,8,9", "BH-01,9,9");
  assert.throws(() => parseBoreholeCsv(lines.join("\n")), /행마다/);
});
test("similarity fitting recovers known rotation, translation and scale; inverse is reversible", () => {
  const truth = { east: 10, north: -5, rotation: 90, scale: 2, height: 0 };
  const pairs = [
    { id: "A", source: [0, 0], target: [10, -5] },
    { id: "B", source: [2, 0], target: [10, -1] },
    { id: "C", source: [0, 3], target: [4, -5] },
  ];
  const before = structuredClone(pairs),
    fit = fitSimilarity(pairs);
  for (const key of ["east", "north", "rotation", "scale"])
    near(fit[key], truth[key]);
  assert.deepEqual(pairs, before);
  const p = transformPoint([7, 9], fit),
    q = inversePoint(p, fit);
  near(p[0], -8);
  near(p[1], 9);
  near(q[0], 7);
  near(q[1], 9);
  const check = registrationResiduals(
    [{ id: "heldout", source: [1, 1], target: [8.3, -3.4] }],
    fit,
  );
  near(check.rmse, 0.5);
  // Only held-out residual changes, transform was estimated from fit points above.
  near(fit.east, 10);
  near(registrationResiduals(pairs, fit).rmse, 0);
  assert.throws(() =>
    fitSimilarity([
      { source: [0, 0], target: [0, 0] },
      { source: [0, 0], target: [1, 1] },
    ]),
  );
  assert.throws(() => transformPoint([0, 0], { ...truth, scale: 0 }));
  assert.throws(() =>
    fitSimilarity([
      { source: [NaN, 0], target: [0, 0] },
      { source: [1, 1], target: [2, 2] },
    ]),
  );
});
test("asset origin, correction and scene origin are applied exactly once in E/H/-N convention", async () => {
  const { assetPointToScene, scenePointToAsset, registrationMatrix } =
    await import("./engine.mjs");
  const p = { east: 10, north: -5, rotation: 90, scale: 2, height: 7 };
  const source = [10, 20, 3],
    assetOrigin = [1000, 2000, 50],
    sceneOrigin = [-4050, 2000, 40];
  const scene = assetPointToScene(source, assetOrigin, p, sceneOrigin);
  [20, 20, -15].forEach((v, i) => near(scene[i], v));
  const back = scenePointToAsset(scene, assetOrigin, p, sceneOrigin);
  source.forEach((v, i) => near(back[i], v));
  const matrix = registrationMatrix(p),
    q = [3, 4, 1],
    result = matrix.map((row) => row.reduce((sum, v, i) => sum + v * q[i], 0));
  near(result[0], 2);
  near(result[1], 1);
  near(result[2], 1);
});
