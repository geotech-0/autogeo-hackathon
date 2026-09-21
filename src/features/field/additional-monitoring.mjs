import { parseAdditionalReadings } from "./real-engine.mjs";

export const ADDITIONAL_MONITORING_METHOD =
  "user-confirmed-direct-threshold-v1";
export const ADDITIONAL_DIRECTIONS = Object.freeze({
  above: "상한 초과 (값 > 기준)",
  below: "하한 미달 (값 < 기준)",
  absolute: "절댓값 초과 (|값| > 기준)",
});

export function emptyAdditionalCriterion() {
  return {
    unit: "",
    direction: "",
    limit: "",
    evidence: "",
    confirmedBy: "",
    confirmed: false,
  };
}

/** User-owned settings only: this function never receives a report sensor or its criteria. */
export function normalizeAdditionalCriterion(input = {}) {
  const text = (key) =>
    typeof input?.[key] === "string" ? input[key].trim() : "";
  return {
    unit: text("unit"),
    direction: text("direction"),
    limit: text("limit"),
    evidence: text("evidence"),
    confirmedBy: text("confirmedBy"),
    confirmed: input?.confirmed === true,
  };
}

/** date,value is compared directly in the explicitly confirmed unit, without conversion. */
export function evaluateAdditionalMonitoring(rawCsv, input = {}) {
  const parsed = parseAdditionalReadings(
    typeof rawCsv === "string" ? rawCsv : "",
  );
  const errors = [...parsed.errors];
  const criterion = normalizeAdditionalCriterion(input);
  const limit = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(
    criterion.limit,
  )
    ? Number(criterion.limit)
    : NaN;
  if (criterion.confirmed) {
    if (!criterion.unit || criterion.unit.length > 40)
      errors.push("비교할 측정 단위를 입력해 주세요.");
    if (!Object.hasOwn(ADDITIONAL_DIRECTIONS, criterion.direction))
      errors.push("상한·하한·절댓값 중 평가 방향을 선택해 주세요.");
    if (!Number.isFinite(limit)) errors.push("유한한 기준값을 입력해 주세요.");
    if (criterion.direction === "absolute" && limit < 0)
      errors.push("절댓값 기준은 0 이상이어야 합니다.");
    if (!criterion.evidence)
      errors.push("사용자 기준의 이름과 근거를 입력해 주세요.");
    if (!criterion.confirmedBy)
      errors.push("기준을 확인한 담당자를 입력해 주세요.");
  }
  const canEvaluate = criterion.confirmed && errors.length === 0;
  const rows = parsed.rows.map((row) => {
    const comparedValue = canEvaluate
      ? criterion.direction === "absolute"
        ? Math.abs(row.value)
        : row.value
      : null;
    const exceeded =
      canEvaluate &&
      (criterion.direction === "below"
        ? comparedValue < limit
        : comparedValue > limit);
    return {
      ...row,
      comparedValue,
      exceeded,
      status: canEvaluate ? (exceeded ? "exceeded" : "pass") : "pending",
    };
  });
  const exceededCount = rows.filter((row) => row.exceeded).length;
  const extreme =
    canEvaluate && rows.length
      ? rows.reduce(
          (best, row) =>
            (criterion.direction === "below" ? Math.min : Math.max)(
              best,
              row.comparedValue,
            ),
          rows[0].comparedValue,
        )
      : null;
  return {
    method: ADDITIONAL_MONITORING_METHOD,
    criterion,
    limit: canEvaluate ? limit : null,
    rows,
    errors,
    exceededCount,
    extreme,
    status: errors.length
      ? "error"
      : !canEvaluate
        ? "pending"
        : exceededCount
          ? "exceeded"
          : "pass",
  };
}

/** Old pending imports never inherit report units/limits or become confirmed on reopen. */
export function restoreAdditionalImport(payload = {}) {
  return {
    importCsv:
      typeof payload.rawCsv === "string" ? payload.rawCsv : "date,value\n",
    importSource: typeof payload.source === "string" ? payload.source : "",
    importLocation:
      typeof payload.location === "string" ? payload.location : "",
    importCriterion:
      payload.method === ADDITIONAL_MONITORING_METHOD
        ? normalizeAdditionalCriterion(payload.userCriterion)
        : emptyAdditionalCriterion(),
    manualDate: "",
    manualValue: "",
  };
}

export function additionalReviewPayload({
  sensorId,
  source,
  rawCsv,
  criterion,
  location = "",
}) {
  if (!source?.trim()) throw new Error("원본·측정 기록 이름을 입력해 주세요.");
  const evaluation = evaluateAdditionalMonitoring(rawCsv, criterion);
  if (evaluation.errors.length) throw new Error(evaluation.errors.join(" "));
  return {
    kind: "monitoring_import",
    method: ADDITIONAL_MONITORING_METHOD,
    sensorId,
    source: source.trim(),
    unit: evaluation.criterion.unit || null,
    location: location.trim() || null,
    coordinate: null,
    rows: evaluation.rows,
    rawCsv,
    userCriterion: evaluation.criterion,
    criteriaConfirmed: evaluation.criterion.confirmed,
    evaluation,
  };
}

/** Snapshot the selected review revision; retain prior issue actions when rechecking. */
export function additionalIssuePayload(review, previous, date) {
  const payload = review.payload;
  const evaluation = evaluateAdditionalMonitoring(
    payload.rawCsv,
    payload.userCriterion,
  );
  if (
    payload.method !== ADDITIONAL_MONITORING_METHOD ||
    evaluation.status !== "exceeded"
  )
    throw new Error(
      "사용자 기준을 확인한 초과 기록만 이슈로 등록할 수 있습니다.",
    );
  if (previous && previous.monitoringReviewId !== review.id)
    throw new Error("다른 추가 계측 검토의 이슈에는 연결할 수 없습니다.");
  const history = previous?.history ?? [];
  if (history.length && date < history.at(-1).date)
    throw new Error("이슈의 최근 조치일보다 빠른 날짜로 연결할 수 없습니다.");
  const lifecycle =
    previous?.lifecycle === "closed"
      ? "action"
      : previous?.lifecycle || "identified";
  return {
    ...previous,
    kind: "real_field_issue",
    issueType: "additional_monitoring_exceedance",
    monitoringReviewId: review.id,
    monitoringReviewRevision: review.revision,
    sensorId: payload.sensorId,
    source: payload.source,
    location: payload.location,
    coordinate: null,
    rawCsv: payload.rawCsv,
    rows: evaluation.rows,
    userCriterion: evaluation.criterion,
    evaluation,
    lifecycle,
    history: [
      ...history,
      {
        stage: lifecycle,
        date,
        author: evaluation.criterion.confirmedBy,
        note: `추가 계측 검토 r${review.revision}: ${evaluation.exceededCount}행 기준 초과 · ${payload.source} · ${evaluation.criterion.evidence}`,
      },
    ],
  };
}
