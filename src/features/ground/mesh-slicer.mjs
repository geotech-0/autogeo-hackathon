/** Exact plane clipping of outward, closed triangle soups in original E/N/H metres. */
import { ShapeUtils, Vector2 } from "three";

const EPSILON = 1e-7;
const AXES = { x: 0, y: 1, z: 2 };
const cross = (a, b, c) => {
  const u = b.map((v, i) => v - a[i]);
  const v = c.map((v, i) => v - a[i]);
  return [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
};
const area2 = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const edgeKey = (a, b) => (a.id < b.id ? `${a.id}/${b.id}` : `${b.id}/${a.id}`);

function signedArea(points) {
  const a = points[0];
  let twice = 0;
  for (let i = 1; i + 1 < points.length; i++)
    twice += area2(a, points[i], points[i + 1]);
  return twice / 2;
}

// 0 is boundary, 1 interior, -1 exterior. Computed in translated plane coordinates.
function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (
      Math.abs(area2(a, b, p)) <= EPSILON * length &&
      p[0] >= Math.min(a[0], b[0]) - EPSILON &&
      p[0] <= Math.max(a[0], b[0]) + EPSILON &&
      p[1] >= Math.min(a[1], b[1]) - EPSILON &&
      p[1] <= Math.max(a[1], b[1]) + EPSILON
    )
      return 0;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 1 : -1;
}

/**
 * @param {{positions:number[]|Float64Array|Float32Array,surfaceKinds?:string[]}} layer
 * @param {{axis:'x'|'y'|'z',value:number,keep:'below'|'above'}} options
 * @returns {{positions:number[],capPositions:number[],surfaceKinds:string[],stats:object}}
 *
 * x=E, y=N, z=EL.H. below keeps <= value; above keeps >= value.
 * Positions include retained source triangles AND newly generated closed caps.
 * capPositions additionally exposes only the plane section (including an existing
 * outward coplanar boundary face), with no duplicate faces in positions.
 * surfaceKinds is per output triangle, preserving input kinds; new caps use 'cap'.
 * Degenerate zero-volume tangencies return an empty solid. No source data mutates.
 * This requires a closed, consistently outward input mesh; open cut contours throw.
 */
export function sliceClosedMesh(layer, options) {
  const axis = Object.hasOwn(AXES, options?.axis)
      ? AXES[options.axis]
      : undefined,
    value = options?.value,
    keep = options?.keep;
  if (
    axis === undefined ||
    !Number.isFinite(value) ||
    !["below", "above"].includes(keep)
  ) {
    throw new Error(
      "Mesh slice requires axis x/y/z, a finite value, and keep below/above.",
    );
  }
  const source = layer?.positions;
  if (
    (!Array.isArray(source) && !ArrayBuffer.isView(source)) ||
    !Number.isInteger(source.length) ||
    source.length % 9 ||
    !Array.from(source).every(Number.isFinite)
  )
    throw new Error(
      "Mesh positions must contain finite E/N/H triangle triples.",
    );
  if (
    layer.surfaceKinds !== undefined &&
    (!Array.isArray(layer.surfaceKinds) ||
      layer.surfaceKinds.length !== source.length / 9 ||
      !layer.surfaceKinds.every((k) => typeof k === "string"))
  ) {
    throw new Error(
      "surfaceKinds must contain one string per source triangle.",
    );
  }
  const positions = [],
    capPositions = [],
    surfaceKinds = [];
  const stats = {
    axis: options.axis,
    value,
    keep,
    toleranceM: EPSILON,
    inputTriangles: source.length / 9,
    outputTriangles: 0,
    retainedTriangles: 0,
    clippedTriangles: 0,
    discardedTriangles: 0,
    degenerateTriangles: 0,
    newCapTriangles: 0,
    coplanarTriangles: 0,
    capTriangles: 0,
    boundaryLoopCount: 0,
    holeCount: 0,
    capAreaM2: 0,
    volumeM3: 0,
    empty: true,
  };
  const result = { positions, capPositions, surfaceKinds, stats };
  if (!source.length) return result;
  const origin = Array.from(source.slice(0, 3));
  const plane = value - origin[axis];
  const direction = keep === "below" ? 1 : -1;
  const u = (axis + 1) % 3,
    v = (axis + 2) % 3;
  const project = (p) => [p[u], direction * p[v]];
  const vertices = [],
    exact = new Map(),
    buckets = new Map(),
    cuts = new Map();
  // Weld within 0.1 micrometre after translation, not by rounded global EN keys.
  const vertex = (coordinates) => {
    if (Math.abs(coordinates[axis] - plane) <= EPSILON)
      coordinates[axis] = plane;
    const exactKey = coordinates.join(",");
    if (exact.has(exactKey)) return exact.get(exactKey);
    const cell = coordinates.map((c) => Math.floor(c / EPSILON));
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const candidates = buckets.get(
            `${cell[0] + i},${cell[1] + j},${cell[2] + k}`,
          );
          if (!candidates) continue;
          for (const q of candidates) {
            if (coordinates.every((c, a) => Math.abs(c - q.p[a]) <= EPSILON)) {
              exact.set(exactKey, q);
              return q;
            }
          }
        }
    const q = { id: vertices.length, p: coordinates, uv: project(coordinates) };
    vertices.push(q);
    exact.set(exactKey, q);
    const key = cell.join(",");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(q);
    return q;
  };
  const input = [];
  let hasInterior = false;
  for (let i = 0; i < source.length; i += 3) {
    const q = vertex([
      source[i] - origin[0],
      source[i + 1] - origin[1],
      source[i + 2] - origin[2],
    ]);
    if (direction * (q.p[axis] - plane) < 0) hasInterior = true;
    input.push(q);
  }
  if (!hasInterior) {
    stats.discardedTriangles = stats.inputTriangles;
    return result;
  }
  const intersection = (a, b) => {
    if (a.p[axis] === plane) return a;
    if (b.p[axis] === plane) return b;
    const key = edgeKey(a, b);
    if (cuts.has(key)) return cuts.get(key);
    const [s, t] = a.id < b.id ? [a, b] : [b, a];
    const f = (plane - s.p[axis]) / (t.p[axis] - s.p[axis]);
    const p = s.p.map((c, i) => c + f * (t.p[i] - c));
    p[axis] = plane;
    const q = vertex(p);
    cuts.set(key, q);
    return q;
  };
  const localTriangles = [],
    planarEdges = new Map();
  const add = (a, b, c, kind, cap = false) => {
    if (
      a.id === b.id ||
      b.id === c.id ||
      a.id === c.id ||
      Math.hypot(...cross(a.p, b.p, c.p)) <= EPSILON * EPSILON
    )
      return false;
    localTriangles.push([a, b, c]);
    surfaceKinds.push(kind);
    const world = [a, b, c].flatMap((q) =>
      q.p.map((n, i) => (i === axis && n === plane ? value : n + origin[i])),
    );
    positions.push(...world);
    if (cap) {
      capPositions.push(...world);
      stats.capAreaM2 += Math.abs(area2(a.uv, b.uv, c.uv)) / 2;
      stats.capTriangles++;
    }
    return true;
  };
  const trackPlaneEdges = (a, b, c) => {
    for (const [s, t] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      if (s.p[axis] !== plane || t.p[axis] !== plane) continue;
      const key = edgeKey(s, t);
      const entry = planarEdges.get(key) ?? {
        a: s.id < t.id ? s : t,
        b: s.id < t.id ? t : s,
        count: 0,
      };
      entry.count += s.id < t.id ? 1 : -1;
      planarEdges.set(key, entry);
    }
  };
  const addOuter = (a, b, c, kind, coplanar) => {
    if (!add(a, b, c, kind, coplanar)) {
      stats.degenerateTriangles++;
      return;
    }
    stats.retainedTriangles++;
    if (coplanar) stats.coplanarTriangles++;
    trackPlaneEdges(a, b, c);
  };
  for (let i = 0; i < input.length; i += 3) {
    const triangle = input.slice(i, i + 3);
    const inside = triangle.map((q) => direction * (q.p[axis] - plane) <= 0);
    const coplanar = triangle.every((q) => q.p[axis] === plane);
    if (
      !inside.some(Boolean) ||
      (coplanar && direction * cross(...triangle.map((q) => q.p))[axis] <= 0)
    ) {
      stats.discardedTriangles++;
      continue;
    }
    if (inside.every(Boolean)) {
      addOuter(...triangle, layer.surfaceKinds?.[i / 3] ?? "surface", coplanar);
      continue;
    }
    stats.clippedTriangles++;
    const polygon = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j],
        b = triangle[(j + 1) % 3];
      if (inside[j] && inside[(j + 1) % 3]) polygon.push(b);
      else if (inside[j]) polygon.push(intersection(a, b));
      else if (inside[(j + 1) % 3]) polygon.push(intersection(a, b), b);
    }
    const clean = polygon.filter(
      (q, j) => q.id !== polygon[(j + polygon.length - 1) % polygon.length]?.id,
    );
    for (let j = 1; j + 1 < clean.length; j++)
      addOuter(
        clean[0],
        clean[j],
        clean[j + 1],
        layer.surfaceKinds?.[i / 3] ?? "surface",
        false,
      );
  }
  // Reverse retained-face boundary edges: the cap's interior is now to their left.
  const edges = [];
  for (const { a, b, count } of planarEdges.values()) {
    if (Math.abs(count) > 1)
      throw new Error(
        "Mesh slice has overlapping or inconsistent plane boundary edges.",
      );
    if (count) edges.push(count > 0 ? { a: b, b: a } : { a, b });
  }
  const outgoing = new Map();
  edges.forEach((e, i) => {
    if (!outgoing.has(e.a.id)) outgoing.set(e.a.id, []);
    outgoing.get(e.a.id).push(i);
  });
  const next = edges.map((e) => {
    const candidates = outgoing.get(e.b.id);
    if (!candidates?.length)
      throw new Error(
        "Mesh slice has an open plane contour; provide a closed mesh.",
      );
    const reverse = Math.atan2(e.a.uv[1] - e.b.uv[1], e.a.uv[0] - e.b.uv[0]);
    let best,
      bestTurn = Infinity;
    for (const index of candidates) {
      const q = edges[index].b;
      const turn =
        (reverse -
          Math.atan2(q.uv[1] - e.b.uv[1], q.uv[0] - e.b.uv[0]) +
          2 * Math.PI) %
        (2 * Math.PI);
      if (turn < bestTurn) {
        bestTurn = turn;
        best = index;
      }
    }
    return best;
  });
  const visited = new Set(),
    loops = [];
  for (let start = 0; start < edges.length; start++) {
    if (visited.has(start)) continue;
    const ring = [];
    let current = start;
    do {
      if (visited.has(current))
        throw new Error(
          "Mesh slice contour branches inconsistently; provide an outward closed mesh.",
        );
      visited.add(current);
      ring.push(edges[current].a);
      current = next[current];
    } while (current !== start);
    const area = signedArea(ring.map((q) => q.uv));
    if (ring.length >= 3 && Math.abs(area) > EPSILON * EPSILON)
      loops.push({ ring, area, parent: -1, depth: 0 });
  }
  // Even nesting depths are filled islands, odd depths holes. Handles disconnected
  // components, cavities, and solid islands nested inside a cavity.
  for (let i = 0; i < loops.length; i++) {
    let parentArea = Infinity;
    for (let j = 0; j < loops.length; j++) {
      if (
        i === j ||
        Math.abs(loops[j].area) <= Math.abs(loops[i].area) ||
        Math.abs(loops[j].area) >= parentArea
      )
        continue;
      const classifications = loops[i].ring.map((q) =>
        pointInPolygon(
          q.uv,
          loops[j].ring.map((p) => p.uv),
        ),
      );
      const classification = classifications.find((c) => c !== 0);
      if (classification === 1) {
        loops[i].parent = j;
        parentArea = Math.abs(loops[j].area);
      }
    }
  }
  for (const loop of loops) {
    for (let p = loop.parent; p !== -1; p = loops[p].parent) loop.depth++;
    if (loop.depth % 2) stats.holeCount++;
  }
  stats.boundaryLoopCount = loops.length;
  const capVertices = Array.from(
    new Map(loops.flatMap((l) => l.ring).map((q) => [q.id, q])).values(),
  );
  const addCap = (a, b, c) => {
    if (area2(a.uv, b.uv, c.uv) < 0) [b, c] = [c, b];
    if (add(a, b, c, "cap", true)) {
      stats.newCapTriangles++;
      trackPlaneEdges(a, b, c);
    }
  };
  for (let i = 0; i < loops.length; i++) {
    if (loops[i].depth % 2) continue;
    const outer = loops[i].ring;
    const holes = loops.filter((l) => l.parent === i).map((l) => l.ring);
    const flattened = [outer, ...holes].flat();
    const faces = ShapeUtils.triangulateShape(
      outer.map((q) => new Vector2(...q.uv)),
      holes.map((r) => r.map((q) => new Vector2(...q.uv))),
    );
    for (const face of faces) {
      const tri = face.map((index) => flattened[index]);
      const longest = Math.max(
        ...tri.map((q, j) =>
          Math.hypot(
            q.uv[0] - tri[(j + 1) % 3].uv[0],
            q.uv[1] - tri[(j + 1) % 3].uv[1],
          ),
        ),
      );
      if (Math.abs(area2(...tri.map((q) => q.uv))) <= EPSILON * longest)
        continue;
      // Earcut may omit collinear contour vertices. Restore them on BOTH sides
      // of every cap edge, preventing T-junction cracks in the closed triangle soup.
      const perimeter = [];
      for (let j = 0; j < 3; j++) {
        const a = tri[j],
          b = tri[(j + 1) % 3];
        const dx = b.uv[0] - a.uv[0],
          dy = b.uv[1] - a.uv[1],
          length2 = dx * dx + dy * dy;
        const interior = [];
        for (const q of capVertices) {
          if (q.id === a.id || q.id === b.id) continue;
          const t =
            ((q.uv[0] - a.uv[0]) * dx + (q.uv[1] - a.uv[1]) * dy) / length2;
          if (
            t <= 0 ||
            t >= 1 ||
            Math.abs(area2(a.uv, b.uv, q.uv)) > EPSILON * Math.sqrt(length2)
          )
            continue;
          interior.push({ q, t });
        }
        perimeter.push(
          a,
          ...interior.sort((s, t) => s.t - t.t).map((s) => s.q),
        );
      }
      if (perimeter.length === 3) addCap(...tri);
      else {
        const center = vertex(
          [0, 1, 2].map((a) => (tri[0].p[a] + tri[1].p[a] + tri[2].p[a]) / 3),
        );
        for (let j = 0; j < perimeter.length; j++)
          addCap(center, perimeter[j], perimeter[(j + 1) % perimeter.length]);
      }
    }
  }
  if ([...planarEdges.values()].some((edge) => edge.count !== 0)) {
    throw new Error(
      "Mesh slice cap triangulation left an open boundary; the slice was not returned.",
    );
  }
  for (const [a, b, c] of localTriangles) {
    const bc = [
      b.p[1] * c.p[2] - b.p[2] * c.p[1],
      b.p[2] * c.p[0] - b.p[0] * c.p[2],
      b.p[0] * c.p[1] - b.p[1] * c.p[0],
    ];
    stats.volumeM3 += (a.p[0] * bc[0] + a.p[1] * bc[1] + a.p[2] * bc[2]) / 6;
  }
  stats.outputTriangles = surfaceKinds.length;
  stats.empty = positions.length === 0;
  return result;
}
