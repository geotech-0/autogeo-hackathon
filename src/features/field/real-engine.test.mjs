import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateSensor,
  parseAdditionalReadings,
  dcptEstimate,
  stageEndpoints,
  nextIssue,
  monitoringProvenance,
} from "./real-engine.mjs";
const monitoring = JSON.parse(
  fs.readFileSync(
    new URL("../../data/real-field/monitoring.json", import.meta.url),
  ),
);
const quality = JSON.parse(
  fs.readFileSync(
    new URL("../../data/real-field/quality.json", import.meta.url),
  ),
);
test("provided reports preserve 27 instruments and trace every unique row to a PDF page", () => {
  assert.equal(monitoring.sensors.length, 27);
  assert.equal(monitoring.reports.map((r) => r.pages).join(","), "79,79,81");
  for (const s of monitoring.sensors) {
    assert.equal(new Set(s.rows.map((r) => r.date)).size, s.rows.length);
    for (const r of s.rows) {
      assert.ok(Number.isFinite(r.value));
      assert.match(r.source.url, /monitoring-0[123]\.pdf#page=\d+$/);
    }
  }
});
test("F2 March20 interval arithmetic contradicts safe monthly summary and remains pending", () => {
  const s = monitoring.sensors.find((s) => s.id === "F-2");
  const r = s.rows.find((r) => r.date === "2024-03-20");
  assert.equal(r.value, 2068.45);
  assert.equal(r.rate, 199.156);
  assert.ok(Math.abs((2068.45 - 1072.67) / 5 - r.calculatedRate) < 1e-9);
  const result = evaluateSensor(s);
  assert.equal(result.status, "pending");
  assert.equal(result.candidateExceeded, true);
  assert.ok(s.qc.some((q) => q.includes("67.5")));
});
test("water cumulative comparison preserves signed raw readings and per-sensor threshold mapping uncertainty", () => {
  const w2 = monitoring.sensors.find((s) => s.id === "W-2");
  assert.equal(w2.rows.at(-1).value, -8.05);
  assert.equal(w2.rows.at(-1).delta, -1.21);
  assert.ok(Math.abs(evaluateSensor(w2).ratio - 1.21 / 1.23) < 1e-12);
  assert.equal(
    evaluateSensor(monitoring.sensors.find((s) => s.id === "W-7")).status,
    "pending",
  );
});
test("inclinometer graph axes are never parsed as table displacement", () => {
  const s = monitoring.sensors.find((s) => s.id === "INC-4");
  const jan = s.observations.filter((r) => r.source.report === "monitoring-01");
  assert.equal(jan.find((r) => r.date === "2024-01-23").value, 0);
  assert.equal(jan.find((r) => r.date === "2024-01-26").value, 0.106);
  assert.ok(jan.every((r) => Math.abs(r.value) < 1));
});
test("load-cell typo is retained while serial-number mapping prevents merging distinct instruments", () => {
  const s = monitoring.sensors.find((s) => s.id === "L-2-3");
  const jan = s.observations.find((r) => r.source.report === "monitoring-01");
  assert.equal(jan.value, 25.77);
  assert.equal(jan.declaredSensorId, "L-2-1");
  assert.ok(s.qc.some((q) => q.includes("일련번호")));
});
test("additional CSV rejects invalid dates, duplicate timestamps, empty values and extra columns", () => {
  assert.equal(
    parseAdditionalReadings("date,value\n2024-02-29,-8.05").rows[0].value,
    -8.05,
  );
  for (const csv of [
    "date,value\n2024-02-30,1",
    "date,value\n2024-03-01,",
    "date,value\n2024-03-01,1\n2024-03-01,2",
    "date,value\n2024-03-01,1,2",
    "date,value\n2024-03-02,1\n2024-03-01,2",
    "date,value\n2024-03-01,0x10",
  ])
    assert.ok(parseAdditionalReadings(csv).errors.length);
});
test("all supplied quality categories are represented without inventing a DCPT depth log", () => {
  assert.deepEqual(
    quality.datasets.map((d) => [d.id, d.rows.length]),
    [
      ["plate", 65],
      ["pile", 64],
      ["tension", 90],
      ["dcpt", 34],
    ],
  );
  assert.equal(quality.gprProvided, false);
  const plate = quality.datasets[0];
  assert.equal(plate.rows.at(-1).pressure, 675.44);
  assert.equal(plate.rows.at(-1).displacement, 19.04);
  const pile = quality.datasets[1];
  assert.equal(pile.rows.at(-1).timestamp, "2026-06-23T14:30:00");
  assert.ok(pile.qc.some((q) => q.includes("잘려")));
  assert.equal(quality.datasets[3].rows[0].depth, undefined);
  assert.equal(
    quality.datasets[3].rows.find((r) => r.penetration === 1.2).qa,
    394,
  );
  assert.equal(new Set(quality.datasets[2].rows.map((r) => r.stage)).size, 18);
  assert.ok(quality.datasets[2].rows.every((r) => r.hold === undefined));
});
test("DCPT correlation remains finite only for positive penetration and preserves independent fixture", () => {
  assert.deepEqual(dcptEstimate(1.2), { ndcpt: 25, nspt: 31.5, qa: 393.75 });
  for (const x of [0, -1, NaN, ""]) assert.throws(() => dcptEstimate(x));
});
test("stage endpoints preserve unloading sequence", () => {
  const r = stageEndpoints(quality.datasets[1].rows);
  assert.equal(r.find((r) => r.stage === "1U-2").displacement, -0.19);
  assert.ok(
    r.findIndex((r) => r.stage === "1U-2") <
      r.findIndex((r) => r.stage === "2L-1"),
  );
});
test("issue actions require chronological evidence and persist prior observations", () => {
  const issue = {
    lifecycle: "identified",
    history: [{ date: "2024-03-20", note: "원문 차이" }],
  };
  assert.throws(() =>
    nextIssue(issue, { date: "2024-03-19", author: "담당", note: "재측정" }),
  );
  assert.throws(() =>
    nextIssue(issue, { date: "2024-03-21", author: "", note: "재측정" }),
  );
  const next = nextIssue(issue, {
    date: "2024-03-21",
    author: "담당",
    note: "원본 검침 재확인",
  });
  assert.equal(next.lifecycle, "action");
  assert.equal(next.history[0].note, "원문 차이");
});
test("unresolved reinspections remain actionable and only explicit resolution can close, with prior history preserved", () => {
  const initial = {
    lifecycle: "action",
    history: [
      {
        stage: "action",
        date: "2024-03-20",
        author: "담당",
        note: "원인 점검",
      },
    ],
  };
  const event = {
    date: "2024-03-21",
    author: "담당",
    note: "이상 지속, 미해결",
  };
  const checked = nextIssue(initial, event, "reinspection");
  assert.equal(checked.lifecycle, "reinspection");
  assert.throws(() => nextIssue(checked, event, "closed"), /해결/);
  const followed = nextIssue(
    checked,
    { ...event, note: "후속 조치" },
    "action",
  );
  const checkedAgain = nextIssue(
    followed,
    { ...event, note: "재점검 완료" },
    "reinspection",
  );
  assert.throws(
    () =>
      nextIssue(
        checkedAgain,
        { ...event, date: "2024-02-30", resolved: true },
        "closed",
      ),
    /날짜/,
  );
  const closed = nextIssue(
    checkedAgain,
    { ...event, note: "해결 근거 확인", resolved: true },
    "closed",
  );
  assert.equal(closed.lifecycle, "closed");
  assert.equal(closed.history.at(-1).resolved, true);
  const reopened = nextIssue(
    closed,
    { ...event, note: "추가 확인 필요" },
    "action",
  );
  assert.equal(reopened.lifecycle, "action");
  assert.deepEqual(reopened.history.slice(0, -1), closed.history);
  assert.deepEqual(initial.history, [
    { stage: "action", date: "2024-03-20", author: "담당", note: "원인 점검" },
  ]);
  assert.throws(
    () => nextIssue(initial, { ...event, resolved: true }, "closed"),
    /단계/,
  );
});
test("monitoring provenance uses actual row reports, not selected month as a guessed PDF", () => {
  const s = monitoring.sensors.find((s) => s.id === "W-2");
  const january = monitoringProvenance(
    s.rows.filter((r) => r.date.startsWith("2024-01")),
    "2024-01",
    monitoring.reports,
  );
  assert.equal(january.source_revision, "2024-01, 2024-02");
  assert.equal(january.measurementPeriod.selected, "2024-01");
  assert.deepEqual(
    january.sourceReports.map((r) => r.id),
    ["monitoring-01", "monitoring-02"],
  );
  assert.deepEqual(
    january.sourceReports.map((r) => r.referencedPages),
    [[64], [64]],
  );
  const all = monitoringProvenance(s.rows, "all", monitoring.reports);
  assert.deepEqual(
    all.sourceReports.map((r) => r.id),
    ["monitoring-01", "monitoring-02", "monitoring-03"],
  );
  assert.equal(all.measurementPeriod.from, "2023-12-19");
  assert.equal(all.measurementPeriod.to, "2024-03-29");
});
