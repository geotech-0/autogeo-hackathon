import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { annotationPosition } from "./image-position.mjs";
const bounds = JSON.parse(
  readFileSync(
    new URL("../../../public/data/ground/site-assets.json", import.meta.url),
  ),
).orthophoto.boundsEN;
test("image keyboard position keeps original EN metres and accepts the exact image boundary", () => {
  assert.deepEqual(annotationPosition("239900.125", "521550.25", bounds), {
    easting: 239900.125,
    northing: 521550.25,
  });
  for (const [e, n] of [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ])
    assert.deepEqual(annotationPosition(String(e), String(n), bounds), {
      easting: e,
      northing: n,
    });
});
test("image keyboard position rejects missing, non-finite, reversed, local and out-of-image coordinates", () => {
  for (const [e, n] of [
    ["", "521550"],
    ["239900", " "],
    ["NaN", "521550"],
    ["Infinity", "521550"],
    ["1e309", "521550"],
    ["521550", "239900"],
    ["100", "100"],
    [bounds[0] - 0.001, bounds[1]],
    [bounds[2], bounds[3] + 0.001],
  ])
    assert.throws(() => annotationPosition(e, n, bounds));
  for (const bad of [null, [], [1, 2, 3], [3, 4, 1, 2], [0, 0, Infinity, 9]])
    assert.throws(
      () => annotationPosition("239900", "521550", bad),
      /범위를 확인하지 못했습니다/,
    );
});
