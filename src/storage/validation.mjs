import { SITE } from "../data/site.mjs";
const stages = ["tender", "design", "construction", "maintenance"];
const statuses = [
  "draft",
  "pass",
  "exceeded",
  "pending",
  "stale",
  "action",
  "closed",
  "error",
];
const origins = [
  "synthetic",
  "measured",
  "imported_analysis",
  "calculated",
  "official_reference",
  "manual_record",
];
function finiteTree(value) {
  if (typeof value === "number" && !Number.isFinite(value)) return false;
  if (Array.isArray(value)) return value.every(finiteTree);
  if (value && typeof value === "object")
    return Object.values(value).every(finiteTree);
  return true;
}
function verify(record) {
  if (!record || typeof record !== "object")
    throw new Error("기록 형식이 올바르지 않습니다.");
  for (const key of [
    "id",
    "site_id",
    "zone_id",
    "source_id",
    "source_revision",
    "analysis_id",
    "method_version",
    "created_at",
    "updated_at",
    "title",
    "summary",
  ])
    if (typeof record[key] !== "string" || !record[key].trim())
      throw new Error(`${key}: 필수 정보가 없습니다.`);
  if (record.site_id !== SITE.id)
    throw new Error("다른 현장의 기록은 이천자이더리체에 가져올 수 없습니다.");
  if (
    !stages.includes(record.stage) ||
    !statuses.includes(record.status) ||
    !origins.includes(record.origin)
  )
    throw new Error("기록의 업무·상태·출처가 올바르지 않습니다.");
  if (!Number.isInteger(record.revision) || record.revision < 1)
    throw new Error("기록 개정이 올바르지 않습니다.");
  if (
    !Number.isFinite(Date.parse(record.created_at)) ||
    !Number.isFinite(Date.parse(record.updated_at))
  )
    throw new Error("기록 날짜가 올바르지 않습니다.");
  if (
    !Array.isArray(record.assumptions) ||
    !record.assumptions.every((x) => typeof x === "string")
  )
    throw new Error("가정 목록이 올바르지 않습니다.");
  if (
    !record.payload ||
    typeof record.payload !== "object" ||
    Array.isArray(record.payload) ||
    !finiteTree(record.payload)
  )
    throw new Error("기록에 유효하지 않은 수치나 내용이 있습니다.");
  if (
    record.dependencies !== undefined &&
    (!Array.isArray(record.dependencies) ||
      !record.dependencies.every(
        (d) =>
          d &&
          typeof d.analysis_id === "string" &&
          Number.isInteger(d.revision) &&
          d.revision > 0,
      ))
  )
    throw new Error("연결된 계산 개정이 올바르지 않습니다.");
  return record;
}
export function makeRecord(draft, existing) {
  const now = new Date().toISOString();
  const id = existing?.id || draft.id || crypto.randomUUID();
  const record = {
    site_id: SITE.id,
    zone_id: SITE.zone_id,
    source_id: "icheon-user-record",
    source_revision: "1",
    method_version: "autogeo-1",
    origin: "manual_record",
    assumptions: [],
    ...draft,
    id,
    analysis_id: existing?.analysis_id || draft.analysis_id || id,
    created_at: existing?.created_at || draft.created_at || now,
    updated_at: now,
    revision: (existing?.revision || 0) + 1,
  };
  return verify(record);
}
export function validateArchive(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.schema_version !== 1 ||
    value.site_id !== SITE.id ||
    !Array.isArray(value.records)
  )
    throw new Error("이천자이더리체 현장의 지원되는 내보내기 파일이 아닙니다.");
  if (value.records.length > 2000)
    throw new Error("한 번에 2,000개까지 가져올 수 있습니다.");
  const seen = new Set();
  for (const record of value.records) {
    verify(record);
    if (seen.has(record.id))
      throw new Error("같은 ID의 기록이 중복되어 있습니다.");
    seen.add(record.id);
  }
  if (value.revisions !== undefined) {
    if (!Array.isArray(value.revisions) || value.revisions.length > 10000)
      throw new Error("개정 이력 형식이나 개수가 올바르지 않습니다.");
    const history = new Map();
    for (const record of value.revisions) {
      verify(record);
      const key = `${record.id}@${record.revision}`;
      if (history.has(key)) throw new Error("개정 이력이 중복되어 있습니다.");
      history.set(key, record);
      if (!seen.has(record.id))
        throw new Error("현재 기록이 없는 개정 이력입니다.");
      if (
        record.revision > value.records.find((r) => r.id === record.id).revision
      )
        throw new Error("현재 기록보다 최신인 보관 개정이 있습니다.");
    }
    for (const record of value.records) {
      const historical = history.get(`${record.id}@${record.revision}`);
      if (historical && !sameRevision(historical, record))
        throw new Error("현재 기록과 같은 개정의 이력 내용이 다릅니다.");
    }
  }
  return structuredClone(value);
}

export function sameRevision(a, b) {
  return canonical(a) === canonical(b);
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
