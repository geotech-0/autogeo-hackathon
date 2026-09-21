import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectRecord } from "../src/contracts";
import { recordPage } from "../src/utils/record-route";

test("follow-up links return standards and comments to their actual workspace", () => {
  const record = (kind: string, stage = "tender") =>
    ({ payload: { kind }, stage }) as ProjectRecord;
  assert.equal(recordPage(record("standard-adoption")), "standards");
  assert.equal(recordPage(record("comment")), "history");
  assert.equal(recordPage(record("ground-review")), "tender");
  assert.equal(
    recordPage(record("monitoring-review", "construction")),
    "construction",
  );
});
