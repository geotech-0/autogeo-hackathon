/** Parse CSV records without silently discarding malformed or empty cells. */
export function parseCSV(text) {
  const source = String(text)
    .replace(/^\uFEFF/, "")
    .trim();
  if (!source)
    return { headers: [], rows: [], errors: ["CSV에 데이터가 없습니다."] };
  const matrix = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) matrix.push(row);
  const headers = matrix.shift() || [];
  const errors = [];
  if (quoted)
    errors.push("닫히지 않은 따옴표가 있습니다. CSV 내용을 확인해 주세요.");
  if (new Set(headers).size !== headers.length)
    errors.push("CSV 열 이름이 중복되어 있습니다.");
  if (headers.some((h) => !h)) errors.push("이름이 없는 CSV 열이 있습니다.");
  const rows = matrix.map((values, i) => {
    if (values.length !== headers.length)
      errors.push(`${i + 2}행: 열 수가 머리글과 다릅니다.`);
    return {
      rowNumber: i + 2,
      values: Object.fromEntries(headers.map((h, j) => [h, values[j] ?? ""])),
    };
  });
  if (!rows.length) errors.push("머리글 아래에 측정값을 입력해 주세요.");
  return { headers, rows, errors };
}

function finite(value) {
  return value === "" ||
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
    ? null
    : Number(value);
}
const phases = ["재하", "유지", "제하"];

export function parseMonitoringTime(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      String(value),
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== `${year}-${month}-${day}` ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}

export function manualMonitoringTime(value) {
  const result = `${value.length === 16 ? `${value}:00` : value}+09:00`;
  return parseMonitoringTime(result) === null ? null : result;
}

/** Settlement limit is an explicit project screening limit, not a bearing-capacity calculation. */
export function evaluatePlate(csv, config) {
  const parsed = parseCSV(csv);
  const errors = [...parsed.errors];
  const mode = config.mode === "pressure" ? "pressure" : "load";
  const required = [
    "time_min",
    "stage",
    "settlement_mm",
    mode === "load" ? "load_kN" : "pressure_kPa",
  ];
  required.forEach((h) => {
    if (!parsed.headers.includes(h)) errors.push(`필수 열 ${h}이 없습니다.`);
  });
  const diameter = finite(config.diameterMm);
  const limit = finite(config.limitMm);
  if (diameter === null || diameter <= 0)
    errors.push("재하판 직경은 0보다 큰 mm 값이어야 합니다.");
  if (limit !== null && limit <= 0)
    errors.push(
      "최대 침하 관리기준은 0보다 커야 합니다. 비워 두면 판정을 보류합니다.",
    );
  if (
    config.limitMm !== "" &&
    config.limitMm !== null &&
    config.limitMm !== undefined &&
    limit === null
  )
    errors.push("최대 침하 관리기준을 숫자로 입력해 주세요.");
  const area =
    diameter !== null && diameter > 0
      ? (Math.PI * (diameter / 1000) ** 2) / 4
      : null;
  const seen = new Set();
  let previousTime = -Infinity;
  const rows = parsed.rows.map((raw) => {
    const problems = [];
    const time = finite(raw.values.time_min);
    const settlement = finite(raw.values.settlement_mm);
    const inputValue = finite(
      raw.values[mode === "load" ? "load_kN" : "pressure_kPa"],
    );
    const stage = raw.values.stage || "";
    if (time === null || time < 0) problems.push("시간 누락 또는 음수");
    if (settlement === null) problems.push("침하값 누락 또는 숫자 오류");
    else if (settlement < 0) problems.push("음의 침하값: 계기 영점·부호 확인");
    if (inputValue === null || inputValue < 0)
      problems.push(`${mode === "load" ? "하중" : "압력"} 누락 또는 음수`);
    if (!phases.includes(stage)) problems.push("단계는 재하·유지·제하 중 하나");
    if (time !== null) {
      if (time < previousTime) problems.push("시간 순서 역전");
      if (seen.has(time)) problems.push("중복 측정시간");
      seen.add(time);
      previousTime = time;
    }
    const pressure =
      inputValue === null || !area
        ? null
        : mode === "load"
          ? inputValue / area
          : inputValue;
    const load =
      inputValue === null || !area
        ? null
        : mode === "load"
          ? inputValue
          : inputValue * area;
    return {
      rowNumber: raw.rowNumber,
      time,
      stage,
      load,
      pressure,
      settlement,
      problems,
      raw: raw.values,
    };
  });
  rows.forEach((r) =>
    r.problems.forEach((p) => errors.push(`${r.rowNumber}행: ${p}`)),
  );
  const valid = rows.filter(
    (r) => !r.problems.length && r.pressure !== null && r.settlement !== null,
  );
  const maxSettlement = valid.length
    ? Math.max(...valid.map((r) => r.settlement))
    : null;
  const maxPressure = valid.length
    ? Math.max(...valid.map((r) => r.pressure))
    : null;
  const exceeded =
    limit !== null && maxSettlement !== null && maxSettlement > limit;
  const status = errors.length
    ? "error"
    : limit === null || !config.criterion?.trim()
      ? "pending"
      : exceeded
        ? "exceeded"
        : "pass";
  return {
    rows,
    errors,
    area,
    maxSettlement,
    maxPressure,
    limit,
    status,
    validCount: valid.length,
    totalCount: rows.length,
    method: "project-max-settlement-screen-v1",
    criterion: config.criterion || "",
    mode,
  };
}

export function evaluateMonitoring(csv, config) {
  const parsed = parseCSV(csv);
  const errors = [...parsed.errors];
  ["time", "sensor", "value_mm"].forEach((h) => {
    if (!parsed.headers.includes(h)) errors.push(`필수 열 ${h}이 없습니다.`);
  });
  const baseline = finite(config.baselineMm);
  const warning = finite(config.warningMm);
  const action = finite(config.actionMm);
  if (baseline === null) errors.push("기준값을 mm 단위로 입력해 주세요.");
  if (
    config.warningMm !== "" &&
    config.warningMm !== null &&
    config.warningMm !== undefined &&
    warning === null
  )
    errors.push("주의 기준을 숫자로 입력해 주세요.");
  if (
    config.actionMm !== "" &&
    config.actionMm !== null &&
    config.actionMm !== undefined &&
    action === null
  )
    errors.push("조치 기준을 숫자로 입력해 주세요.");
  if (warning !== null && warning <= 0)
    errors.push("주의 기준은 0보다 커야 합니다.");
  if (action !== null && action <= 0)
    errors.push("조치 기준은 0보다 커야 합니다.");
  if (warning !== null && action !== null && warning >= action)
    errors.push("조치 기준은 주의 기준보다 커야 합니다.");
  const seen = new Set();
  const latest = new Map();
  const rows = parsed.rows.map((raw) => {
    const problems = [];
    const sensor = raw.values.sensor?.trim() || "";
    const time = raw.values.time || "";
    const parsedTime = parseMonitoringTime(time);
    const stamp = parsedTime === null ? NaN : parsedTime;
    const value = finite(raw.values.value_mm);
    if (!Number.isFinite(stamp))
      problems.push("시간에 날짜·시각·시간대(+09:00)를 지정");
    if (!sensor) problems.push("센서 ID 누락");
    if (value === null) problems.push("계측값 누락 또는 숫자 오류");
    const key = `${sensor}|${stamp}`;
    if (Number.isFinite(stamp)) {
      if (seen.has(key)) problems.push("동일 센서·시각 중복");
      if (latest.has(sensor) && stamp < latest.get(sensor))
        problems.push("센서별 시간 순서 역전");
      seen.add(key);
      latest.set(sensor, stamp);
    }
    const displacement =
      value === null || baseline === null ? null : value - baseline;
    const magnitude = displacement === null ? null : Math.abs(displacement);
    const level = problems.length
      ? "error"
      : magnitude === null || warning === null || action === null
        ? "pending"
        : magnitude > action
          ? "exceeded"
          : magnitude > warning
            ? "warning"
            : "pass";
    return {
      rowNumber: raw.rowNumber,
      time,
      stamp: Number.isFinite(stamp) ? stamp : null,
      sensor,
      value,
      displacement,
      magnitude,
      level,
      problems,
      raw: raw.values,
    };
  });
  rows.forEach((r) =>
    r.problems.forEach((p) => errors.push(`${r.rowNumber}행: ${p}`)),
  );
  const valid = rows.filter((r) => !r.problems.length && r.magnitude !== null);
  const maxMagnitude = valid.length
    ? Math.max(...valid.map((r) => r.magnitude))
    : null;
  const exceeded = valid.filter((r) => r.level === "exceeded");
  const warned = valid.filter((r) => r.level === "warning");
  const status = errors.length
    ? "error"
    : warning === null || action === null
      ? "pending"
      : exceeded.length
        ? "exceeded"
        : warned.length
          ? "action"
          : "pass";
  return {
    rows,
    errors,
    baseline,
    warning,
    action,
    maxMagnitude,
    exceededCount: exceeded.length,
    warningCount: warned.length,
    status,
    totalCount: rows.length,
    validCount: valid.length,
    method: "absolute-delta-project-threshold-v1",
  };
}

export const PLATE_FIXTURES = {
  normal:
    "time_min,stage,load_kN,settlement_mm\n0,재하,0,0\n5,재하,7.0686,0.8\n10,재하,14.1372,1.9\n15,재하,21.2058,3.4\n20,재하,28.2743,5.2\n25,유지,28.2743,5.6\n30,제하,14.1372,3.1\n35,제하,0,1.2",
  exceeded:
    "time_min,stage,load_kN,settlement_mm\n0,재하,0,0\n5,재하,7.0686,1.2\n10,재하,14.1372,3.8\n15,재하,21.2058,7.3\n20,재하,28.2743,11.2\n25,유지,28.2743,12.4\n30,제하,14.1372,8.3\n35,제하,0,4.8",
  invalid:
    "time_min,stage,load_kN,settlement_mm\n0,재하,0,0\n5,재하,7.0686,0.8\n5,재하,14.1372,\n3,재하,21.2058,3.4\n20,단계미상,-5,5.2",
};
export const MONITORING_FIXTURES = {
  normal:
    "time,sensor,value_mm\n2026-09-14T09:00:00+09:00,IN-01,0\n2026-09-15T09:00:00+09:00,IN-01,2.1\n2026-09-16T09:00:00+09:00,IN-01,4.3\n2026-09-17T09:00:00+09:00,IN-01,6.8\n2026-09-18T09:00:00+09:00,IN-01,8.5\n2026-09-19T09:00:00+09:00,IN-01,9.2",
  exceeded:
    "time,sensor,value_mm\n2026-09-14T09:00:00+09:00,IN-01,0\n2026-09-15T09:00:00+09:00,IN-01,3.1\n2026-09-16T09:00:00+09:00,IN-01,7.2\n2026-09-17T09:00:00+09:00,IN-01,12.4\n2026-09-18T09:00:00+09:00,IN-01,17.8\n2026-09-19T09:00:00+09:00,IN-01,23.6",
  invalid:
    "time,sensor,value_mm\n2026-09-14T09:00:00+09:00,IN-01,0\n2026-09-14T09:00:00+09:00,IN-01,\n2026-09-13T09:00:00+09:00,IN-01,7.2\n날짜오류,,12.4",
};
