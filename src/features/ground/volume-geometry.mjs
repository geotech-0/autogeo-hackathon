/**
 * Closed visualization volumes between the three confirmed real-site horizons.
 * Coordinates are original [E, N, H] metres, with outward triangle winding.
 * No datum adjustment, depth extension, smoothing or new kriging is performed.
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

const THICKNESS_EPSILON = 1e-8;
const AREA_EPSILON = 1e-12;

/** @typedef {{key:string,e:number,n:number,top:number,bottom:number}} Vertex */
/** @typedef {{a:Vertex,b:Vertex,count:number}} Edge */
/** @typedef {{extrapolate?:boolean,clipNorth?:number}} VolumeOptions */

function twiceArea(a, b, c) {
  return (b.e - a.e) * (c.n - a.n) - (b.n - a.n) * (c.e - a.e);
}

function edgeKey(a, b) {
  return a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
}

/**
 * Clip one linear triangle against N >= north. Intersections are cached by the
 * original mesh edge so neighbouring faces reuse exactly identical coordinates.
 * At a grid vertex the original vertex is reused, avoiding zero-length edges.
 * @param {Vertex[]} vertices
 * @param {number} north
 * @param {Map<string,Vertex>} intersections
 * @returns {Vertex[]}
 */
function clipTriangle(vertices, north, intersections) {
  const cut = (a, b) => {
    if (a.n === north) return a;
    if (b.n === north) return b;
    const key = edgeKey(a, b);
    if (intersections.has(key)) return intersections.get(key);
    // Stable endpoint order avoids last-bit differences from reversed edges.
    const [u, v] = a.key < b.key ? [a, b] : [b, a];
    const t = (north - u.n) / (v.n - u.n);
    const q = {
      key: `cut:${key}`,
      e: u.e + t * (v.e - u.e),
      n: north,
      top: u.top + t * (v.top - u.top),
      bottom: u.bottom + t * (v.bottom - u.bottom),
    };
    intersections.set(key, q);
    return q;
  };
  const polygon = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const insideA = a.n >= north,
      insideB = b.n >= north;
    if (insideA && insideB) polygon.push(b);
    else if (insideA) polygon.push(cut(a, b));
    else if (insideB) polygon.push(cut(a, b), b);
  }
  return polygon.filter(
    (q, i) => q.key !== polygon[(i + polygon.length - 1) % polygon.length]?.key,
  );
}

/**
 * Conservative piecewise-linear volumes on the existing realGrid triangulation.
 * Each triangle requires finite top and bottom samples and strictly positive
 * thickness at every vertex. With extrapolate=false both horizons must be inside
 * their own observation hulls at all vertices. Convexity then keeps the entire
 * triangle inside both hulls; no boundary heights are invented outside them.
 *
 * A cut is exact for these mesh triangles, not a new evaluation of the nonlinear
 * kriging field. The northern part is retained and the cut face is closed.
 * surfaceKinds has one entry per output triangle; side includes cut caps.
 * An unknown rock bottom is never generated: exactly the two defined pairs exist.
 * @param {import('./real-types').RealGrid} grid
 * @param {VolumeOptions} [options]
 */
export function buildLayerVolumes(grid, options = {}) {
  const { extrapolate = false, clipNorth } = options;
  if (
    !grid ||
    !Number.isInteger(grid.nx) ||
    !Number.isInteger(grid.ny) ||
    grid.nx < 2 ||
    grid.ny < 2 ||
    !Array.isArray(grid.points) ||
    grid.points.length !== grid.nx * grid.ny
  ) {
    throw new Error(
      "A complete realGrid with at least 2×2 vertices is required.",
    );
  }
  if (
    typeof extrapolate !== "boolean" ||
    (clipNorth !== undefined && !Number.isFinite(clipNorth))
  ) {
    throw new Error(
      "Volume options require a boolean extrapolate and finite clipNorth.",
    );
  }
  const inputTriangles = (grid.nx - 1) * (grid.ny - 1) * 2;
  const layers = VOLUME_LAYERS.map((definition) => {
    const positions = [],
      surfaceKinds = [];
    /** @type {Map<string,Edge>} */
    const edges = new Map();
    /** @type {Map<string,Vertex>} */
    const intersections = new Map();
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
      positions.push(...a, ...b, ...c);
      surfaceKinds.push(kind);
    };
    const top = (q) => [q.e, q.n, q.top];
    const bottom = (q) => [q.e, q.n, q.bottom];
    const addEdge = (a, b) => {
      const key = edgeKey(a, b),
        old = edges.get(key);
      if (old) {
        if (old.count !== 1 || old.a.key !== b.key || old.b.key !== a.key) {
          throw new Error(
            "Overlapping or inconsistently oriented grid triangles cannot form a closed volume.",
          );
        }
        old.count++;
      } else edges.set(key, { a, b, count: 1 });
    };
    const addTriangle = (vertices) => {
      const a = vertices[0],
        b = vertices[1],
        c = vertices[2];
      const area = twiceArea(a, b, c) / 2;
      if (!(area > AREA_EPSILON)) return false;
      append("top", top(a), top(b), top(c));
      append("bottom", bottom(a), bottom(c), bottom(b));
      stats.topTriangles++;
      stats.bottomTriangles++;
      stats.footprintAreaM2 += area;
      const thicknesses = vertices.map((q) => q.top - q.bottom);
      stats.volumeM3 += (area * thicknesses.reduce((s, t) => s + t, 0)) / 3;
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
      const samples = indices.map((i) => grid.points[i]);
      if (
        samples.some(
          (q) =>
            !q ||
            !Number.isFinite(q.e) ||
            !Number.isFinite(q.n) ||
            !Number.isFinite(q.values?.[definition.topIndex]?.value) ||
            !Number.isFinite(q.values?.[definition.bottomIndex]?.value),
        )
      ) {
        stats.excluded.missing++;
        return;
      }
      if (
        !extrapolate &&
        samples.some(
          (q) =>
            q.values[definition.topIndex].extrapolated !== false ||
            q.values[definition.bottomIndex].extrapolated !== false,
        )
      ) {
        stats.excluded.extrapolated++;
        return;
      }
      let vertices = samples.map((q, i) => ({
        key: `v${indices[i]}`,
        e: q.e,
        n: q.n,
        top: q.values[definition.topIndex].value,
        bottom: q.values[definition.bottomIndex].value,
      }));
      if (vertices.some((q) => q.top - q.bottom <= THICKNESS_EPSILON)) {
        stats.excluded.crossed++;
        return;
      }
      const area = twiceArea(...vertices);
      if (Math.abs(area) <= AREA_EPSILON) {
        stats.excluded.degenerate++;
        return;
      }
      if (area < 0) vertices = [vertices[0], vertices[2], vertices[1]];
      if (clipNorth !== undefined) {
        const inside = vertices.filter((q) => q.n >= clipNorth).length;
        if (!inside) {
          stats.excluded.clipped++;
          return;
        }
        if (inside < 3) {
          vertices = clipTriangle(vertices, clipNorth, intersections);
          stats.clippedSourceTriangles++;
        }
      }
      let accepted = false;
      for (let i = 1; i + 1 < vertices.length; i++) {
        accepted =
          addTriangle([vertices[0], vertices[i], vertices[i + 1]]) || accepted;
      }
      if (accepted) stats.acceptedSourceTriangles++;
      else stats.excluded.clipped++;
    };
    for (let j = 0; j < grid.ny - 1; j++) {
      for (let i = 0; i < grid.nx - 1; i++) {
        const a = j * grid.nx + i,
          b = a + 1,
          d = a + grid.nx,
          c = d + 1;
        processTriangle([a, b, c]);
        processTriangle([a, c, d]);
      }
    }
    for (const { a, b, count } of edges.values()) {
      if (count !== 1) continue;
      // A CCW top boundary has its interior on the left; these faces point right.
      append("side", top(a), bottom(a), bottom(b));
      append("side", top(a), bottom(b), top(b));
      stats.sideTriangles += 2;
      stats.boundaryEdges++;
      if (clipNorth !== undefined && a.n === clipNorth && b.n === clipNorth)
        stats.cutEdges++;
    }
    return { ...definition, positions, surfaceKinds, stats };
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
      unknownRockBottomExcluded: true,
    },
  };
}
