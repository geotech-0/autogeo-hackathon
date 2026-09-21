import { siteDate } from "../../utils/site-date.mjs";
import { evaluatePlate, PLATE_FIXTURES } from "./engine.mjs";

export const EMPTY_PLATE_INPUT = {
  recordId: "",
  title: "",
  sourceName: "",
  csv: "",
  mode: "load",
  diameterMm: "",
  limitMm: "",
  criterion: "",
  confirmed: false,
  example: "",
  author: "",
  note: "",
};

export function plateExample(name) {
  const key = name === "pending" ? "normal" : name;
  if (!(key in PLATE_FIXTURES))
    throw new Error("지원하지 않는 검증 예제입니다.");
  const label = {
    normal: "기준 이내",
    exceeded: "기준 초과",
    pending: "기준 미설정",
    invalid: "입력 오류",
  }[name];
  return {
    ...EMPTY_PLATE_INPUT,
    title: "검증용 평판재하",
    sourceName: `합성 검증 예제 · ${label}`,
    csv: PLATE_FIXTURES[key],
    diameterMm: "300",
    confirmed: true,
    example: name,
    limitMm: name === "pending" ? "" : "10",
    criterion: name === "pending" ? "" : "합성 검증용 최대 침하 기준",
  };
}

export function evaluatePlateInput(input) {
  const result = evaluatePlate(input.csv, input);
  const errors = [...result.errors];
  if (!["load", "pressure"].includes(input.mode))
    errors.push("CSV 하중·압력 종류를 선택해 주세요.");
  if (!Number.isFinite(result.area) || result.area <= 0)
    errors.push("계산 가능한 재하판 직경을 입력해 주세요.");
  const rows = result.rows.map((r) => {
    if ([r.load, r.pressure].some((v) => v !== null && !Number.isFinite(v))) {
      const message = "환산 하중·압력이 유한한 범위를 벗어납니다.";
      errors.push(`${r.rowNumber}행: ${message}`);
      return { ...r, problems: [...r.problems, message] };
    }
    return r;
  });
  if (result.totalCount > 5000)
    errors.push("한 번에 5,000행 이하의 시험자료를 검토해 주세요.");
  return {
    ...result,
    rows,
    validCount: rows.filter(
      (r) =>
        !r.problems.length &&
        Number.isFinite(r.pressure) &&
        Number.isFinite(r.settlement),
    ).length,
    errors,
    status: errors.length
      ? "error"
      : !input.confirmed
        ? "pending"
        : result.status,
  };
}

export function restorePlateInput(record) {
  const input = record?.payload?.plateInput;
  if (
    !input ||
    Object.keys(EMPTY_PLATE_INPUT).some(
      (key) =>
        key !== "recordId" &&
        key !== "confirmed" &&
        typeof input[key] !== "string",
    ) ||
    typeof input.confirmed !== "boolean" ||
    !["load", "pressure"].includes(input.mode) ||
    !["", "normal", "exceeded", "pending", "invalid"].includes(input.example)
  )
    throw new Error("저장한 평판 CSV 입력을 확인할 수 없습니다.");
  return { ...EMPTY_PLATE_INPUT, ...input, recordId: record.id };
}

export function plateInputRecord(input, issue = false, date = siteDate()) {
  const result = evaluatePlateInput(input);
  if (result.errors.length) throw new Error(result.errors[0]);
  if (!input.title.trim() || !input.sourceName.trim())
    throw new Error("시험 이름과 원본·출처 이름을 입력해 주세요.");
  if (issue && (!input.author.trim() || !input.note.trim()))
    throw new Error("담당자와 이슈 내용을 입력해 주세요.");
  const synthetic = Boolean(input.example);
  const { recordId, ...plateInput } = input;
  return {
    ...(recordId && !issue ? { id: recordId } : {}),
    stage: "construction",
    title: `${input.title} · ${issue ? "확인 이슈" : "CSV 검토"}`,
    summary: issue
      ? input.note
      : `${result.totalCount}행 · 최대 침하 ${result.maxSettlement} mm · ${input.sourceName}`,
    status: issue ? "pending" : result.status,
    origin: synthetic ? "synthetic" : "manual_record",
    source_id: synthetic
      ? "synthetic-plate-validation"
      : `user-plate:${input.sourceName}`,
    source_revision: "user-input-v1",
    method_version: result.method,
    assumptions: [
      synthetic
        ? "소프트웨어 검증용 합성 예제이며 이천 현장 실측이 아닙니다."
        : "사용자가 제공한 CSV입니다. 제공 월간보고서·품질 참고자료와 별도로 보존합니다.",
      "원형 재하판 면적 A=π(D/1000)²/4로 하중·압력을 환산합니다.",
      "최대 침하와 입력 관리기준의 비교이며 항복·극한·허용지지력 판정이 아닙니다.",
      ...(!input.confirmed ? ["출처·단위·재하판 제원 확인 전 판정 보류"] : []),
      ...(!result.limit || !input.criterion.trim()
        ? ["관리기준 수치 또는 근거 미설정으로 판정 보류"]
        : []),
    ],
    payload: {
      kind: issue ? "real_field_issue" : "quality_reference_review",
      datasetId: "user-plate",
      provenance: synthetic
        ? "synthetic_validation_example"
        : "user_supplied_csv",
      siteApplicability: "user_review_required",
      plateInput,
      result,
      units: {
        load: "kN",
        pressure: "kPa",
        settlement: "mm",
        time: "min",
        diameter: "mm",
        area: "m²",
      },
      ...(issue
        ? {
            lifecycle: "identified",
            history: [
              {
                stage: "identified",
                date,
                author: input.author,
                note: input.note,
              },
            ],
          }
        : {}),
    },
  };
}
