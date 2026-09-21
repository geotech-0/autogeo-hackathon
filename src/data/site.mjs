/** Shared identity for the supplied Icheon site. Original coordinates stay in source datasets. */
export const SITE = Object.freeze({
  id: "icheon-xi-deriche",
  name: "이천자이더리체",
  zone_id: "IC-EXC",
  zone_name: "흙막이 · 굴착 공구",
  area: null,
  coordinate_frame: "icheon-local-m",
  origin: { easting: 239800, northing: 521450, elevation: 0 },
  source_id: "icheon-site-documents",
  source_revision: "2026-09-21",
  crs: "EPSG:5186",
  crs_note:
    "드론 원자료 좌표계. 조사차수별 시추좌표 호환 상태는 지반 자료에서 확인합니다.",
});
