import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SITE_MODEL_PADDING_M, siteModelDomain } from "./model-domain.mjs";

const data = JSON.parse(
  fs.readFileSync(
    new URL("../../data/real-ground/boreholes.json", import.meta.url),
  ),
);
const assets = JSON.parse(
  fs.readFileSync(
    new URL("../../../public/data/ground/site-assets.json", import.meta.url),
  ),
);
const boundary = assets.cad.boundaryEN;
const rectangle = [
  [239800, 521450],
  [239900, 521450],
  [239900, 521550],
  [239800, 521550],
];

test("Actual CAD boundary and all 32 boreholes share a rectangle with exactly 10m margin", () => {
  const before = JSON.stringify({ holes: data.holes, boundary });
  const domain = siteModelDomain(data.holes, boundary);
  assert.equal(SITE_MODEL_PADDING_M, 10);
  assert.deepEqual(domain, {
    kind: "site-rectangle",
    bounds: [239807.44999999998, 521464.77, 240047.59999999998, 521706.97],
    padding: 10,
    source: "cad-boundary",
  });
  assert.equal(data.holes.length, 32);
  for (const [e, n] of [
    ...boundary,
    ...data.holes.map((hole) => [hole.easting, hole.northing]),
  ]) {
    assert.ok(e >= domain.bounds[0] + 10 && e <= domain.bounds[2] - 10);
    assert.ok(n >= domain.bounds[1] + 10 && n <= domain.bounds[3] - 10);
  }
  assert.equal(JSON.stringify({ holes: data.holes, boundary }), before);
});

test("All four actual campaigns fit the same CAD-anchored domain", () => {
  const shared = siteModelDomain(data.holes, boundary);
  assert.equal(data.campaigns.length, 4);
  for (const campaign of data.campaigns) {
    const holes = data.holes.filter((hole) => hole.campaign === campaign.id);
    assert.equal(holes.length, campaign.holeCount);
    assert.deepEqual(siteModelDomain(holes, boundary), shared);
  }
});

test("Boreholes outside the CAD rectangle expand its domain without moving any source point", () => {
  const holes = [
    { easting: 239775, northing: 521460 },
    { easting: 239920, northing: 521590 },
    { easting: 239810, northing: 521430 },
  ];
  const before = JSON.stringify({ holes, rectangle });
  assert.deepEqual(
    siteModelDomain(holes, rectangle).bounds,
    [239765, 521420, 239930, 521600],
  );
  assert.equal(JSON.stringify({ holes, rectangle }), before);
});

test("Missing or degenerate CAD evidence is rejected even when boreholes alone span a valid area", () => {
  for (const value of [
    undefined,
    null,
    [],
    rectangle.slice(0, 2),
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  ]) {
    assert.throws(() => siteModelDomain(data.holes, value), /CAD 대지경계/);
  }
});

test("Malformed boundary and borehole coordinates are not coerced, discarded, or fabricated", () => {
  for (const invalid of [
    [NaN, 1],
    [Infinity, 1],
    [1, -Infinity],
    ["239800", 521450],
    [1],
    [1, 2, 3],
    Array(2),
    null,
  ]) {
    assert.throws(
      () => siteModelDomain(data.holes, [invalid, ...rectangle.slice(1)]),
      /CAD 대지경계.*좌표/,
    );
  }
  assert.throws(
    () => siteModelDomain(data.holes, Array(3)),
    /CAD 대지경계.*좌표/,
  );
  for (const holes of [
    null,
    {},
    [null],
    Array(1),
    [{ easting: "239800", northing: 521450 }],
    [{ easting: NaN, northing: 521450 }],
    [{ easting: 239800, northing: Infinity }],
    [{ easting: 239800 }],
  ]) {
    assert.throws(() => siteModelDomain(holes, rectangle), /시추공.*좌표/);
  }
});

test("Margin accepts inclusive 0–100m and rejects invalid values instead of silently defaulting", () => {
  assert.deepEqual(
    siteModelDomain([], rectangle, 0).bounds,
    [239800, 521450, 239900, 521550],
  );
  assert.deepEqual(
    siteModelDomain([], rectangle, 100).bounds,
    [239700, 521350, 240000, 521650],
  );
  assert.deepEqual(
    siteModelDomain([], rectangle, 3.5).bounds,
    [239796.5, 521446.5, 239903.5, 521553.5],
  );
  for (const padding of [-1, 100.01, NaN, Infinity, "10", null]) {
    assert.throws(
      () => siteModelDomain([], rectangle, padding),
      /여유폭.*0~100m/,
    );
  }
});

test("Boundary closure and winding preserve absolute E/N without rounding or origin shifts", () => {
  const open = siteModelDomain([], rectangle);
  assert.deepEqual(siteModelDomain([], [...rectangle, rectangle[0]]), open);
  assert.deepEqual(siteModelDomain([], [...rectangle].reverse()), open);
  const shifted = rectangle.map(([e, n]) => [e + 0.125, n - 0.375]);
  assert.deepEqual(
    siteModelDomain([], shifted).bounds,
    [239790.125, 521439.625, 239910.125, 521559.625],
  );
});

test("Finite coordinates that overflow a domain extent are rejected", () => {
  const holes = [
    { easting: -Number.MAX_VALUE, northing: 521450 },
    { easting: Number.MAX_VALUE, northing: 521450 },
  ];
  assert.throws(() => siteModelDomain(holes, rectangle), /좌표 범위/);
});
