/**
 * Closed piecewise-linear visualization volumes in original [E, N, H] metres.
 * Hull clipping does not refit kriging or change measured horizon elevations.
 * An optional rock base is a display limit, never an observed geological bottom.
 */
export const VOLUME_LAYERS = Object.freeze([
  Object.freeze({
    id: "overburden",
    name: "표층 복합층",
    color: "#c6a475",
    topIndex: 0,
    bottomIndex: 1,
  }),
  Object.freeze({
    id: "weathered-soil",
    name: "풍화토",
    color: "#71a797",
    topIndex: 1,
    bottomIndex: 2,
  }),
]);
export const ROCK_VOLUME_LAYER = Object.freeze({
  id: "rock",
  name: "암반",
  color: "#667f9c",
  topIndex: 2,
  bottomIndex: null,
  interpretation: "display-base",
});
const THICKNESS_EPSILON = 1e-8;
const AREA_EPSILON = 1e-12;
// Sub-micrometre welding only reconciles round-off on shared clipped edges.
const WELD_EPSILON = 1e-8;
const PLANE_EPSILON = 1e-9;

/** @typedef {{key:string,e:number,n:number,top:number,bottom:number}} Vertex */
/** @typedef {{a:Vertex,b:Vertex,count:number}} Edge */
/** @typedef {{extrapolate?:boolean,clipNorth?:number,hulls?:(number[][]|null)[],baseElevation?:number}} VolumeOptions */
function twiceArea(a, b, c) {
  return (b.e - a.e) * (c.n - a.n) - (b.n - a.n) * (c.e - a.e);
}
function edgeKey(a, b) {
  return a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
}
function hullPlanes(hull, index) {
  if (!Array.isArray(hull) || hull.length < 3) return null;
  let polygon = hull.map((p) =>
    Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite)
      ? p.slice(0, 2)
      : null,
  );
  if (polygon.some((p) => p === null)) return null;
  polygon = polygon.filter(
    (p, i) =>
      i === 0 || p[0] !== polygon[i - 1][0] || p[1] !== polygon[i - 1][1],
  );
  if (
    polygon.length > 1 &&
    polygon[0][0] === polygon.at(-1)[0] &&
    polygon[0][1] === polygon.at(-1)[1]
  )
    polygon.pop();
  if (polygon.length < 3) return null;
  const [ox, oy] = polygon[0];
  const area = polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + (a[0] - ox) * (b[1] - oy) - (a[1] - oy) * (b[0] - ox);
  }, 0);
  if (Math.abs(area) <= AREA_EPSILON) return null;
  if (area < 0) polygon.reverse();
  const planes = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    return {
      id: `h${index}:${i}`,
      distance: (q) => (dx * (q.n - a[1]) - dy * (q.e - a[0])) / length,
    };
  });
  // The supplied domain is a convex observation hull, not an arbitrary polygon.
  if (
    planes.some((plane) =>
      polygon.some(([e, n]) => plane.distance({ e, n }) < -PLANE_EPSILON),
    )
  )
    throw new Error("Observation hulls must be convex polygons.");
  return planes;
}

function vertexPool() {
  const buckets = new Map();
  let serial = 0;
  return (q) => {
    const x = Math.floor(q.e / WELD_EPSILON),
      y = Math.floor(q.n / WELD_EPSILON);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        for (const p of buckets.get(`${x + i}:${y + j}`) ?? []) {
          if (
            Math.abs(p.e - q.e) <= WELD_EPSILON &&
            Math.abs(p.n - q.n) <= WELD_EPSILON &&
            Math.abs(p.top - q.top) <= WELD_EPSILON &&
            Math.abs(p.bottom - q.bottom) <= WELD_EPSILON
          )
            return p;
        }
      }
    q.key = `p${serial++}`;
    const key = `${x}:${y}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(q);
    return q;
  };
}

/** Clip one linear polygon to a half-space; shared intersections are bit-identical. */
function clipPolygon(vertices, plane, intersections, intern) {
  const distance = (q) => {
    const d = plane.distance(q);
    return plane.thickness ? d : Math.abs(d) <= PLANE_EPSILON ? 0 : d;
  };
  const cut = (a, b) => {
    if (distance(a) === 0) return a;
    if (distance(b) === 0) return b;
    const key = `${plane.id}:${edgeKey(a, b)}`;
    if (intersections.has(key)) return intersections.get(key);
    const [u, v] = a.key < b.key ? [a, b] : [b, a];
    const du = distance(u),
      dv = distance(v),
      t = du / (du - dv);
    const q = {
      e: u.e + t * (v.e - u.e),
      n: u.n + t * (v.n - u.n),
      top: u.top + t * (v.top - u.top),
      bottom: u.bottom + t * (v.bottom - u.bottom),
    };
    if (plane.north !== undefined) q.n = plane.north;
    if (plane.thickness) q.top = q.bottom = (q.top + q.bottom) / 2;
    const vertex = intern(q);
    intersections.set(key, vertex);
    return vertex;
  };
  const polygon = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const insideA = distance(a) >= 0,
      insideB = distance(b) >= 0;
    if (insideA && insideB) polygon.push(b);
    else if (insideA) polygon.push(cut(a, b));
    else if (insideB) polygon.push(cut(a, b), b);
  }
  return polygon.filter(
    (q, i) => q.key !== polygon[(i + polygon.length - 1) % polygon.length]?.key,
  );
}

/**
 * With hulls, clip grid triangles exactly to both bounding observation hulls and
 * to their positive-thickness domain. Intersections use the original triangle's
 * linear top/bottom interpolation. Without hulls the legacy conservative sample
 * mask remains unchanged. Optional N clipping retains N>=clipNorth.
 * surfaceKinds contains one top/bottom/side label per triangle; sides include caps.
 * baseElevation must be below every finite sampled rock top by >1e-8 m. It is a
 * strict display-domain policy: invalid limits fail rather than altering geology.
 * @param {import('./real-types').RealGrid} grid
 * @param {VolumeOptions} [options]
 */
export function buildLayerVolumes(grid, options = {}) {
  const { extrapolate = false, clipNorth, hulls, baseElevation } = options;
  if (
    !grid ||
    !Number.isInteger(grid.nx) ||
    !Number.isInteger(grid.ny) ||
    grid.nx < 2 ||
    grid.ny < 2 ||
    !Array.isArray(grid.points) ||
    grid.points.length !== grid.nx * grid.ny
  )
    throw new Error(
      "A complete realGrid with at least 2×2 vertices is required.",
    );
  if (
    typeof extrapolate !== "boolean" ||
    (clipNorth !== undefined && !Number.isFinite(clipNorth))
  )
    throw new Error(
      "Volume options require a boolean extrapolate and finite clipNorth.",
    );
  if (hulls !== undefined && !Array.isArray(hulls))
    throw new Error("hulls must be an array of convex polygons or null.");
  if (baseElevation !== undefined) {
    if (!Number.isFinite(baseElevation))
      throw new Error("A finite display baseElevation is required.");
    const rockTops = grid.points
      .map((p) => p.values?.[2]?.value)
      .filter(Number.isFinite);
    if (
      rockTops.length &&
      !(baseElevation < Math.min(...rockTops) - THICKNESS_EPSILON)
    )
      throw new Error(
        "Display baseElevation must be below every finite sampled rock top by more than 1e-8 m.",
      );
  }
  const exactHull = hulls !== undefined && !extrapolate;
  const preparedHulls = exactHull
    ? [0, 1, 2].map((i) => hullPlanes(hulls[i], i))
    : null;
  const definitions =
    baseElevation === undefined
      ? VOLUME_LAYERS
      : [...VOLUME_LAYERS, ROCK_VOLUME_LAYER];
  const inputTriangles = (grid.nx - 1) * (grid.ny - 1) * 2;
  const layers = definitions.map((definition) => {
    const positions = [],
      surfaceKinds = [];
    /** @type {Map<string,Edge>} */
    const edges = new Map();
    const intersections = new Map(),
      intern = vertexPool(),
      gridVertices = new Map();
    const hullIndices =
      definition.bottomIndex === null
        ? [definition.topIndex]
        : [definition.topIndex, definition.bottomIndex];
    const missingHull = exactHull && hullIndices.some((i) => !preparedHulls[i]);
    const planes =
      exactHull && !missingHull
        ? hullIndices.flatMap((i) => preparedHulls[i])
        : [];
    if (clipNorth !== undefined)
      planes.push({
        id: "north",
        north: clipNorth,
        distance: (q) => q.n - clipNorth,
      });
    const stats = {
      inputTriangles,
      acceptedSourceTriangles: 0,
      clippedSourceTriangles: 0,
      excluded: {
        missing: 0,
        extrapolated: 0,
        crossed: 0,
        degenerate: 0,
        clipped: 0,
        missingHull: 0,
      },
      topTriangles: 0,
      bottomTriangles: 0,
      sideTriangles: 0,
      boundaryEdges: 0,
      cutEdges: 0,
      footprintAreaM2: 0,
      volumeM3: 0,
      minimumThicknessM: null,
      maximumThicknessM: null,
    };
    const append = (kind, a, b, c) => {
      // A pinched edge has only one non-degenerate side triangle, or none.
      const u = b.map((v, i) => v - a[i]),
        v = c.map((v, i) => v - a[i]);
      if (
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) <= AREA_EPSILON
      )
        return false;
      positions.push(...a, ...b, ...c);
      surfaceKinds.push(kind);
      return true;
    };
    const top = (q) => [q.e, q.n, q.top],
      bottom = (q) => [q.e, q.n, q.bottom];
    const addEdge = (a, b) => {
      const key = edgeKey(a, b),
        old = edges.get(key);
      if (old) {
        if (old.count !== 1 || old.a.key !== b.key || old.b.key !== a.key)
          throw new Error(
            "Overlapping or inconsistently oriented grid triangles cannot form a closed volume.",
          );
        old.count++;
      } else edges.set(key, { a, b, count: 1 });
    };
    const addTriangle = (vertices) => {
      const [a, b, c] = vertices,
        area = twiceArea(a, b, c) / 2;
      const thicknesses = vertices.map((q) => q.top - q.bottom);
      if (
        !(area > AREA_EPSILON) ||
        Math.max(...thicknesses) <= THICKNESS_EPSILON
      )
        return false;
      append("top", top(a), top(b), top(c));
      append("bottom", bottom(a), bottom(c), bottom(b));
      stats.topTriangles++;
      stats.bottomTriangles++;
      stats.footprintAreaM2 += area;
      stats.volumeM3 += (area * thicknesses.reduce((sum, t) => sum + t, 0)) / 3;
      for (const t of thicknesses) {
        stats.minimumThicknessM =
          stats.minimumThicknessM === null
            ? t
            : Math.min(stats.minimumThicknessM, t);
        stats.maximumThicknessM =
          stats.maximumThicknessM === null
            ? t
            : Math.max(stats.maximumThicknessM, t);
      }
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
      return true;
    };
    const processTriangle = (indices) => {
      if (missingHull) {
        stats.excluded.missingHull++;
        return;
      }
      const samples = indices.map((i) => grid.points[i]);
      if (
        samples.some(
          (q) =>
            !q ||
            !Number.isFinite(q.e) ||
            !Number.isFinite(q.n) ||
            !Number.isFinite(q.values?.[definition.topIndex]?.value) ||
            (definition.bottomIndex !== null &&
              !Number.isFinite(q.values?.[definition.bottomIndex]?.value)),
        )
      ) {
        stats.excluded.missing++;
        return;
      }
      if (
        !extrapolate &&
        !exactHull &&
        samples.some((q) =>
          hullIndices.some((i) => q.values[i].extrapolated !== false),
        )
      ) {
        stats.excluded.extrapolated++;
        return;
      }
      let vertices = samples.map((q, i) => {
        if (!gridVertices.has(indices[i]))
          gridVertices.set(
            indices[i],
            intern({
              e: q.e,
              n: q.n,
              top: q.values[definition.topIndex].value,
              bottom:
                definition.bottomIndex === null
                  ? baseElevation
                  : q.values[definition.bottomIndex].value,
            }),
          );
        return gridVertices.get(indices[i]);
      });
      if (
        hulls === undefined &&
        vertices.some((q) => q.top - q.bottom <= THICKNESS_EPSILON)
      ) {
        stats.excluded.crossed++;
        return;
      }
      const area = twiceArea(...vertices);
      if (Math.abs(area) <= AREA_EPSILON) {
        stats.excluded.degenerate++;
        return;
      }
      if (area < 0) vertices = [vertices[0], vertices[2], vertices[1]];
      let wasClipped = false;
      for (const plane of planes) {
        if (vertices.some((q) => plane.distance(q) < -PLANE_EPSILON))
          wasClipped = true;
        vertices = clipPolygon(vertices, plane, intersections, intern);
        if (vertices.length < 3) {
          stats.excluded.clipped++;
          return;
        }
      }
      if (hulls !== undefined && vertices.some((q) => q.top < q.bottom)) {
        wasClipped = true;
        vertices = clipPolygon(
          vertices,
          {
            id: "thickness",
            thickness: true,
            distance: (q) => q.top - q.bottom,
          },
          intersections,
          intern,
        );
        if (vertices.length < 3) {
          stats.excluded.crossed++;
          return;
        }
      }
      if (wasClipped) stats.clippedSourceTriangles++;
      let accepted = false;
      if (vertices.length === 3) accepted = addTriangle(vertices);
      else {
        // A centre fan preserves every boundary subdivision, including collinear
        // hull/grid intersections; dropping one would introduce a T-junction.
        const centre = intern({
          e: vertices.reduce((s, q) => s + q.e, 0) / vertices.length,
          n: vertices.reduce((s, q) => s + q.n, 0) / vertices.length,
          top: vertices.reduce((s, q) => s + q.top, 0) / vertices.length,
          bottom: vertices.reduce((s, q) => s + q.bottom, 0) / vertices.length,
        });
        for (let i = 0; i < vertices.length; i++)
          accepted =
            addTriangle([
              centre,
              vertices[i],
              vertices[(i + 1) % vertices.length],
            ]) || accepted;
      }
      if (accepted) stats.acceptedSourceTriangles++;
      else stats.excluded.clipped++;
    };
    for (let j = 0; j < grid.ny - 1; j++)
      for (let i = 0; i < grid.nx - 1; i++) {
        const a = j * grid.nx + i,
          b = a + 1,
          d = a + grid.nx,
          c = d + 1;
        processTriangle([a, b, c]);
        processTriangle([a, c, d]);
      }
    for (const { a, b, count } of edges.values()) {
      if (count !== 1) continue;
      // CCW footprint interior is left; outward side faces point right.
      if (append("side", top(a), bottom(a), bottom(b))) stats.sideTriangles++;
      if (append("side", top(a), bottom(b), top(b))) stats.sideTriangles++;
      stats.boundaryEdges++;
      if (
        clipNorth !== undefined &&
        Math.abs(a.n - clipNorth) <= WELD_EPSILON &&
        Math.abs(b.n - clipNorth) <= WELD_EPSILON
      )
        stats.cutEdges++;
    }
    return {
      ...definition,
      ...(definition.bottomIndex === null ? { baseElevation } : {}),
      positions,
      surfaceKinds,
      stats,
    };
  });
  return {
    layers,
    stats: {
      layerCount: layers.length,
      nonEmptyLayerCount: layers.filter((l) => l.positions.length > 0).length,
      triangleCount: layers.reduce((n, l) => n + l.surfaceKinds.length, 0),
      volumeM3: layers.reduce((n, l) => n + l.stats.volumeM3, 0),
      clipNorth: clipNorth ?? null,
      extrapolate,
      exactHullClipping: exactHull,
      unknownRockBottomExcluded: true,
      displayBaseElevation: baseElevation ?? null,
      rockBottomObserved: false,
    },
  };
}
