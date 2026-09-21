export const SITE_MODEL_PADDING_M = 10;

// Keep the supplied E/N coordinates unchanged. The rectangle is a display and
// model domain, not a surveyed property polygon or a coordinate registration.
export function siteModelDomain(
  holes,
  boundaryEN,
  padding = SITE_MODEL_PADDING_M,
) {
  if (!Number.isFinite(padding) || padding < 0 || padding > 100)
    throw Error("현장 모델 여유폭은 0~100m의 유한한 숫자여야 합니다.");
  if (!Array.isArray(boundaryEN) || boundaryEN.length < 3)
    throw Error("현장 모델 영역에는 CAD 대지경계 좌표 3개 이상이 필요합니다.");
  if (
    !Array.from(boundaryEN).every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
  )
    throw Error("CAD 대지경계의 E/N 좌표는 유한한 숫자 쌍이어야 합니다.");

  // Translate before the area check to avoid subtracting large absolute E/N
  // products. A repeated closing vertex and either winding are accepted.
  const [originE, originN] = boundaryEN[0];
  let twiceArea = 0;
  for (let i = 0; i < boundaryEN.length; i++) {
    const a = boundaryEN[i];
    const b = boundaryEN[(i + 1) % boundaryEN.length];
    twiceArea +=
      (a[0] - originE) * (b[1] - originN) - (b[0] - originE) * (a[1] - originN);
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) === 0)
    throw Error(
      "CAD 대지경계가 면적을 이루지 않습니다. 원본 경계를 확인하세요.",
    );
  if (
    !Array.isArray(holes) ||
    !Array.from(holes).every(
      (hole) =>
        hole && Number.isFinite(hole.easting) && Number.isFinite(hole.northing),
    )
  )
    throw Error("시추공의 E/N 좌표는 유한한 숫자여야 합니다.");

  let minE = Infinity,
    minN = Infinity,
    maxE = -Infinity,
    maxN = -Infinity;
  for (const [easting, northing] of [
    ...boundaryEN,
    ...holes.map((hole) => [hole.easting, hole.northing]),
  ]) {
    minE = Math.min(minE, easting);
    minN = Math.min(minN, northing);
    maxE = Math.max(maxE, easting);
    maxN = Math.max(maxN, northing);
  }
  const bounds = [
    minE - padding,
    minN - padding,
    maxE + padding,
    maxN + padding,
  ];
  if (
    !bounds.every(Number.isFinite) ||
    !Number.isFinite(bounds[2] - bounds[0]) ||
    !Number.isFinite(bounds[3] - bounds[1]) ||
    bounds[2] <= bounds[0] ||
    bounds[3] <= bounds[1]
  )
    throw Error("현장 모델 영역의 좌표 범위를 확인하세요.");
  return { kind: "site-rectangle", bounds, padding, source: "cad-boundary" };
}
