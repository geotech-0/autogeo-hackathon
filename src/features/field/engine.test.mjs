import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  evaluatePlate,
  evaluateMonitoring,
  parseMonitoringTime,
  manualMonitoringTime,
  PLATE_FIXTURES,
  MONITORING_FIXTURES,
} from "./engine.mjs";

const plate = {
  mode: "load",
  diameterMm: 300,
  limitMm: 10,
  criterion: "합성 A현장 최대 침하 관리기준",
};
const monitoring = { baselineMm: 0, warningMm: 15, actionMm: 20 };
test("CSV handles BOM, CRLF and quoted commas without losing rows", () => {
  const result = parseCSV(
    '\uFEFFname,value\r\n"센서, 동측",12\r\n"따옴표 ""확인""",13',
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].values.name, "센서, 동측");
  assert.equal(result.rows[1].values.name, '따옴표 "확인"');
  assert.deepEqual(result.errors, []);
});
test("malformed CSV is not silently accepted", () => {
  assert.ok(parseCSV("time,time\n1,2").errors.length);
  assert.ok(parseCSV("a,b\n1").errors.length);
  assert.ok(parseCSV('a,b\n"open,1').errors.length);
});
test("100 kPa equals 7.0685834706 kN on a 300 mm diameter plate", () => {
  const result = evaluatePlate(
    "time_min,stage,load_kN,settlement_mm\n0,재하,0,0\n5,재하,7.0685834705770345,2",
    plate,
  );
  assert.ok(Math.abs(result.area - 0.07068583470577035) < 1e-12);
  assert.ok(Math.abs(result.rows[1].pressure - 100) < 1e-9);
  assert.equal(result.status, "pass");
});
test("pressure input remains pressure and derives correct load", () => {
  const result = evaluatePlate(
    "time_min,stage,pressure_kPa,settlement_mm\n0,재하,0,0\n5,재하,100,2",
    { ...plate, mode: "pressure" },
  );
  assert.equal(result.rows[1].pressure, 100);
  assert.ok(Math.abs(result.rows[1].load - 7.0685834705770345) < 1e-10);
});
test("normal, exceeded and absent-criterion states are distinct", () => {
  assert.equal(evaluatePlate(PLATE_FIXTURES.normal, plate).status, "pass");
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.exceeded, plate).status,
    "exceeded",
  );
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.normal, { ...plate, limitMm: "" }).status,
    "pending",
  );
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.normal, { ...plate, criterion: "" }).status,
    "pending",
  );
});
test("equality is within maximum settlement limit; 0.01 mm beyond is exceeded", () => {
  const csv =
    "time_min,stage,pressure_kPa,settlement_mm\n0,재하,0,0\n5,재하,100,10";
  assert.equal(
    evaluatePlate(csv, { ...plate, mode: "pressure" }).status,
    "pass",
  );
  assert.equal(
    evaluatePlate(csv.replace(",100,10", ",100,10.01"), {
      ...plate,
      mode: "pressure",
    }).status,
    "exceeded",
  );
});
test("invalid plate data retain every raw row and never pass", () => {
  const result = evaluatePlate(PLATE_FIXTURES.invalid, plate);
  assert.equal(result.totalCount, 5);
  assert.equal(result.status, "error");
  assert.equal(result.rows[2].settlement, null);
  assert.ok(
    result.errors.some((x) => x.includes("重複") || x.includes("중복")),
  );
  assert.ok(result.errors.some((x) => x.includes("역전")));
});
test("missing diameter, negative limits, nonnumeric cells and missing columns fail", () => {
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.normal, { ...plate, diameterMm: "" }).status,
    "error",
  );
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.normal, { ...plate, limitMm: -1 }).status,
    "error",
  );
  assert.equal(
    evaluatePlate("time_min,stage,load_kN,settlement_mm\n0,재하,abc,1", plate)
      .status,
    "error",
  );
  assert.equal(
    evaluatePlate("time_min,stage,settlement_mm\n0,재하,1", plate).status,
    "error",
  );
});
test("monitoring thresholds use absolute displacement from baseline, not raw value", () => {
  const csv =
    "time,sensor,value_mm\n2026-09-14T09:00:00+09:00,IN-01,100\n2026-09-15T09:00:00+09:00,IN-01,79";
  const result = evaluateMonitoring(csv, { ...monitoring, baselineMm: 100 });
  assert.equal(result.rows[1].displacement, -21);
  assert.equal(result.status, "exceeded");
  assert.equal(result.exceededCount, 1);
});
test("monitoring distinct sample states and threshold ordering", () => {
  assert.equal(
    evaluateMonitoring(MONITORING_FIXTURES.normal, monitoring).status,
    "pass",
  );
  assert.equal(
    evaluateMonitoring(MONITORING_FIXTURES.exceeded, monitoring).status,
    "exceeded",
  );
  assert.equal(
    evaluateMonitoring(MONITORING_FIXTURES.invalid, monitoring).status,
    "error",
  );
  assert.equal(
    evaluateMonitoring(MONITORING_FIXTURES.normal, {
      ...monitoring,
      actionMm: "",
    }).status,
    "pending",
  );
  assert.equal(
    evaluateMonitoring(MONITORING_FIXTURES.normal, {
      ...monitoring,
      warningMm: 30,
    }).status,
    "error",
  );
});
test("monitoring requires an explicit timezone and rejects repeated/descending sensor times", () => {
  assert.equal(
    evaluateMonitoring(
      "time,sensor,value_mm\n2026-09-14T09:00:00,IN-01,1",
      monitoring,
    ).status,
    "error",
  );
  const result = evaluateMonitoring(MONITORING_FIXTURES.invalid, monitoring);
  assert.equal(result.totalCount, 4);
  assert.ok(result.errors.some((x) => x.includes("중복")));
  assert.ok(result.errors.some((x) => x.includes("역전")));
});
test("invalid calendar dates and 24:00 cannot normalize into accepted measurements", () => {
  assert.equal(parseMonitoringTime("2026-02-30T09:00:00+09:00"), null);
  assert.equal(parseMonitoringTime("2026-09-14T24:00:00+09:00"), null);
  assert.equal(parseMonitoringTime("2026-09-14T09:60:00+09:00"), null);
  assert.notEqual(parseMonitoringTime("2028-02-29T09:00:00+09:00"), null);
  assert.equal(
    manualMonitoringTime("2026-09-20T09:00"),
    "2026-09-20T09:00:00+09:00",
  );
  assert.equal(
    manualMonitoringTime("2026-09-20T09:00:30"),
    "2026-09-20T09:00:30+09:00",
  );
});
test("duplicate high readings produce input error rather than threshold-exceeded verdict", () => {
  const csv =
    "time,sensor,value_mm\n2026-09-14T09:00:00+09:00,IN-01,30\n2026-09-14T09:00:00+09:00,IN-01,31";
  assert.equal(evaluateMonitoring(csv, monitoring).status, "error");
});
test("wrong pressure/load headers and nonnumeric thresholds never silently pass", () => {
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.normal, { ...plate, mode: "pressure" }).status,
    "error",
  );
  assert.equal(
    evaluatePlate(PLATE_FIXTURES.normal, { ...plate, limitMm: "oops" }).status,
    "error",
  );
  assert.equal(
    evaluateMonitoring(MONITORING_FIXTURES.normal, {
      ...monitoring,
      actionMm: "oops",
    }).status,
    "error",
  );
});
