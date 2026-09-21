import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_GPR,
  validateGpr,
  transitionGpr,
  gprStatus,
  validDate,
} from "./model.mjs";
const sample = () => structuredClone(SAMPLE_GPR);
test("synthetic GPR sample belongs to a permanent asset and is awaiting confirmation", () => {
  assert.deepEqual(validateGpr(sample()), {});
  assert.equal(gprStatus(sample()), "pending");
  assert.match(SAMPLE_GPR.asset, /준공 후/);
});
test("empty coordinates cannot silently become zero; anomaly extent stays inside site", () => {
  assert.ok(validateGpr({ ...sample(), x: "" }).x);
  assert.ok(validateGpr({ ...sample(), x: "119", width: "6" }).width);
  assert.ok(validateGpr({ ...sample(), y: "99", length: "12" }).length);
});
test("dates validate calendar day instead of allowing Date normalization", () => {
  assert.equal(validDate("2027-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2027-13-01"), false);
});
test("survey → confirmation → action → reinspection preserves every prior entry", () => {
  let record = sample();
  const original = structuredClone(record.history[0]);
  ["confirmation", "action", "reinspection"].forEach((stage, i) => {
    record = transitionGpr(record, {
      id: `event-${i}`,
      date: `2027-03-0${i + 3}`,
      author: "검토자",
      note: `${stage} 근거를 기록`,
    });
    assert.equal(record.lifecycle, stage);
  });
  assert.equal(record.history.length, 4);
  assert.deepEqual(record.history[0], original);
  assert.equal(gprStatus(record), "action");
  assert.equal(gprStatus({ ...record, closed: true }), "closed");
});
test("missing rationale, absent author, time reversal and invalid input block transitions", () => {
  const event = {
    id: "one",
    date: "2027-03-03",
    author: "검토자",
    note: "근거 기록",
  };
  assert.throws(() => transitionGpr(sample(), { ...event, note: "" }), /근거/);
  assert.throws(
    () => transitionGpr(sample(), { ...event, author: "" }),
    /담당자/,
  );
  assert.throws(
    () => transitionGpr(sample(), { ...event, date: "2027-03-01" }),
    /최근 기록일/,
  );
  assert.throws(
    () => transitionGpr({ ...sample(), evidence: "" }, event),
    /필수 입력/,
  );
});
test("closing before reinspection is rejected; sample history is not mutated", () => {
  assert.ok(validateGpr({ ...sample(), closed: true }).closed);
  transitionGpr(sample(), {
    id: "one",
    date: "2027-03-03",
    author: "검토자",
    note: "후속 확인",
  });
  assert.equal(SAMPLE_GPR.history.length, 1);
});
