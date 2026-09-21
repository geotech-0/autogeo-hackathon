import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildLayerVolumes, VOLUME_LAYERS } from "./volume-geometry.mjs";
import { createRealModel, realGrid } from "./real-engine.mjs";

const prediction = (value) => ({
  value,
  variance: 0,
  weightSum: 1,
  extrapolated: false,
});
function grid(
  nx = 2,
  ny = 2,
  heights = () => [12, 8, 0],
  bounds = [0, 0, 10, 20],
) {
  const points = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const e = bounds[0] + (i * (bounds[2] - bounds[0])) / (nx - 1);
      const n = bounds[1] + (j * (bounds[3] - bounds[1])) / (ny - 1);
      points.push({ e, n, values: heights(e, n).map(prediction) });
    }
  return { nx, ny, bounds, points };
}
function near(a, b, tolerance = 1e-7) {
  assert.ok(
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)),
    `${a} != ${b}`,
  );
}
function triangles(layer) {
  const out = [];
  for (let i = 0; i < layer.positions.length; i += 9) {
    out.push([
      layer.positions.slice(i, i + 3),
      layer.positions.slice(i + 3, i + 6),
      layer.positions.slice(i + 6, i + 9),
    ]);
  }
  return out;
}
// Independent surface-integral check, translated to avoid cancellation at EN≈500km.
function signedVolume(layer) {
  if (!layer.positions.length) return 0;
  const origin = layer.positions.slice(0, 3);
  return triangles(layer).reduce((sum, triangle) => {
    const [a, b, c] = triangle.map((p) => p.map((v, i) => v - origin[i]));
    const cross = [
      b[1] * c[2] - b[2] * c[1],
      b[2] * c[0] - b[0] * c[2],
      b[0] * c[1] - b[1] * c[0],
    ];
    return sum + (a[0] * cross[0] + a[1] * cross[1] + a[2] * cross[2]) / 6;
  }, 0);
}
function assertClosed(layer, manifold = true) {
  const edges = new Map();
  for (const triangle of triangles(layer)) {
    assert.ok(triangle.flat().every(Number.isFinite));
    for (let i = 0; i < 3; i++) {
      const a = triangle[i].join(","),
        b = triangle[(i + 1) % 3].join(",");
      assert.notEqual(a, b, "zero-length triangle edge");
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const entry = edges.get(key) ?? { count: 0, orientation: 0 };
      entry.count++;
      entry.orientation += a < b ? 1 : -1;
      edges.set(key, entry);
    }
  }
  for (const { count, orientation } of edges.values()) {
    if (manifold)
      assert.equal(
        count,
        2,
        "each surface edge must have exactly two incident faces",
      );
    else
      assert.equal(
        count % 2,
        0,
        "closed shells may share a contact edge but cannot leave it open",
      );
    assert.equal(orientation, 0, "incident edge orientations must cancel");
  }
  assert.equal(layer.positions.length / 9, layer.surfaceKinds.length);
  near(signedVolume(layer), layer.stats.volumeM3);
}

test("two constant strata form outward, watertight cuboids with exact physical volume", () => {
  const result = buildLayerVolumes(grid());
  assert.deepEqual(
    result.layers.map((l) => l.id),
    VOLUME_LAYERS.map((l) => l.id),
  );
  assert.equal(result.layers.length, 2);
  for (const [i, layer] of result.layers.entries()) {
    assertClosed(layer);
    near(layer.stats.footprintAreaM2, 200);
    near(layer.stats.volumeM3, i === 0 ? 800 : 1600);
    assert.equal(layer.stats.boundaryEdges, 4);
    assert.equal(layer.stats.sideTriangles, 8);
    assert.equal(layer.stats.topTriangles, 2);
    assert.equal(layer.stats.bottomTriangles, 2);
  }
});

test("shared cell edges never produce internal walls or change integrated volume", () => {
  const result = buildLayerVolumes(grid(5, 6));
  for (const layer of result.layers) {
    assertClosed(layer);
    assert.equal(layer.stats.boundaryEdges, 2 * (5 - 1) + 2 * (6 - 1));
    near(layer.stats.footprintAreaM2, 200);
  }
  near(result.stats.volumeM3, 2400);
});

test("off-grid north clipping has exact planar interpolation, closed cut caps and analytic volume", () => {
  const g = grid(4, 5, (e, n) => [
    20 + 0.2 * e + 0.1 * n,
    12 + 0.1 * e - 0.05 * n,
    5,
  ]);
  const snapshot = JSON.stringify(g);
  const result = buildLayerVolumes(g, { clipNorth: 7 });
  for (const layer of result.layers) {
    assertClosed(layer);
    assert.ok(layer.stats.cutEdges > 0);
    assert.ok(layer.stats.clippedSourceTriangles > 0);
    near(layer.stats.footprintAreaM2, 130);
    for (let i = 1; i < layer.positions.length; i += 3)
      assert.ok(layer.positions[i] >= 7);
  }
  near(result.layers[0].stats.volumeM3, 130 * (8 + 0.1 * 5 + 0.15 * 13.5));
  near(result.layers[1].stats.volumeM3, 130 * (7 + 0.1 * 5 - 0.05 * 13.5));
  assert.equal(
    JSON.stringify(g),
    snapshot,
    "source elevations must remain unchanged",
  );
});

test("a cut on a grid row or outside the footprint does not create cracks or zero-thickness caps", () => {
  const g = grid(3, 3);
  for (const north of [0, 10, -1]) {
    const result = buildLayerVolumes(g, { clipNorth: north });
    for (const layer of result.layers) assertClosed(layer);
    near(result.layers[0].stats.volumeM3, north === 10 ? 400 : 800);
  }
  for (const north of [20, 21]) {
    const result = buildLayerVolumes(g, { clipNorth: north });
    assert.equal(result.stats.triangleCount, 0);
    assert.equal(result.stats.volumeM3, 0);
    assert.ok(result.layers.every((l) => l.stats.minimumThicknessM === null));
  }
});

test("missing, nonfinite, crossed and zero-thickness samples are excluded, never repaired", () => {
  for (const value of [null, prediction(NaN), prediction(Infinity)]) {
    const g = grid(3, 3);
    g.points[4].values[1] = value;
    const result = buildLayerVolumes(g);
    for (const layer of result.layers) {
      assertClosed(layer);
      assert.equal(layer.stats.excluded.missing, 6);
      assert.ok(layer.stats.volumeM3 > 0);
    }
  }
  for (const height of [12, 13]) {
    const g = grid(3, 3);
    g.points[4].values[1].value = height;
    const result = buildLayerVolumes(g);
    assert.equal(result.layers[0].stats.excluded.crossed, 6);
    assert.equal(result.layers[1].stats.excluded.crossed, 0);
    for (const layer of result.layers) assertClosed(layer);
  }
});

test("hull inclusion is required for both bounding horizons unless extrapolation is explicitly enabled", () => {
  const g = grid(3, 3);
  g.points[4].values[2].extrapolated = true;
  const conservative = buildLayerVolumes(g),
    expanded = buildLayerVolumes(g, { extrapolate: true });
  assert.equal(conservative.layers[0].stats.excluded.extrapolated, 0);
  assert.equal(conservative.layers[1].stats.excluded.extrapolated, 6);
  near(conservative.layers[0].stats.volumeM3, 800);
  near(expanded.layers[1].stats.volumeM3, 1600);
  for (const layer of [...conservative.layers, ...expanded.layers])
    assertClosed(layer);
});

test("actual 35×35 and 65×65 campaign grids and off-grid north cuts stay closed without inventing a rock bottom", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL("../../data/real-ground/boreholes.json", import.meta.url),
    ),
  );
  const p = { model: "spherical", range: 150, sill: 50, nugget: 0 };
  for (const campaign of [...data.campaigns.map((c) => c.id), "all"]) {
    const holes = data.holes.filter(
      (h) => campaign === "all" || h.campaign === campaign,
    );
    const model = createRealModel(holes, p);
    for (const resolution of [35, 65]) {
      const g = realGrid(model, resolution, resolution);
      for (const clipNorth of [
        undefined,
        (g.bounds[1] + g.bounds[3]) / 2 + 0.123,
      ]) {
        const result = buildLayerVolumes(g, { clipNorth });
        assert.equal(result.stats.unknownRockBottomExcluded, true);
        assert.equal(result.layers.length, 2);
        assert.deepEqual(
          result.layers.map((l) => [l.topIndex, l.bottomIndex]),
          [
            [0, 1],
            [1, 2],
          ],
        );
        for (const layer of result.layers) {
          assert.ok(
            layer.stats.volumeM3 > 0,
            `${campaign}/${resolution} ${layer.id}`,
          );
          assertClosed(layer);
          assert.ok(layer.stats.minimumThicknessM > 0);
        }
      }
    }
  }
});

test("invalid dimensions and clip options fail explicitly rather than create misleading geometry", () => {
  assert.throws(
    () => buildLayerVolumes({ nx: 2, ny: 2, points: [] }),
    /complete realGrid/,
  );
  assert.throws(
    () => buildLayerVolumes(grid(), { clipNorth: NaN }),
    /finite clipNorth/,
  );
  assert.throws(
    () => buildLayerVolumes(grid(), { extrapolate: "yes" }),
    /boolean extrapolate/,
  );
});
