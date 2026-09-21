import test from "node:test";
import assert from "node:assert/strict";
import {
  ADDITIONAL_MONITORING_METHOD,
  emptyAdditionalCriterion,
  evaluateAdditionalMonitoring,
  restoreAdditionalImport,
  additionalReviewPayload,
  additionalIssuePayload,
} from "./additional-monitoring.mjs";
import { nextIssue } from "./real-engine.mjs";

const signed =
  "date,value\n2026-01-01,-20.01\n2026-01-02,-20\n2026-01-03,-19.99\n2026-01-04,0\n2026-01-05,19.99\n2026-01-06,20\n2026-01-07,20.01";
const criterion = {
  unit: "mm",
  direction: "absolute",
  limit: "20",
  evidence: "QA 합성 기준 · 표 1",
  confirmedBy: "QA 담당자",
  confirmed: true,
};

test("user criteria require explicit confirmation and never inherit report thresholds", () => {
  const pending = evaluateAdditionalMonitoring(signed, {
    ...criterion,
    confirmed: false,
  });
  assert.equal(pending.status, "pending");
  assert.equal(pending.exceededCount, 0);
  assert.equal(pending.limit, null);
  assert.ok(
    pending.rows.every(
      (r) => r.comparedValue === null && r.status === "pending",
    ),
  );
  assert.equal(
    evaluateAdditionalMonitoring(signed, {
      criteria: [1, 2, 3],
      criteriaConfirmed: true,
      unit: "mm",
    }).status,
    "pending",
  );
  assert.equal(
    evaluateAdditionalMonitoring(signed, { ...criterion, confirmed: "true" })
      .status,
    "pending",
  );
});

test("upper, lower and absolute comparisons preserve signed input and treat exact boundaries as within", () => {
  for (const unit of ["mm", "m³/day"]) {
    for (const [direction, limit, exceededCount] of [
      ["above", "20", 1],
      ["below", "20", 5],
      ["absolute", "20", 2],
      ["below", "-20", 1],
      ["above", "-20", 5],
    ]) {
      const r = evaluateAdditionalMonitoring(signed, {
        ...criterion,
        unit,
        direction,
        limit,
      });
      assert.equal(r.exceededCount, exceededCount);
      assert.equal(r.status, "exceeded");
      assert.equal(r.criterion.unit, unit);
      assert.equal(r.rows[0].value, -20.01);
      assert.equal(
        r.rows.find((row) => row.value === Number(limit)).exceeded,
        false,
      );
    }
  }
  const equal = evaluateAdditionalMonitoring(
    "date,value\n2026-01-01,-20\n2026-01-02,0\n2026-01-03,20",
    criterion,
  );
  assert.equal(equal.status, "pass");
  assert.equal(equal.exceededCount, 0);
  const zero = evaluateAdditionalMonitoring("date,value\n2026-01-01,0", {
    ...criterion,
    limit: "0",
  });
  assert.equal(zero.status, "pass");
});

test("invalid confirmed settings or malformed CSV cannot create a usable verdict or save", () => {
  for (const patch of [
    { unit: " " },
    { limit: "" },
    { limit: "1e309" },
    { limit: "NaN" },
    { limit: "-1" },
    { evidence: " " },
    { confirmedBy: "" },
    { direction: "toString" },
  ]) {
    const r = evaluateAdditionalMonitoring(signed, { ...criterion, ...patch });
    assert.equal(r.status, "error");
    assert.ok(r.errors.length);
    assert.equal(r.exceededCount, 0);
    assert.equal(r.limit, null);
    assert.throws(() =>
      additionalReviewPayload({
        sensorId: "F-2",
        source: "QA",
        rawCsv: signed,
        criterion: { ...criterion, ...patch },
      }),
    );
  }
  for (const rawCsv of [
    "date,value\n2026-02-30,1",
    "date,value\n2026-01-01,",
    "date,value\n2026-01-01,1\n2026-01-01,2",
    "date,value\n2026-01-02,2\n2026-01-01,1",
    "date,value\n2026-01-01,Infinity",
  ]) {
    assert.equal(
      evaluateAdditionalMonitoring(rawCsv, criterion).status,
      "error",
    );
  }
  assert.throws(
    () =>
      additionalReviewPayload({
        sensorId: "F-2",
        source: " ",
        rawCsv: signed,
        criterion,
      }),
    /기록 이름/,
  );
});

test("legacy pending imports restore unconfirmed; new import JSON preserves raw data and all user criteria", () => {
  const legacy = restoreAdditionalImport({
    kind: "monitoring_import",
    unit: "m³",
    criteriaConfirmed: true,
    criteria: [20],
    rawCsv: signed,
    source: "legacy",
  });
  assert.deepEqual(legacy.importCriterion, emptyAdditionalCriterion());
  assert.equal(
    evaluateAdditionalMonitoring(legacy.importCsv, legacy.importCriterion)
      .status,
    "pending",
  );
  const payload = additionalReviewPayload({
    sensorId: "F-2",
    source: "QA synthetic",
    rawCsv: signed,
    criterion: { ...criterion, unit: "m³/day" },
    location: "QA 구역",
  });
  const roundtrip = restoreAdditionalImport(
    JSON.parse(JSON.stringify(payload)),
  );
  assert.equal(roundtrip.importCsv, signed);
  assert.equal(roundtrip.importSource, "QA synthetic");
  assert.equal(roundtrip.importLocation, "QA 구역");
  assert.deepEqual(roundtrip.importCriterion, { ...criterion, unit: "m³/day" });
  assert.equal(
    evaluateAdditionalMonitoring(roundtrip.importCsv, roundtrip.importCriterion)
      .exceededCount,
    2,
  );
});

test("confirmed exceedance creates a linked issue snapshot and later review revisions retain action history", () => {
  const review = {
    id: "import-1",
    revision: 2,
    payload: additionalReviewPayload({
      sensorId: "F-2",
      source: "QA",
      rawCsv: signed,
      criterion,
    }),
  };
  const issue = additionalIssuePayload(review, undefined, "2026-01-08");
  assert.equal(issue.kind, "real_field_issue");
  assert.equal(issue.monitoringReviewId, "import-1");
  assert.equal(issue.monitoringReviewRevision, 2);
  assert.equal(issue.lifecycle, "identified");
  assert.equal(issue.evaluation.exceededCount, 2);
  let progressed = nextIssue(
    issue,
    { date: "2026-01-09", author: "검토", note: "조치" },
    "action",
  );
  progressed = nextIssue(
    progressed,
    { date: "2026-01-10", author: "검토", note: "재점검" },
    "reinspection",
  );
  progressed = nextIssue(
    progressed,
    { date: "2026-01-11", author: "검토", note: "해결", resolved: true },
    "closed",
  );
  const revised = additionalIssuePayload(
    { ...review, revision: 3 },
    progressed,
    "2026-01-12",
  );
  assert.equal(revised.lifecycle, "action");
  assert.equal(revised.monitoringReviewRevision, 3);
  assert.deepEqual(revised.history.slice(0, 4), progressed.history);
  assert.equal(revised.history.length, 5);
  assert.throws(
    () =>
      additionalIssuePayload({ ...review, id: "other" }, issue, "2026-01-12"),
    /다른 추가 계측/,
  );
  assert.throws(
    () => additionalIssuePayload(review, progressed, "2026-01-08"),
    /최근 조치일/,
  );
  for (const patch of [{ confirmed: false }, { limit: "100" }]) {
    const p = additionalReviewPayload({
      sensorId: "F-2",
      source: "QA",
      rawCsv: signed,
      criterion: { ...criterion, ...patch },
    });
    assert.throws(
      () =>
        additionalIssuePayload(
          { ...review, payload: p },
          undefined,
          "2026-01-08",
        ),
      /초과 기록만/,
    );
  }
});
