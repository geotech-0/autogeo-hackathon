export function monitoringMetric(sensor, row) {
  return sensor.kind === "F" ? row.rate : row.delta;
}
export function evaluateSensor(sensor, rows = sensor.rows) {
  const values = rows
    .map((r) => monitoringMetric(sensor, r))
    .filter(Number.isFinite);
  const maximum = values.length ? Math.max(...values.map(Math.abs)) : null;
  const last = rows.at(-1);
  const latest = last ? monitoringMetric(sensor, last) : null;
  const ratio =
    latest === null || !sensor.criteria?.[0]
      ? null
      : Math.abs(latest) / sensor.criteria[0];
  const rateMaximum =
    sensor.kind === "W"
      ? Math.max(0, ...rows.map((r) => Math.abs(r.rate ?? 0)))
      : null;
  const candidateExceeded =
    (maximum !== null &&
      sensor.criteria?.[0] > 0 &&
      maximum > sensor.criteria[0]) ||
    (rateMaximum !== null && rateMaximum > 0.5);
  return {
    maximum,
    latest,
    ratio,
    rateMaximum,
    candidateExceeded,
    status:
      !sensor.criteriaConfirmed || !values.length
        ? "pending"
        : candidateExceeded
          ? "exceeded"
          : "pass",
  };
}
export function parseAdditionalReadings(csv) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const errors = [];
  const rows = [];
  const seen = new Set();
  let previousDate = "";
  if (lines.shift()?.trim() !== "date,value")
    return { rows, errors: ["첫 행은 date,value 이어야 합니다."] };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = lines[i].split(",");
    const [date, raw] = fields.map((x) => x.trim());
    const value = Number(raw);
    const d = new Date(`${date}T00:00:00Z`);
    if (
      fields.length !== 2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(d.getTime()) ||
      d.toISOString().slice(0, 10) !== date ||
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) ||
      !Number.isFinite(value)
    ) {
      errors.push(`${i + 2}행: 날짜 또는 수치를 확인해 주세요.`);
      continue;
    }
    if (seen.has(date)) {
      errors.push(`${i + 2}행: 중복 날짜 ${date}`);
      continue;
    }
    if (previousDate && date < previousDate) {
      errors.push(`${i + 2}행: 측정일이 이전 행보다 빠릅니다.`);
      continue;
    }
    previousDate = date;
    seen.add(date);
    rows.push({ date, value, rowNumber: i + 2 });
  }
  if (!rows.length && !errors.length) errors.push("측정값이 없습니다.");
  return { rows, errors };
}
export function stageEndpoints(rows) {
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === rows.length - 1 || rows[i + 1].stage !== rows[i].stage)
      result.push(rows[i]);
  }
  return result;
}
export function dcptEstimate(cmPerBlow) {
  const x = Number(cmPerBlow);
  if (!Number.isFinite(x) || x <= 0)
    throw new Error("관입량은 0보다 커야 합니다.");
  const n = 30 / x;
  const result = { ndcpt: n, nspt: 1.26 * n, qa: 12.5 * 1.26 * n };
  if (!Object.values(result).every(Number.isFinite))
    throw new Error("관입량으로 계산할 수 있는 유한한 범위를 확인해 주세요.");
  return result;
}
export function dcptReviewCalculation(cmPerBlow) {
  return {
    penetrationCmPerBlow: Number(cmPerBlow),
    results: dcptEstimate(cmPerBlow),
    method: "N_DCPT=30/x; N_SPT=1.26*N_DCPT; qa=12.5*N_SPT",
    resultUnits: { ndcpt: "회/30cm", nspt: "회/30cm", qa: "kPa" },
    applicability: "reference_only",
  };
}
export function monitoringProvenance(rows, period, reports) {
  const ids = [...new Set(rows.map((r) => r.source.report))].sort();
  const sources = ids.map((id) => ({
    ...reports.find((report) => report.id === id),
    id,
    referencedPages: [
      ...new Set(
        rows.filter((r) => r.source.report === id).map((r) => r.source.page),
      ),
    ].sort((a, b) => a - b),
  }));
  return {
    source_id: ids.join(" + ") || "monitoring-no-readings",
    source_revision:
      sources
        .map((source) => source.month)
        .filter(Boolean)
        .join(", ") || "no-readings",
    sourceReports: sources,
    measurementPeriod: {
      selected: period,
      from: rows[0]?.date || null,
      to: rows.at(-1)?.date || null,
    },
  };
}
export function nextIssue(
  issue,
  event,
  target = issue.lifecycle === "identified" ? "action" : "reinspection",
) {
  const allowed = {
    identified: ["action"],
    action: ["reinspection"],
    reinspection: ["action", "reinspection", "closed"],
    closed: ["action"],
  };
  if (!allowed[issue.lifecycle]?.includes(target))
    throw new Error("허용되지 않은 이력 단계입니다.");
  if (target === "closed" && event.resolved !== true)
    throw new Error("재점검 후 문제 해결을 확인해야 마감할 수 있습니다.");
  if (!event.note.trim() || !event.author.trim())
    throw new Error("담당자와 수행 내용을 입력해 주세요.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
    !Number.isFinite(Date.parse(`${event.date}T00:00:00Z`)) ||
    new Date(`${event.date}T00:00:00Z`).toISOString().slice(0, 10) !==
      event.date
  )
    throw new Error("올바른 날짜를 입력해 주세요.");
  if (event.date < issue.history.at(-1).date)
    throw new Error("최근 기록보다 빠른 날짜입니다.");
  return {
    ...issue,
    lifecycle: target,
    history: [
      ...issue.history,
      {
        date: event.date,
        author: event.author,
        note: event.note,
        stage: target,
        ...(target === "closed" ? { resolved: true } : {}),
      },
    ],
  };
}
