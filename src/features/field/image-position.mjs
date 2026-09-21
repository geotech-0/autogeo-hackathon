/** Coordinates are original EPSG:5186 EN metres, never display-transform coordinates. */
export function annotationPosition(easting, northing, bounds) {
  if (!String(easting ?? "").trim() || !String(northing ?? "").trim())
    throw new Error(
      "지도에서 위치를 선택하거나 E·N 좌표를 함께 입력해 주세요.",
    );
  const e = Number(easting),
    n = Number(northing);
  if (!Number.isFinite(e) || !Number.isFinite(n))
    throw new Error("E·N 좌표는 유한한 숫자로 입력해 주세요.");
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    bounds[0] >= bounds[2] ||
    bounds[1] >= bounds[3]
  )
    throw new Error(
      "영상 좌표 범위를 확인하지 못했습니다. 영상을 다시 불러온 후 저장해 주세요.",
    );
  if (e < bounds[0] || e > bounds[2] || n < bounds[1] || n > bounds[3])
    throw new Error(
      "입력한 위치가 제공 정사영상 범위를 벗어납니다. 원본 E·N 좌표를 확인해 주세요.",
    );
  return { easting: e, northing: n };
}
