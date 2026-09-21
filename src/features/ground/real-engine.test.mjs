import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateRealHoles,
  scalarKriging,
  createRealModel,
  realGrid,
  restoreRealGround,
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
