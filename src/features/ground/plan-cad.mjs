// CAD paths are already registered to the borehole EN frame, in metres:
// path x = E - originE, path y = -(N - originN). Do not apply CAD or drone
// registration a second time. Keep the original paths for SVG rendering.
const BOUNDARY_LAYERS = new Set(["지구계", "대지경계선"]);
const NUMBER = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?";
const POINT = new RegExp(`([ML])\\s*(${NUMBER})[ ,]+(${NUMBER})`, "g");

export function preparePlanLinework(data, frame) {
  if (
    data?.frameId !== frame?.id ||
    !Array.isArray(data?.originENH) ||
    ![0, 1].every(
      (i) =>
        Number.isFinite(data.originENH[i]) &&
        data.originENH[i] === frame.originENH[i],
    ) ||
    data.displayCoordinateConvention !==
      "path x=localE,y=-localN; original CAD transformed once" ||
    !Array.isArray(data.layers)
  )
    throw Error("도면 좌표 정보를 확인할 수 없습니다.");
  const layers = [],
    bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const layer of data.layers) {
    if (BOUNDARY_LAYERS.has(layer.name)) continue;
    if (typeof layer.name !== "string" || typeof layer.path !== "string")
      throw Error("도면 선형 정보를 확인할 수 없습니다.");
    const remainder = layer.path.replace(POINT, "").trim();
    if (remainder) throw Error("지원하지 않는 도면 선형입니다.");
    const matches = [...layer.path.matchAll(POINT)];
    if (!matches.length || matches[0][1] !== "M")
      throw Error("도면 선형 좌표가 없습니다.");
    for (const match of matches) {
      const e = data.originENH[0] + Number(match[2]);
      const n = data.originENH[1] - Number(match[3]);
      if (!Number.isFinite(e) || !Number.isFinite(n))
        throw Error("도면 선형에 올바르지 않은 좌표가 있습니다.");
      bounds[0] = Math.min(bounds[0], e);
      bounds[1] = Math.min(bounds[1], n);
      bounds[2] = Math.max(bounds[2], e);
      bounds[3] = Math.max(bounds[3], n);
    }
    layers.push({ name: layer.name, path: layer.path });
  }
  return {
    layers,
    bounds: layers.length ? bounds : null,
    originENH: [...data.originENH],
  };
}

export function planOverlayBounds(modelBounds, boundary, linework, options) {
  const bounds = [...modelBounds];
  const include = (e, n) => {
    if (!Number.isFinite(e) || !Number.isFinite(n)) return;
    bounds[0] = Math.min(bounds[0], e);
    bounds[1] = Math.min(bounds[1], n);
    bounds[2] = Math.max(bounds[2], e);
    bounds[3] = Math.max(bounds[3], n);
  };
  if (options.boundary) for (const p of boundary ?? []) include(p[0], p[1]);
  if (options.linework && linework?.bounds) {
    include(linework.bounds[0], linework.bounds[1]);
    include(linework.bounds[2], linework.bounds[3]);
  }
  // A small margin also protects the thick boundary stroke at the plot edge.
  if (options.boundary || options.linework) {
    const margin =
      Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) * 0.02;
    return [
      bounds[0] - margin,
      bounds[1] - margin,
      bounds[2] + margin,
      bounds[3] + margin,
    ];
  }
  return bounds;
}

export function planProjection(bounds, plot) {
  const [e0, n0, e1, n1] = bounds;
  const scale = Math.min(plot.width / (e1 - e0), plot.height / (n1 - n0));
  return {
    scale,
    x: (e) =>
      plot.left + (plot.width - (e1 - e0) * scale) / 2 + (e - e0) * scale,
    y: (n) =>
      plot.top + (plot.height + (n1 - n0) * scale) / 2 - (n - n0) * scale,
  };
}
