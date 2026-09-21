import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateRealHoles,
  scalarKriging,
  createRealModel,
  realGrid,
  restoreRealGround,
  REAL_GROUND_VERSION,
} from "./real-engine.mjs";
const data = JSON.parse(
    fs.readFileSync(
      new URL("../../data/real-ground/boreholes.json", import.meta.url),
    ),
  ),
  p = { model: "spherical", range: 150, sill: 50, nugget: 0 };
test("Four source campaigns preserve 32 independent records and 96 variable intervals", () => {
  assert.equal(data.holes.length, 32);
  assert.deepEqual(
    data.campaigns.map((c) => c.holeCount),
    [3, 14, 11, 4],
  );
  assert.equal(
    data.holes.reduce((s, h) => s + h.layers.length, 0),
    96,
  );
  assert.deepEqual(validateRealHoles(data.holes), []);
  assert.equal(new Set(data.holes.map((h) => h.id)).size, 32);
  const a = data.holes.find((h) => h.id === "2022-01:NH-4");
  assert.equal(a.declaredTotalDepth, 20);
  assert.equal(a.observedBottom, 30);
  assert.ok(a.qc.length);
  assert.equal(a.layers.at(-1).bottomConfirmed, false);
});
test("Ordinary kriging reproduces all source observations with no forced fourth layer", () => {
  for (const campaign of data.campaigns) {
    const holes = data.holes.filter((h) => h.campaign === campaign.id),
      model = createRealModel(holes, p);
    for (const h of model.horizons) {
      assert.ok(h.model);
      for (const q of h.model.samples) {
        const pred = h.model.predict(q.easting, q.northing);
        assert.ok(Math.abs(pred.value - q.value) < 1e-7);
        assert.ok(Math.abs(pred.weightSum - 1) < 1e-9);
        assert.ok(pred.variance < 1e-7);
      }
    }
  }
});
test("Unknown rock bottom never becomes interpolated ground horizon", () => {
  const model = createRealModel(data.holes, p);
  assert.deepEqual(
    model.horizons.map((h) => h.id),
    ["collar", "weathered-top", "rock-top"],
  );
  const g = realGrid(model, 8, 8);
  assert.ok(
    g.points.every((q) =>
      q.values.every((v) => Number.isFinite(v.value) && v.variance >= 0),
    ),
  );
  assert.ok(g.points.some((q) => q.values.some((v) => v.extrapolated)));
});
test("Coincident points and malformed intervals are rejected rather than repaired", () => {
  assert.throws(
    () =>
      scalarKriging(
        [
          { easting: 0, northing: 0, value: 1 },
          { easting: 0, northing: 0, value: 2 },
          { easting: 1, northing: 1, value: 3 },
        ],
        p,
      ),
    /중복/,
  );
  const h = structuredClone(data.holes);
  h[0].layers[1].from += 1;
  assert.ok(validateRealHoles(h).length);
});
test("Restoration checks real-site frame and known source IDs", () => {
  const ids = data.holes.map((h) => h.id),
    payload = {
      kind: "real-ground-model",
      frame: { id: "icheon-local-m" },
      sourceRevision: "2",
      parameters: p,
      holeIds: ids,
      view: {
        sectionNorth: 521600,
        mode: "ground",
        modelCampaign: "2022-08",
        selected: ids[0],
      },
    };
  assert.equal(restoreRealGround(payload, ids).selected, ids[0]);
  assert.equal(
    restoreRealGround({ ...payload, holes: data.holes }, ids, data.holes)
      .selected,
    ids[0],
  );
  const altered = structuredClone(data.holes);
  altered[0].collar += 1;
  assert.throws(
    () => restoreRealGround({ ...payload, holes: altered }, ids, data.holes),
    /원자료 수치/,
  );
  assert.throws(
    () =>
      restoreRealGround(
        { ...payload, view: { ...payload.view, showCADLinework: "yes" } },
        ids,
      ),
    /보기 설정/,
  );
  assert.throws(() =>
    restoreRealGround(
      { ...payload, frame: { id: "local-synthetic-meters" } },
      ids,
    ),
  );
  assert.throws(() =>
    restoreRealGround({ ...payload, holeIds: ["unknown"] }, ids),
  );
});

function savedGround(view = {}) {
  return {
    kind: "real-ground-model",
    frame: { id: "icheon-local-m" },
    sourceRevision: "source-32-holes-r1",
    parameters: p,
    holeIds: data.holes.map((h) => h.id),
    holes: data.holes,
    view: {
      sectionNorth: 521600,
      mode: "ground",
      modelCampaign: "2022-08",
      selected: data.holes[0].id,
      ...view,
    },
  };
}

test("Legacy ground records restore solid display defaults without mutating source data or payload", () => {
  const payload = savedGround();
  const before = JSON.stringify(payload);
  const restored = restoreRealGround(payload, payload.holeIds, data.holes);
  assert.equal(REAL_GROUND_VERSION, "source-linked-variable-strata-2.2");
  assert.equal(restored.representation, "solid");
  assert.equal(restored.meshOpacity, 1);
  assert.equal(restored.cutaway, false);
  assert.equal(restored.showPlanBoundary, true);
  assert.equal(restored.showPlanLinework, true);
  assert.deepEqual(restored.solidVisible, [true, true, true]);
  assert.equal(JSON.stringify(payload), before);
  restored.solidVisible[0] = false;
  assert.deepEqual(restoreRealGround(payload, payload.holeIds).solidVisible, [
    true,
    true,
    true,
  ]);
});

test("Solid and surface display settings survive JSON round trips including opacity boundaries", () => {
  for (const settings of [
    {
      representation: "solid",
      meshOpacity: 0.4,
      cutaway: true,
      solidVisible: [true, false, true],
      showPlanBoundary: false,
      showPlanLinework: true,
    },
    {
      representation: "surfaces",
      meshOpacity: 0.73,
      cutaway: false,
      solidVisible: [false, true, false],
      showPlanBoundary: true,
      showPlanLinework: false,
    },
    {
      representation: "solid",
      meshOpacity: 1,
      cutaway: true,
      solidVisible: [false, false, false],
      showPlanBoundary: false,
      showPlanLinework: false,
    },
  ]) {
    const payload = JSON.parse(JSON.stringify(savedGround(settings)));
    const restored = restoreRealGround(payload, payload.holeIds, data.holes);
    for (const key of Object.keys(settings))
      assert.deepEqual(restored[key], settings[key]);
    assert.deepEqual(payload.parameters, p);
    assert.deepEqual(payload.holes, data.holes);
  }
});

test("Ground display restoration rejects malformed representations, opacity, cutaway, and layer visibility", () => {
  const invalid = [
    { representation: "wireframe" },
    { representation: null },
    { meshOpacity: 0.399 },
    { meshOpacity: 1.001 },
    { meshOpacity: "0.6" },
    { meshOpacity: NaN },
    { meshOpacity: Infinity },
    { meshOpacity: null },
    { cutaway: "false" },
    { cutaway: 0 },
    { cutaway: null },
    { solidVisible: [true, false] },
    { solidVisible: [true, true, true, true] },
    { solidVisible: [true, 1, false] },
    { solidVisible: [true, null, false] },
    { solidVisible: "true,true,true" },
    { solidVisible: new Array(3) },
    { showPlanBoundary: "false" },
    { showPlanLinework: null },
  ];
  for (const settings of invalid) {
    const payload = savedGround(settings);
    assert.throws(
      () => restoreRealGround(payload, payload.holeIds, data.holes),
      /레이어·보기 설정/,
    );
  }
});

test("Old cutaway migrates only an absent slice using known campaign bounds and keeps layer choices", () => {
  const old = savedGround({
    cutaway: true,
    solidVisible: [true, false, false],
  });
  const before = JSON.stringify(old);
  const restored = restoreRealGround(old, old.holeIds, data.holes);
  assert.deepEqual(restored.slice, {
    enabled: true,
    axis: "y",
    positions: { x: 239925.815, y: 521600, z: 50 },
    keep: "above",
    mode: "cut",
    showPlane: true,
  });
  assert.equal(restored.baseElevation, null);
  assert.equal(restored.cameraView, "perspective");
  assert.equal(restored.cutaway, true);
  assert.deepEqual(restored.solidVisible, [true, false, false]);
  assert.equal(JSON.stringify(old), before);
  const all = savedGround({ modelCampaign: "all" });
  assert.equal(
    restoreRealGround(all, all.holeIds, data.holes).slice.positions.x,
    239924.015,
  );
  assert.equal(restoreRealGround(old, old.holeIds).slice.positions.x, 239925);
  const noCutaway = savedGround();
  assert.equal(
    restoreRealGround(noCutaway, noCutaway.holeIds).slice.enabled,
    false,
  );
});

test("Slice positions, display bottom, and camera choices survive JSON round trips without old cutaway overriding them", () => {
  const configurations = [
    {
      slice: {
        enabled: false,
        axis: "x",
        positions: { x: 238000, y: 520000, z: -500 },
        keep: "below",
        mode: "plane",
        showPlane: false,
      },
      baseElevation: -500,
      cameraView: "top",
    },
    {
      slice: {
        enabled: true,
        axis: "z",
        positions: { x: 242000, y: 523000, z: 500 },
        keep: "above",
        mode: "cut",
        showPlane: true,
      },
      baseElevation: 200,
      cameraView: "section",
    },
    {
      slice: {
        enabled: true,
        axis: "y",
        positions: { x: 239925.5, y: 521610.25, z: 45.7 },
        keep: "below",
        mode: "cut",
        showPlane: false,
      },
      baseElevation: null,
      cameraView: "perspective",
    },
  ];
  for (const settings of configurations) {
    const payload = JSON.parse(
      JSON.stringify(
        savedGround({ ...settings, cutaway: !settings.slice.enabled }),
      ),
    );
    const restored = restoreRealGround(payload, payload.holeIds, data.holes);
    for (const key of Object.keys(settings))
      assert.deepEqual(restored[key], settings[key]);
    assert.equal(restored.cutaway, !settings.slice.enabled);
    assert.deepEqual(payload.holes, data.holes);
    assert.deepEqual(payload.parameters, p);
  }
});

test("Supplied partial slices and invalid slice, bottom, or camera values are rejected instead of silently defaulted", () => {
  const slice = {
    enabled: true,
    axis: "y",
    positions: { x: 239925, y: 521600, z: 50 },
    keep: "above",
    mode: "cut",
    showPlane: true,
  };
  const invalidSlices = [
    undefined,
    null,
    {},
    [],
    { enabled: true },
    { ...slice, enabled: "true" },
    { ...slice, axis: "north" },
    { ...slice, keep: "both" },
    { ...slice, mode: "solid" },
    { ...slice, showPlane: 1 },
    { ...slice, positions: { x: 239925, y: 521600 } },
    { ...slice, positions: [239925, 521600, 50] },
  ];
  for (const [axis, values] of Object.entries({
    x: [237999.9, 242000.1, NaN, "239925"],
    y: [519999.9, 523000.1, Infinity, null],
    z: [-500.1, 500.1, -Infinity, undefined],
  }))
    for (const value of values)
      invalidSlices.push({
        ...slice,
        positions: { ...slice.positions, [axis]: value },
      });
  const invalidViews = [
    ...invalidSlices.map((value) => ({ slice: value })),
    ...[-500.1, 200.1, Infinity, NaN, "50", undefined].map((baseElevation) => ({
      baseElevation,
    })),
    ...["front", "", null, undefined].map((cameraView) => ({ cameraView })),
  ];
  for (const view of invalidViews) {
    const payload = savedGround(view);
    assert.throws(
      () => restoreRealGround(payload, payload.holeIds, data.holes),
      /절개·표시하한·카메라/,
    );
  }
});
