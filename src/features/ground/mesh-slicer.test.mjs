import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sliceClosedMesh } from "./mesh-slicer.mjs";
import { buildLayerVolumes } from "./volume-geometry.mjs";
import { createRealModel, realGrid } from "./real-engine.mjs";

const near = (a, b, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)),
    `${a} != ${b}`,
  );
const faces = [
  [0, 2, 1],
  [0, 3, 2],
  [4, 5, 6],
  [4, 6, 7],
  [0, 1, 5],
  [0, 5, 4],
  [1, 2, 6],
  [1, 6, 5],
  [2, 3, 7],
  [2, 7, 6],
  [3, 0, 4],
  [3, 4, 7],
];
function box(min = [0, 0, 0], max = [10, 20, 30], reverse = false) {
  const [x, y, z] = min,
    [X, Y, Z] = max;
  const vertices = [
    [x, y, z],
    [X, y, z],
    [X, Y, z],
    [x, Y, z],
    [x, y, Z],
    [X, y, Z],
    [X, Y, Z],
    [x, Y, Z],
  ];
  return {
    positions: faces.flatMap((f) =>
      (reverse ? [...f].reverse() : f).flatMap((i) => vertices[i]),
    ),
    surfaceKinds: faces.map((_, i) => `face-${i}`),
  };
}
const combine = (...layers) => ({
  positions: layers.flatMap((l) => l.positions),
  surfaceKinds: layers.flatMap((l) => l.surfaceKinds),
});
function triangles(p) {
  return Array.from({ length: p.length / 9 }, (_, i) => [
    p.slice(i * 9, i * 9 + 3),
    p.slice(i * 9 + 3, i * 9 + 6),
    p.slice(i * 9 + 6, i * 9 + 9),
  ]);
}
function volume(positions) {
  if (!positions.length) return 0;
  const origin = positions.slice(0, 3);
  return triangles(positions).reduce((sum, tri) => {
    const [a, b, c] = tri.map((p) => p.map((v, i) => v - origin[i]));
    return (
      sum +
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6
    );
  }, 0);
}
function closed(result, manifold = true) {
  assert.ok(result.positions.every(Number.isFinite));
  assert.equal(result.surfaceKinds.length, result.positions.length / 9);
  const edges = new Map();
  for (const tri of triangles(result.positions)) {
    for (let i = 0; i < 3; i++) {
      const a = tri[i].join(","),
        b = tri[(i + 1) % 3].join(",");
      assert.notEqual(a, b);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key) ?? { count: 0, orientation: 0 };
      edge.count++;
      edge.orientation += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  for (const [key, edge] of edges) {
    assert.equal(
      manifold ? edge.count : edge.count % 2,
      manifold ? 2 : 0,
      `open or duplicated edge ${key}`,
    );
    assert.equal(edge.orientation, 0, `inconsistent edge ${key}`);
  }
  near(volume(result.positions), result.stats.volumeM3);
  assert.ok(result.stats.volumeM3 >= -1e-8);
}
function capCheck(result, axis, value, keep) {
  const k = { x: 0, y: 1, z: 2 }[axis],
    a = (k + 1) % 3,
    b = (k + 2) % 3;
  let area = 0;
  for (const tri of triangles(result.capPositions)) {
    assert.ok(tri.every((p) => p[k] === value));
    const [p, q, r] = tri;
    const normal =
      (q[a] - p[a]) * (r[b] - p[b]) - (q[b] - p[b]) * (r[a] - p[a]);
    assert.ok(normal * (keep === "below" ? 1 : -1) > 0);
    area += Math.abs(normal) / 2;
  }
  near(area, result.stats.capAreaM2);
}

test("XYZ and both sides preserve analytic cuboid volume, section area, labels and outward watertight caps", () => {
  const input = box(),
    snapshot = JSON.stringify(input);
  for (const [axis, value, total, area] of [
    ["x", 3.3, 10, 600],
    ["y", 7.25, 20, 300],
    ["z", 13.1, 30, 200],
  ]) {
    for (const keep of ["below", "above"]) {
      const result = sliceClosedMesh(input, { axis, value, keep });
      closed(result);
      capCheck(result, axis, value, keep);
      near(
        result.stats.volumeM3,
        area * (keep === "below" ? value : total - value),
      );
      near(result.stats.capAreaM2, area);
      assert.equal(result.stats.boundaryLoopCount, 1);
      assert.equal(result.stats.holeCount, 0);
      assert.ok(result.surfaceKinds.includes("cap"));
      assert.ok(result.surfaceKinds.some((k) => k.startsWith("face-")));
    }
  }
  assert.equal(JSON.stringify(input), snapshot);
});

test("EN coordinates near 240km/520km retain shared intersections and sub-millimetre sections", () => {
  const input = box([240000, 520000, 35], [240010, 520020, 65]);
  for (const [axis, value, expected, area] of [
    ["x", 240000.0002, 0.0002 * 600, 600],
    ["y", 520007.23456789, 7.23456789 * 300, 300],
    ["z", 45.4321, 10.4321 * 200, 200],
  ]) {
    const result = sliceClosedMesh(input, { axis, value, keep: "below" });
    closed(result);
    capCheck(result, axis, value, "below");
    near(result.stats.volumeM3, expected, 2e-8);
    near(result.stats.capAreaM2, area);
  }
});

test("plane through vertices and entire mesh edges creates closed half solids", () => {
  const input = box([-1, -1, -1], [1, 1, 1]);
  input.positions = input.positions.flatMap((_, i, array) =>
    i % 3 === 0
      ? [
          (array[i] - array[i + 1]) / Math.sqrt(2),
          (array[i] + array[i + 1]) / Math.sqrt(2),
          array[i + 2],
        ]
      : [],
  );
  for (const keep of ["below", "above"]) {
    const result = sliceClosedMesh(input, { axis: "x", value: 0, keep });
    closed(result);
    capCheck(result, "x", 0, keep);
    near(result.stats.volumeM3, 4);
    near(result.stats.capAreaM2, 4 * Math.sqrt(2));
  }
});

test("coplanar full boundary faces are exposed once; empty/outside and zero-volume tangencies stay empty", () => {
  for (const [axis, max, area] of [
    ["x", 10, 600],
    ["y", 20, 300],
    ["z", 30, 200],
  ]) {
    for (const [value, keep] of [
      [max, "below"],
      [0, "above"],
    ]) {
      const result = sliceClosedMesh(box(), { axis, value, keep });
      closed(result);
      capCheck(result, axis, value, keep);
      near(result.stats.volumeM3, 6000);
      near(result.stats.capAreaM2, area);
      assert.equal(result.stats.newCapTriangles, 0);
      assert.equal(result.stats.coplanarTriangles, 2);
    }
    for (const [value, keep] of [
      [max + 1, "below"],
      [-1, "above"],
    ]) {
      const result = sliceClosedMesh(box(), { axis, value, keep });
      closed(result);
      near(result.stats.volumeM3, 6000);
      assert.equal(result.capPositions.length, 0);
    }
    for (const [value, keep] of [
      [0, "below"],
      [-1, "below"],
      [max, "above"],
      [max + 1, "above"],
    ]) {
      const result = sliceClosedMesh(box(), { axis, value, keep });
      assert.equal(result.positions.length, 0);
      assert.equal(result.capPositions.length, 0);
      assert.equal(result.stats.volumeM3, 0);
    }
  }
});

test("nested hole and island caps preserve cavity area, volume and do not fill the hole", () => {
  const input = combine(
    box([0, 0, 0], [10, 10, 10]),
    box([2, 2, 2], [8, 8, 8], true),
    box([4, 4, 4], [6, 6, 6]),
  );
  for (const axis of ["x", "y", "z"])
    for (const keep of ["below", "above"]) {
      const result = sliceClosedMesh(input, { axis, value: 5, keep });
      closed(result);
      capCheck(result, axis, 5, keep);
      near(result.stats.volumeM3, 396);
      near(result.stats.capAreaM2, 68);
      assert.equal(result.stats.boundaryLoopCount, 3);
      assert.equal(result.stats.holeCount, 1);
      const k = { x: 0, y: 1, z: 2 }[axis],
        u = (k + 1) % 3,
        v = (k + 2) % 3;
      for (const tri of triangles(result.capPositions)) {
        const c = [u, v].map((i) => tri.reduce((s, p) => s + p[i], 0) / 3);
        const inCavity = c.every((n) => n > 2 && n < 8),
          inIsland = c.every((n) => n >= 4 && n <= 6);
        assert.ok(
          !inCavity || inIsland,
          "cap triangle incorrectly fills a cavity",
        );
      }
    }
});

test("disconnected volumes and a component tangent to the plane produce no dangling coplanar sheet", () => {
  const input = combine(
    box([0, 0, 0], [2, 2, 2]),
    box([3, 0, 0], [5, 2, 2]),
    box([6, 0, 1], [8, 2, 3]),
  );
  const result = sliceClosedMesh(input, { axis: "z", value: 1, keep: "below" });
  closed(result);
  capCheck(result, "z", 1, "below");
  near(result.stats.volumeM3, 8);
  near(result.stats.capAreaM2, 8);
  assert.equal(result.stats.boundaryLoopCount, 2);
});

test("successive XYZ cuts keep previously generated caps watertight", () => {
  let result = box();
  for (const [axis, value] of [
    ["x", 3],
    ["y", 7],
    ["z", 13],
  ]) {
    result = sliceClosedMesh(result, { axis, value, keep: "below" });
    closed(result);
    capCheck(result, axis, value, "below");
  }
  near(result.stats.volumeM3, 3 * 7 * 13);
});

test("actual 35×35 multilayer geometry closes for all axes and conserves complementary volumes", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL("../../data/real-ground/boreholes.json", import.meta.url),
    ),
  );
  const model = createRealModel(data.holes, {
    model: "spherical",
    range: 150,
    sill: 50,
    nugget: 0,
  });
  const grid = realGrid(model, 35, 35);
  const layers = buildLayerVolumes(grid).layers;
  for (const layer of layers) {
    for (const [axis, k] of [
      ["x", 0],
      ["y", 1],
      ["z", 2],
    ]) {
      const values = layer.positions.filter((_, i) => i % 3 === k);
      const value = (Math.min(...values) + Math.max(...values)) / 2 + 0.123;
      const a = sliceClosedMesh(layer, { axis, value, keep: "below" });
      const b = sliceClosedMesh(layer, { axis, value, keep: "above" });
      for (const result of [a, b]) {
        closed(result);
        capCheck(result, axis, value, result.stats.keep);
      }
      near(a.stats.volumeM3 + b.stats.volumeM3, volume(layer.positions));
      near(a.stats.capAreaM2, b.stats.capAreaM2);
    }
  }
});

test("invalid requests, nonfinite geometry and inconsistent labels fail explicitly", () => {
  for (const options of [
    { axis: "toString", value: 1, keep: "below" },
    { axis: "q", value: 1, keep: "below" },
    { axis: "x", value: NaN, keep: "below" },
    { axis: "x", value: 1, keep: "left" },
  ])
    assert.throws(() => sliceClosedMesh(box(), options), /Mesh slice requires/);
  for (const positions of [
    [0, 0, 0],
    [0, 0, NaN, 0, 1, 0, 0, 0, 1],
  ])
    assert.throws(
      () =>
        sliceClosedMesh({ positions }, { axis: "x", value: 1, keep: "below" }),
      /finite E\/N\/H/,
    );
  assert.throws(
    () =>
      sliceClosedMesh(
        { ...box(), surfaceKinds: [] },
        { axis: "x", value: 1, keep: "below" },
      ),
    /surfaceKinds/,
  );
  assert.deepEqual(
    sliceClosedMesh({ positions: [] }, { axis: "x", value: 1, keep: "below" })
      .positions,
    [],
  );
});

test("touching components at a cut vertex retain two distinct filled loops", () => {
  const input = combine(box([0, 0, 0], [2, 2, 2]), box([2, 2, 0], [4, 4, 2]));
  for (const keep of ["below", "above"]) {
    const result = sliceClosedMesh(input, { axis: "z", value: 1, keep });
    closed(result, false);
    capCheck(result, "z", 1, keep);
    near(result.stats.capAreaM2, 8);
    near(result.stats.volumeM3, 8);
    assert.equal(result.stats.boundaryLoopCount, 2);
  }
});

test("actual 65×65 exact fractional hulls and display-base rock close after XYZ cuts", () => {
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
    const grid = realGrid(model, 65, 65);
    const baseElevation =
      Math.min(
        ...grid.points.map((p) => p.values[2]?.value).filter(Number.isFinite),
      ) - 5;
    const hulls = model.horizons.map((h) => h.model?.hull ?? null);
    const layers = buildLayerVolumes(grid, {
      hulls,
      baseElevation,
      extrapolate: false,
    }).layers;
    assert.equal(layers.length, 3);
    for (const layer of layers) {
      for (const [axis, k] of [
        ["x", 0],
        ["y", 1],
        ["z", 2],
      ]) {
        const values = layer.positions.filter((_, i) => i % 3 === k);
        const value = (Math.min(...values) + Math.max(...values)) / 2 + 0.07123;
        const a = sliceClosedMesh(layer, { axis, value, keep: "below" });
        const b = sliceClosedMesh(layer, { axis, value, keep: "above" });
        for (const result of [a, b]) {
          closed(result);
          capCheck(result, axis, value, result.stats.keep);
        }
        near(a.stats.volumeM3 + b.stats.volumeM3, volume(layer.positions));
        near(a.stats.capAreaM2, b.stats.capAreaM2);
      }
    }
  }
});
