export const REAL_STAGES = ["survey", "confirmation", "action", "reinspection"];
export const REAL_STAGE_LABELS = {
  survey: "조사 등록",
  confirmation: "현장 확인",
  action: "조치",
  reinspection: "재점검",
};
export const EMPTY_GPR = {
  title: "",
  asset: "",
  line: "",
  surveyDate: "",
  interpreter: "",
  location: "",
  easting: "",
  northing: "",
  depth: "",
  equipment: "",
  findings: "",
  followUp: "",
  lifecycle: "survey",
  closed: false,
  archived: false,
  attachments: [],
  history: [],
};
export function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function validateRealGpr(model) {
  const errors = [];
  for (const [key, label] of Object.entries({
    title: "제목",
    asset: "유지관리 대상",
    line: "측선 번호",
    interpreter: "해석 담당자",
    location: "위치 설명",
    findings: "해석 결과",
    followUp: "후속 확인 계획",
  })) {
    if (!String(model[key] || "").trim())
      errors.push(`${label} 항목을 입력해 주세요.`);
  }
  if (!isDate(model.surveyDate)) errors.push("올바른 조사일을 입력해 주세요.");
  if (!model.attachments?.length)
    errors.push("원본 또는 해석결과 파일을 첨부해 주세요.");
  if (Boolean(model.easting) !== Boolean(model.northing))
    errors.push("E·N 좌표를 함께 입력하거나 모두 비워 주세요.");
  if (
    model.easting &&
    (!Number.isFinite(Number(model.easting)) ||
      !Number.isFinite(Number(model.northing)) ||
      Number(model.easting) < 239634.8045 ||
      Number(model.easting) > 240172.7484 ||
      Number(model.northing) < 521316.7917 ||
      Number(model.northing) > 521848.7157)
  )
    errors.push("측선 위치가 제공 정사영상 범위를 벗어납니다.");
  if (!REAL_STAGES.includes(model.lifecycle))
    errors.push("이력 단계가 올바르지 않습니다.");
  if (model.closed && model.lifecycle !== "reinspection")
    errors.push("재점검 이전에는 마감할 수 없습니다.");
  if (model.history?.some((h) => h.date < model.surveyDate))
    errors.push("조사일이 기존 후속 기록일보다 늦습니다.");
  return errors;
}
export function advanceRealGpr(model, event) {
  const next = REAL_STAGES[REAL_STAGES.indexOf(model.lifecycle) + 1];
  if (!next) throw new Error("재점검까지 완료한 기록입니다.");
  const errors = validateRealGpr(model);
  if (errors.length) throw new Error(errors[0]);
  if (!event.author.trim() || !event.note.trim())
    throw new Error("수행 담당자와 결과를 입력해 주세요.");
  if (!isDate(event.date)) throw new Error("올바른 수행일을 입력해 주세요.");
  const latest = model.history.reduce(
    (d, h) => (h.date > d ? h.date : d),
    model.surveyDate,
  );
  if (event.date < latest)
    throw new Error("수행일은 이전 기록보다 빠를 수 없습니다.");
  return {
    ...model,
    lifecycle: next,
    closed: false,
    history: [...model.history, { ...event, stage: next }],
  };
}
