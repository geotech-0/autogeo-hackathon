export const LIFECYCLE = ["survey", "confirmation", "action", "reinspection"];
export const STAGE_NAMES = {
  survey: "조사",
  confirmation: "확인",
  action: "조치",
  reinspection: "재점검",
};
export const SAMPLE_GPR = {
  title: "동측 관리도로 이상 반사 구역",
  line: "GPR-L01",
  asset: "준공 후 동측 관리도로 P-01",
  surveyDate: "2027-03-02",
  interpreter: "합성 시나리오 · 해석자 예시",
  x: "110",
  y: "42",
  width: "6",
  length: "12",
  depth: "1.2~1.8 m (합성 해석값)",
  equipment: "합성 조사장비 · 중심주파수 400 MHz 예시",
  evidence: "A현장 합성 해석도 v1 · 측선 36~48 m",
  findings:
    "주변과 다른 반사 패턴이 표시된 구간입니다. 실제 공동이나 손상이 확정된 자료가 아닙니다.",
  followUp:
    "측선 재측정과 현장 조건을 확인하고, 필요 시 확인조사의 범위를 검토합니다.",
  origin: "synthetic",
  lifecycle: "survey",
  closed: false,
  archived: false,
  attachment: null,
  history: [
    {
      id: "synthetic-gpr-survey-v1",
      stage: "survey",
      date: "2027-03-02",
      note: "합성 해석결과를 등록했습니다. 이상 반사 후보의 위치와 추가 확인 사항을 검토합니다.",
      author: "합성 조사 담당",
    },
  ],
};

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function validateGpr(input) {
  /** @type {Record<string, string>} */
  const errors = {};
  for (const key of [
    "title",
    "line",
    "asset",
    "interpreter",
    "evidence",
    "findings",
    "followUp",
  ])
    if (!String(input[key] || "").trim()) errors[key] = "내용을 입력해 주세요.";
  if (input.asset !== SAMPLE_GPR.asset)
    errors.asset = "이 시연의 조사 대상은 준공 후 동측 관리도로 P-01입니다.";
  if (!validDate(input.surveyDate))
    errors.surveyDate = "올바른 조사일을 지정해 주세요.";
  if (!["synthetic", "measured"].includes(input.origin))
    errors.origin = "합성 또는 실측 출처를 선택해 주세요.";
  for (const [key, max] of [
    ["x", 120],
    ["y", 100],
  ]) {
    const n = Number(input[key]);
    if (input[key] === "" || !Number.isFinite(n) || n < 0 || n > max)
      errors[key] = `0~${max} m 범위로 입력해 주세요.`;
  }
  for (const key of ["width", "length"]) {
    const n = Number(input[key]);
    if (input[key] === "" || !Number.isFinite(n) || n <= 0)
      errors[key] = "0보다 큰 범위를 입력해 주세요.";
  }
  if (
    !errors.x &&
    !errors.width &&
    (Number(input.x) - Number(input.width) / 2 < 0 ||
      Number(input.x) + Number(input.width) / 2 > 120)
  )
    errors.width = "이상구역이 현장 E 범위를 벗어납니다.";
  if (
    !errors.y &&
    !errors.length &&
    (Number(input.y) - Number(input.length) / 2 < 0 ||
      Number(input.y) + Number(input.length) / 2 > 100)
  )
    errors.length = "이상구역이 현장 N 범위를 벗어납니다.";
  if (!LIFECYCLE.includes(input.lifecycle))
    errors.lifecycle = "이력 단계가 올바르지 않습니다.";
  if (
    Array.isArray(input.history) &&
    input.history.some((h) => h.date < input.surveyDate)
  )
    errors.surveyDate =
      "조사일이 기존 후속 기록일보다 늦습니다. 기존 조사일과 이력을 확인해 주세요.";
  if (input.closed && input.lifecycle !== "reinspection")
    errors.closed = "재점검 기록을 남긴 뒤 마감할 수 있습니다.";
  return errors;
}

/** Sequential lifecycle updates preserve previous observations. */
export function transitionGpr(input, event) {
  const index = LIFECYCLE.indexOf(input.lifecycle);
  const next = LIFECYCLE[index + 1];
  if (!next)
    throw new Error(
      "재점검까지 기록했습니다. 추가 메모나 마감을 선택해 주세요.",
    );
  if (!event.note?.trim()) throw new Error("수행 내용과 근거를 입력해 주세요.");
  if (!event.author?.trim()) throw new Error("기록 담당자를 입력해 주세요.");
  if (!validDate(event.date)) throw new Error("올바른 수행일을 지정해 주세요.");
  const latest =
    input.history?.reduce(
      (date, item) => (item.date > date ? item.date : date),
      input.surveyDate,
    ) || input.surveyDate;
  if (event.date < latest)
    throw new Error(`수행일은 최근 기록일(${latest})보다 빠를 수 없습니다.`);
  if (Object.keys(validateGpr(input)).length)
    throw new Error("조사 정보의 필수 입력을 먼저 확인해 주세요.");
  return {
    ...input,
    lifecycle: next,
    closed: false,
    history: [
      ...(input.history || []),
      {
        id: event.id,
        stage: next,
        date: event.date,
        note: event.note.trim(),
        author: event.author.trim(),
      },
    ],
  };
}

export function gprStatus(input) {
  return input.closed
    ? "closed"
    : input.lifecycle === "survey" || input.lifecycle === "confirmation"
      ? "pending"
      : "action";
}
