import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteModelDomain } from "./model-domain.mjs";
import {
  createRealModel,
  realGrid,
  realGridQuality,
  realSection,
} from "./real-engine.mjs";
import { buildLayerVolumes } from "./volume-geometry.mjs";
import { sliceClosedMesh } from "./mesh-slicer.mjs";

const source = JSON.parse(
  readFileSync(
    new URL("../../data/real-ground/boreholes.json", import.meta.url),
  ),
);
const assets = JSON.parse(
  readFileSync(
    new URL("../../../public/data/ground/site-assets.json", import.meta.url),
  ),
);
const domain = siteModelDomain(source.holes, assets.cad.boundaryEN);
const params = { model: "spherical", range: 150, sill: 50, nugget: 0 };
const near = (a, b, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)),
    `${a} != ${b}`,
  );
const triangles = function* (positions) {
  for (let i = 0; i < positions.length; i += 9)
    yield [
      positions.slice(i, i + 3),
      positions.slice(i + 3, i + 6),
      positions.slice(i + 6, i + 9),
    ];
};

function closedVolume(mesh) {
  assert.ok(mesh.positions.length > 0);
  assert.ok(mesh.positions.every(Number.isFinite));
  assert.equal(mesh.surfaceKinds.length, mesh.positions.length / 9);
  const origin = mesh.positions.slice(0, 3),
    edges = new Map();
  let volume = 0;
  for (const tri of triangles(mesh.positions)) {
    for (let i = 0; i < 3; i++) {
      const a = tri[i].join(","),
        b = tri[(i + 1) % 3].join(",");
      assert.notEqual(a, b, "triangle edges have nonzero length");
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key) ?? { count: 0, orientation: 0 };
      edge.count++;
      edge.orientation += a < b ? 1 : -1;
      edges.set(key, edge);
    }
    // Surface-integral volume relative to a nearby origin avoids EN cancellation.
    const [a, b, c] = tri.map((v) => v.map((x, i) => x - origin[i]));
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, "each edge has exactly two incident faces");
    assert.equal(edge.orientation, 0, "shared edges have opposite winding");
  }
  assert.ok(volume > 0);
  near(volume, mesh.stats.volumeM3);
  return volume;
}

function rectangularWalls(layer, bounds) {
  const sides = [
    [0, bounds[0]],
    [0, bounds[2]],
    [1, bounds[1]],
    [1, bounds[3]],
  ];
  const touched = new Set();
  let index = 0;
  for (const triangle of triangles(layer.positions)) {
    if (layer.surfaceKinds[index++] !== "side") continue;
    const side = sides.findIndex(([axis, value]) =>
      triangle.every((p) => Math.abs(p[axis] - value) < 1e-7),
    );
    assert.ok(
      side >= 0,
      "outer walls follow the rectangle, not the observation hull",
    );
    touched.add(side);
  }
  assert.equal(touched.size, 4, "all four rectangular side walls are present");
}

function validCap(result, axis, value, keep) {
  const k = { x: 0, y: 1, z: 2 }[axis],
    u = (k + 1) % 3,
    v = (k + 2) % 3;
  assert.ok(result.capPositions.length > 0);
  let area = 0;
  for (const triangle of triangles(result.capPositions)) {
    assert.ok(
      triangle.every((p) => p[k] === value),
      "the 2D cap uses the exact 3D slice coordinate",
    );
    const [a, b, c] = triangle;
    const cross = (b[u] - a[u]) * (c[v] - a[v]) - (b[v] - a[v]) * (c[u] - a[u]);
    assert.ok(cross * (keep === "below" ? 1 : -1) > 0);
    area += Math.abs(cross) / 2;
  }
  near(area, result.stats.capAreaM2);
  for (let i = k; i < result.positions.length; i += 3)
    assert.ok(
      keep === "below"
        ? result.positions[i] <= value + 1e-7
        : result.positions[i] >= value - 1e-7,
    );
}

for (const campaign of [...source.campaigns.map((c) => c.id), "all"]) {
  test(`${campaign}: 65×65 extrapolated strata fill the shared site rectangle with closed XYZ cuts`, () => {
    const holes = source.holes.filter(
      (h) => campaign === "all" || h.campaign === campaign,
    );
    const original = JSON.stringify(holes);
    const model = createRealModel(holes, params, domain);
    const grid = realGrid(model, 65, 65),
      [e0, n0, e1, n1] = domain.bounds;
    assert.deepEqual(model.bounds, domain.bounds);
    assert.deepEqual(grid.bounds, domain.bounds);
    const section = realSection(model, (n0 + n1) / 2, 7);
    near(section[0].e, e0);
    near(section.at(-1).e, e1);
    const qc = realGridQuality(grid);
    assert.equal(qc.crossedPointCount, 0);
    assert.equal(qc.missingPointCount, 0);
    assert.ok(
      qc.extrapolatedPointCount > 0 &&
        qc.extrapolatedPointCount < grid.points.length,
    );
    const baseElevation =
      Math.min(...grid.points.flatMap((p) => p.values.map((v) => v.value))) - 5;
    const result = buildLayerVolumes(grid, {
      extrapolate: true,
      hulls: model.horizons.map((h) => h.model?.hull ?? null),
      baseElevation,
    });
    const area = (e1 - e0) * (n1 - n0);
    assert.equal(result.layers.length, 3);
    assert.equal(result.stats.exactHullClipping, false);
    assert.equal(result.stats.rockBottomObserved, false);
    assert.equal(result.layers[2].interpretation, "display-base");
    for (const layer of result.layers) {
      closedVolume(layer);
      rectangularWalls(layer, domain.bounds);
      near(layer.stats.footprintAreaM2, area);
      assert.equal(layer.stats.excluded.crossed, 0);
    }
    // One layer per axis complements existing full slicer coverage without
    // multiplying all layer/axis combinations across the five source sets.
    const minimumRock = Math.min(...grid.points.map((p) => p.values[2].value));
    const cuts = [
      ["x", result.layers[0], e0 + (e1 - e0) * 0.413],
      ["y", result.layers[1], n0 + (n1 - n0) * 0.587],
      ["z", result.layers[2], (baseElevation + minimumRock) / 2],
    ];
    for (const [axis, layer, value] of cuts) {
      const below = sliceClosedMesh(layer, { axis, value, keep: "below" });
      const above = sliceClosedMesh(layer, { axis, value, keep: "above" });
      for (const [cut, keep] of [
        [below, "below"],
        [above, "above"],
      ]) {
        closedVolume(cut);
        validCap(cut, axis, value, keep);
      }
      near(below.stats.volumeM3 + above.stats.volumeM3, layer.stats.volumeM3);
      near(below.stats.capAreaM2, above.stats.capAreaM2);
      if (axis === "z") near(below.stats.capAreaM2, area);
    }
    assert.equal(
      JSON.stringify(holes),
      original,
      "domain extrapolation does not edit source observations",
    );
  });
}

test("real Gaussian extrapolation reports crossed interfaces instead of silently declaring a valid site block", () => {
  const model = createRealModel(
    source.holes,
    { ...params, model: "gaussian" },
    domain,
  );
  const grid = realGrid(model, 65, 65),
    before = JSON.stringify(grid);
  const qc = realGridQuality(grid);
  const directlyCrossed = grid.points.filter(
    (p) =>
      p.values[0].value < p.values[1].value ||
      p.values[1].value < p.values[2].value,
  );
  assert.ok(
    directlyCrossed.length > 0,
    "actual source case must exercise interface inversion",
  );
  assert.equal(qc.crossedPointCount, directlyCrossed.length);
  assert.equal(qc.missingPointCount, 0);
  assert.ok(qc.extrapolatedPointCount > 0);
  assert.equal(
    JSON.stringify(grid),
    before,
    "QC diagnoses raw predictions without reordering or clamping them",
  );
});
