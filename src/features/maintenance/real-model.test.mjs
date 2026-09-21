import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_GPR, validateRealGpr, advanceRealGpr } from "./real-model.mjs";
const complete = () => ({
  ...structuredClone(EMPTY_GPR),
  title: "실제 조사결과",
  asset: "관리도로",
  line: "L-1",
  surveyDate: "2024-03-20",
  interpreter: "기록 담당",
  location: "북측 도로",
  findings: "반사 이상 후보",
  followUp: "현장 확인",
  attachments: [{ id: "original-1" }],
  history: [
    { stage: "survey", date: "2024-03-20", author: "담당", note: "원본 등록" },
  ],
});
test("GPR starts with no fabricated observation and requires original attachment", () => {
  assert.equal(EMPTY_GPR.history.length, 0);
  assert.equal(EMPTY_GPR.attachments.length, 0);
  assert.ok(validateRealGpr(EMPTY_GPR).length > 0);
  assert.equal(validateRealGpr(complete()).length, 0);
  assert.ok(
    validateRealGpr({ ...complete(), attachments: [] }).some((e) =>
      e.includes("첨부"),
    ),
  );
});
test("GPR unknown coordinates may remain unregistered but partial or outside coordinates fail", () => {
  assert.equal(validateRealGpr(complete()).length, 0);
  assert.ok(validateRealGpr({ ...complete(), easting: "239900" }).length);
  assert.ok(
    validateRealGpr({ ...complete(), easting: "110", northing: "42" }).length,
  );
  assert.equal(
    validateRealGpr({ ...complete(), easting: "239900", northing: "521600" })
      .length,
    0,
  );
});
test("GPR transitions preserve evidence and forbid invalid chronology or early closure", () => {
  const a = complete();
  assert.throws(() =>
    advanceRealGpr(a, { date: "2024-02-30", author: "담당", note: "확인" }),
  );
  assert.throws(() =>
    advanceRealGpr(a, { date: "2024-03-19", author: "담당", note: "확인" }),
  );
  assert.ok(validateRealGpr({ ...a, closed: true }).length);
  let n = a;
  for (const expected of ["confirmation", "action", "reinspection"]) {
    n = advanceRealGpr(n, {
      date: "2024-03-21",
      author: "담당",
      note: "현장 확인 근거",
    });
    assert.equal(n.lifecycle, expected);
    assert.equal(n.closed, false);
  }
  assert.equal(n.history.length, 4);
  assert.throws(() =>
    advanceRealGpr(n, { date: "2024-03-22", author: "담당", note: "확인" }),
  );
});
