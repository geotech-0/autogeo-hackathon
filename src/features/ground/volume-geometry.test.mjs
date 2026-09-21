import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildLayerVolumes,
  VOLUME_LAYERS,
  ROCK_VOLUME_LAYER,
} from "./volume-geometry.mjs";
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

const rectangle = [
  [0, 0],
  [10, 0],
  [10, 20],
  [0, 20],
];
function polygonArea(polygon) {
  const [x, y] = polygon[0];
  return (
    Math.abs(
      polygon.reduce((sum, a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        return sum + (a[0] - x) * (b[1] - y) - (a[1] - y) * (b[0] - x);
      }, 0),
    ) / 2
  );
}
function onPolygonBoundary(point, polygon, tolerance = 1e-7) {
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const along = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length;
    const distance =
      Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / length;
    return (
      distance <= tolerance &&
      along >= -tolerance &&
      along <= length + tolerance
    );
  });
}

test("exact hull clipping preserves an off-grid diamond instead of discarding edge cells", () => {
  const diamond = [
    [5, 1.25],
    [9.25, 10],
    [5, 18.75],
    [0.75, 10],
  ];
  const g = grid(4, 5),
    original = JSON.stringify(g);
  // All sampled corner flags outside: the supplied hull, not corner masks, is authoritative.
  g.points.forEach((q) => q.values.forEach((v) => (v.extrapolated = true)));
  for (const hull of [diamond, [...diamond].reverse()]) {
    const result = buildLayerVolumes(g, { hulls: [hull, hull, hull] });
    assert.equal(result.stats.exactHullClipping, true);
    for (const [i, layer] of result.layers.entries()) {
      assertClosed(layer);
      near(layer.stats.footprintAreaM2, polygonArea(diamond));
      near(layer.stats.volumeM3, polygonArea(diamond) * (i === 0 ? 4 : 8));
      for (const [j, triangle] of triangles(layer).entries()) {
        if (layer.surfaceKinds[j] === "side")
          assert.ok(
            triangle.every((p) => onPolygonBoundary(p, diamond)),
            "side walls follow the actual hull lines",
          );
      }
    }
  }
  g.points.forEach((q) => q.values.forEach((v) => (v.extrapolated = false)));
  assert.equal(JSON.stringify(g), original);
});

test("bounding hull intersection and north cap remain exact after large EN coordinate translation", () => {
  const offset = [239800, 521450];
  const translate = (h) => h.map(([e, n]) => [e + offset[0], n + offset[1]]);
  const top = translate([
    [1, 1],
    [9, 1],
    [9, 19],
    [1, 19],
  ]);
  const lower = translate([
    [0, 3],
    [7, 3],
    [7, 17],
    [0, 17],
  ]);
  const g = grid(5, 6, (e, n) => [20 + 0.2 * (e - offset[0]), 8, 0], [
    offset[0],
    offset[1],
    offset[0] + 10,
    offset[1] + 20,
  ]);
  const hulls = [top, lower, lower],
    snapshot = JSON.stringify(hulls);
  const result = buildLayerVolumes(g, { hulls, clipNorth: offset[1] + 7.123 });
  for (const layer of result.layers) assertClosed(layer);
  near(result.layers[0].stats.footprintAreaM2, 6 * (17 - 7.123));
  near(result.layers[0].stats.volumeM3, 6 * (17 - 7.123) * (12 + 0.2 * 4));
  near(result.layers[1].stats.footprintAreaM2, 7 * (17 - 7.123));
  assert.equal(JSON.stringify(hulls), snapshot);
});

test("a linear horizon crossing is clipped at zero thickness without losing the positive wedge", () => {
  for (const resolution of [2, 3, 6]) {
    const g = grid(resolution, resolution, (e) => [e, 5, -5]);
    const result = buildLayerVolumes(g, {
      hulls: [rectangle, rectangle, rectangle],
    });
    const layer = result.layers[0];
    assertClosed(layer);
    near(layer.stats.footprintAreaM2, 100);
    near(layer.stats.volumeM3, 250);
    near(layer.stats.minimumThicknessM, 0);
    for (const triangle of triangles(layer)) {
      for (const p of triangle) assert.ok(p[0] >= 5);
      const [a, b, c] = triangle,
        u = b.map((v, i) => v - a[i]),
        v = c.map((v, i) => v - a[i]);
      assert.ok(
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) > 1e-12,
      );
    }
  }
});

test("rock base is explicit display metadata, closed and flat; invalid or missing domains never fabricate geology", () => {
  const g = grid();
  const result = buildLayerVolumes(g, {
    hulls: [rectangle, rectangle, rectangle],
    baseElevation: -10,
  });
  assert.equal(result.layers.length, 3);
  const rock = result.layers[2];
  assert.equal(rock.id, ROCK_VOLUME_LAYER.id);
  assert.equal(rock.interpretation, "display-base");
  assert.equal(rock.bottomIndex, null);
  assert.equal(result.stats.rockBottomObserved, false);
  assert.equal(result.stats.displayBaseElevation, -10);
  assert.equal(result.stats.unknownRockBottomExcluded, true);
  assertClosed(rock);
  near(rock.stats.volumeM3, 2000);
  for (const [i, triangle] of triangles(rock).entries())
    if (rock.surfaceKinds[i] === "bottom")
      assert.ok(triangle.every((p) => p[2] === -10));
  for (const base of [0, 1, -1e-9, NaN, Infinity])
    assert.throws(
      () => buildLayerVolumes(g, { baseElevation: base }),
      /baseElevation/,
    );
  const missing = buildLayerVolumes(g, {
    hulls: [rectangle, rectangle, null],
    baseElevation: -10,
  });
  assert.ok(missing.layers[0].positions.length > 0);
  assert.equal(missing.layers[1].positions.length, 0);
  assert.equal(missing.layers[2].positions.length, 0);
  assert.ok(missing.layers[2].stats.excluded.missingHull > 0);
  const expanded = buildLayerVolumes(g, {
    hulls: [null, null, null],
    baseElevation: -10,
    extrapolate: true,
  });
  for (const layer of expanded.layers) assertClosed(layer);
  assert.equal(expanded.stats.nonEmptyLayerCount, 3);
});

test("actual four campaigns and combined data produce manifold hull-clipped volumes including explicit rock display base", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL("../../data/real-ground/boreholes.json", import.meta.url),
    ),
  );
  for (const campaign of [...data.campaigns.map((c) => c.id), "all"]) {
    const model = createRealModel(
      data.holes.filter((h) => campaign === "all" || h.campaign === campaign),
      { model: "spherical", range: 150, sill: 50, nugget: 0 },
    );
    const hulls = model.horizons.map((h) => h.model?.hull ?? null);
    for (const resolution of [35, 65]) {
      const g = realGrid(model, resolution, resolution);
      const baseElevation =
        Math.floor(
          Math.min(
            ...g.points.map((p) => p.values[2]?.value).filter(Number.isFinite),
          ),
        ) - 5;
      for (const clipNorth of [
        undefined,
        (g.bounds[1] + g.bounds[3]) / 2 + 0.123,
      ]) {
        const result = buildLayerVolumes(g, {
          hulls,
          baseElevation,
          clipNorth,
        });
        assert.equal(result.layers.length, 3);
        for (const layer of result.layers) {
          assert.ok(
            layer.stats.volumeM3 > 0,
            `${campaign}/${resolution}/${layer.id}`,
          );
          assertClosed(layer);
          for (const [i, triangle] of triangles(layer).entries()) {
            if (layer.surfaceKinds[i] !== "side") continue;
            for (const point of triangle) {
              const onNorth =
                clipNorth !== undefined &&
                Math.abs(point[1] - clipNorth) < 1e-7;
              assert.ok(
                onNorth ||
                  onPolygonBoundary(point, hulls[layer.topIndex]) ||
                  (layer.bottomIndex !== null &&
                    onPolygonBoundary(point, hulls[layer.bottomIndex])),
                `${campaign}/${resolution}/${layer.id} outer wall must lie on the actual hull or cut`,
              );
            }
          }
        }
        if (clipNorth === undefined)
          near(result.layers[2].stats.footprintAreaM2, polygonArea(hulls[2]));
      }
    }
  }
});
