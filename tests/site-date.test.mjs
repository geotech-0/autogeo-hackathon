import test from "node:test";
import assert from "node:assert/strict";
import { siteDate } from "../src/utils/site-date.mjs";

test("automatic field-action dates follow Korean midnight, including a year boundary", () => {
  assert.equal(siteDate(new Date("2026-09-21T14:59:59.999Z")), "2026-09-21");
  assert.equal(siteDate(new Date("2026-09-21T15:00:00.000Z")), "2026-09-22");
  assert.equal(siteDate(new Date("2026-12-31T15:00:00.000Z")), "2027-01-01");
});
