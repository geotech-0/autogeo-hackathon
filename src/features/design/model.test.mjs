import test from "node:test";
import assert from "node:assert/strict";
import {
  MEMBER_IDS,
  createWorkspace,
  updateValue,
  updateQuantity,
  confirmGeometry,
  computeWorkspace,
  restoreWorkspace,
  makeDesignDraft,
  exportDesign,
  importDesign,
  comparisonRows,
  finiteNumber,
} from "./model.mjs";
import { makeReport } from "./report.mjs";
const near = (a, b, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b}`);
const result = (state, id) => computeWorkspace(state)[id];
const changes = (id, entries) =>
  Object.entries(entries).reduce(
    (s, [k, v]) => updateValue(s, id, k, String(v)),
    createWorkspace(),
  );

test("synthetic anchor hand-check: R×s then independent slip and relaxation losses", () => {
  const r = result(createWorkspace(), "anchor");
  assert.equal(r.ok, true);
  near(r.results.designForceKn, 60);
  const area = 4 * 98.71,
    slip = (200000 * 3 * area) / (11.5 * 1e6),
    relax = (0.05 * 0.8 * 1570 * area) / 1000;
  near(r.results.jackingForceKn, 60 + slip + relax);
  near(r.results.allowableTotalKn, (1209 * area) / 1000);
  assert.equal(r.checks.length, 8);
  assert.equal(r.status, "pass");
});
test("wale uses loss-inclusive Jf once; independent horizontal and beam equations", () => {
  const s = createWorkspace(),
    r = computeWorkspace(s),
    Jf = 105.39629982608696;
  near(r.wale.input.anchorForceKn, Jf);
  near(
    r.wale.results.supportReactionKn,
    (Jf * Math.cos(Math.PI / 6) * 400) / 600,
  );
  const w = (Jf * Math.cos(Math.PI / 6) * 400) / 600 / (1.1 * 1.5);
  near(r.wale.results.lineLoadKnm, w);
  near(r.wale.results.momentKnm, 0.1 * w * 1.5 ** 2);
  near(r.wale.results.shearKn, 0.6 * w * 1.5);
  assert.equal(r.wale.dependencies[0].fingerprint, r.anchor.fingerprint);
});
test("changing anchor reaction refreshes wale dependency, value, revision and comparison", () => {
  const a = createWorkspace(),
    b = updateValue(a, "anchor", "reactionKnPerM", "80"),
    ra = computeWorkspace(a),
    rb = computeWorkspace(b);
  near(rb.wale.input.anchorForceKn - ra.wale.input.anchorForceKn, 60);
  assert.equal(rb.wale.dependencies[0].revision, 2);
  assert.notEqual(
    rb.wale.dependencies[0].fingerprint,
    ra.wale.dependencies[0].fingerprint,
  );
  assert.notEqual(
    comparisonRows(a, b)[1].before,
    comparisonRows(a, b)[1].after,
  );
});
test("anchor kN/anchor input normalizes then applies spacing once", () => {
  let s = changes("anchor", { reactionKnPerM: 60 });
  s = updateQuantity(s, "anchor", "reactionKnPerM", { unit: "kN/개" });
  const r = result(s, "anchor");
  near(r.input.reactionKnPerM, 40);
  near(r.results.designForceKn, 60);
  assert.equal(r.quantities.reactionKnPerM.rawValue, 60);
});
test("pile per-meter / per-pile quantities are equivalent, signed maxima preserved", () => {
  const baseline = result(createWorkspace(), "pile");
  let s = changes("pile", {
    momentPerMKnm: -112.5,
    shearPerMKn: -135,
    displacementMm: -0.012,
  });
  s = updateQuantity(s, "pile", "momentPerMKnm", { unit: "kN·m/본" });
  s = updateQuantity(s, "pile", "shearPerMKn", { unit: "kN/본" });
  s = updateQuantity(s, "pile", "displacementMm", { unit: "m" });
  const r = result(s, "pile");
  near(r.results.momentKnm, 112.5);
  near(r.results.shearKn, 135);
  near(r.results.displacementMm, 12);
  near(r.results.interaction, baseline.results.interaction);
  assert.equal(r.quantities.momentPerMKnm.rawValue, -112.5);
  assert.notEqual(
    r.quantities.momentPerMKnm.stage,
    r.quantities.displacementMm.stage,
  );
});
test("direct Qu is used exactly; Fs changes capacity without affecting stress", () => {
  const a = result(createWorkspace(), "pile"),
    b = result(
      changes("pile", { ultimateBearingKn: 1400, bearingSafetyFactor: 2.5 }),
      "pile",
    );
  near(b.results.allowableBearingKn, 560);
  assert.equal(b.results.bendingStressMpa, a.results.bendingStressMpa);
  assert.equal(b.results.ultimateBearingKn, 1400);
  assert.equal(Object.hasOwn(b.input, "tipN"), false);
});
test("zero capacity does not produce a fake zero-percent governing ratio", () => {
  const r = result(changes("pile", { ultimateBearingKn: 0 }), "pile");
  assert.equal(r.ok, true);
  assert.equal(r.status, "exceeded");
  assert.equal(r.maxUtilization, null);
  assert.equal(r.checks.find((c) => c.key === "bearing").pass, false);
  assert.doesNotMatch(JSON.stringify(r), /NaN|Infinity/);
});
test("timber area pressure, MPa and line-load inputs agree independently", () => {
  const base = result(createWorkspace(), "timber");
  near(base.results.lineLoadKnm, 55 * 0.15);
  near(base.results.spanMm, 1500 - 0.75 * 300);
  near(base.results.momentKnm, (8.25 * 1.275 ** 2) / 8);
  let mp = changes("timber", { pressureKpa: 0.055 });
  mp = updateQuantity(mp, "timber", "pressureKpa", { unit: "MPa" });
  near(result(mp, "timber").results.stressMpa, base.results.stressMpa);
  let line = changes("timber", { pressureKpa: 8.25 });
  line = updateQuantity(line, "timber", "pressureKpa", { unit: "kN/m" });
  near(
    result(line, "timber").results.maximumShearMpa,
    base.results.maximumShearMpa,
  );
  near(base.results.maximumShearMpa, 1.5 * base.results.averageShearMpa);
});
test("geometry modification becomes stale, including downstream wale; confirmation is explicit", () => {
  let s = changes("anchor", { spacingM: 1.8 });
  assert.equal(result(s, "anchor").status, "stale");
  assert.equal(result(s, "wale").status, "stale");
  s = confirmGeometry(s, "wale");
  assert.equal(result(s, "wale").status, "stale");
  s = confirmGeometry(s, "anchor");
  assert.equal(result(s, "anchor").status, "pass");
  assert.equal(result(s, "wale").status, "pass");
  s.source.modelRevision = "2";
  for (const id of MEMBER_IDS) assert.equal(result(s, id).status, "stale");
});
test("changed thickness keeps failed checks visible while analysis compatibility is pending", () => {
  const state = changes("timber", { thicknessMm: 50 }),
    r = result(state, "timber");
  assert.equal(r.status, "stale");
  assert.ok(r.checks.some((c) => !c.pass));
  assert.ok(r.results.stressMpa > 13.5);
  assert.ok(r.warnings.some((w) => w.includes("외부 해석 재실행")));
  assert.equal(
    result(confirmGeometry(state, "timber"), "timber").status,
    "exceeded",
  );
});
test("whitelist disallows material constants, solver angles and empirical Qu inputs", () => {
  for (const [id, key] of [
    ["anchor", "yieldStrengthMpa"],
    ["wale", "angleDeg"],
    ["pile", "tipN"],
    ["timber", "spanMm"],
  ])
    assert.throws(
      () => updateValue(createWorkspace(), id, key, "50"),
      /허용목록/,
    );
  const s = createWorkspace();
  s.members.anchor.values.yieldStrengthMpa = "400";
  assert.throws(() => restoreWorkspace(s), /편집 불가/);
});
test("blank, nonfinite, underflow and malformed numbers remain invalid, never default to zero", () => {
  for (const value of [
    "",
    " ",
    "NaN",
    "Infinity",
    "1e309",
    "1e-999",
    "0x10",
    "1,500",
    true,
    null,
    undefined,
  ])
    assert.equal(finiteNumber(value), null);
  for (const value of ["", "NaN", "1e309", "-1"])
    assert.equal(
      result(changes("anchor", { reactionKnPerM: value }), "anchor").ok,
      false,
    );
  assert.equal(
    result(changes("anchor", { strandCount: 2.5 }), "anchor").ok,
    false,
  );
  assert.equal(
    result(changes("anchor", { strandCount: 13 }), "anchor").ok,
    false,
  );
});
test("unsupported geometry and singular buckling interaction are blocked", () => {
  assert.equal(result(changes("wale", { leverCMm: 100 }), "wale").ok, false);
  assert.equal(result(changes("wale", { leverCMm: 600 }), "wale").ok, false);
  assert.equal(
    result(changes("pile", { unbracedLengthMm: 10000 }), "pile").ok,
    false,
  );
  assert.equal(
    result(changes("pile", { axialForceKn: 100000 }), "pile").ok,
    false,
  );
  assert.equal(
    result(changes("timber", { spacingMm: 200, pileWidthMm: 300 }), "timber")
      .ok,
    false,
  );
});
test("wrong unit and missing max-stage provenance cannot silently pass", () => {
  assert.throws(
    () =>
      updateQuantity(createWorkspace(), "anchor", "reactionKnPerM", {
        unit: "kPa",
      }),
    /지원하지/,
  );
  assert.equal(
    result(
      updateQuantity(createWorkspace(), "pile", "momentPerMKnm", { stage: "" }),
      "pile",
    ).ok,
    false,
  );
  const s = createWorkspace();
  s.source.modelId = "";
  assert.equal(result(s, "anchor").ok, false);
  assert.throws(() => makeDesignDraft(s), /입력/);
});
test("source metadata stays outside numeric engine input and propagates to the record", () => {
  const s = createWorkspace();
  s.source.origin = "imported_analysis";
  s.source.id = "EXAMPLE-USER-1";
  s.source.revision = "3";
  const draft = makeDesignDraft(s);
  assert.equal(draft.origin, "imported_analysis");
  assert.equal(draft.source_revision, "3");
  assert.match(draft.assumptions[0], /사용자 채택/);
  assert.ok(
    Object.values(draft.payload.calculations.anchor.input).every(
      Number.isFinite,
    ),
  );
});
test("roundtrip replays calculations and dependencies rather than trusting saved outputs", () => {
  const s = updateValue(createWorkspace(), "anchor", "reactionKnPerM", "90"),
    draft = makeDesignDraft(s),
    raw = JSON.parse(exportDesign(s));
  raw.calculations = { anchor: { results: { jackingForceKn: 1 } } };
  const restored = importDesign(JSON.stringify(raw)),
    r = computeWorkspace(restored);
  near(
    r.wale.input.anchorForceKn,
    draft.payload.calculations.anchor.results.jackingForceKn,
  );
  assert.notEqual(r.wale.input.anchorForceKn, 1);
  assert.deepEqual(restored, s);
});
test("restore rejects missing fields, unexpected engine version and unsupported units", () => {
  const raw = JSON.parse(exportDesign(createWorkspace()));
  raw.method_version = "future";
  assert.throws(() => importDesign(JSON.stringify(raw)), /지원하지/);
  const s = createWorkspace();
  delete s.members.pile.values.ultimateBearingKn;
  assert.throws(() => restoreWorkspace(s), /필수 입력/);
  const bad = createWorkspace();
  bad.members.timber.quantities.pressureKpa.unit = "tonf";
  assert.throws(() => restoreWorkspace(bad), /단위/);
});
test("stored stale geometry remains stale after refresh and export", () => {
  const s = changes("pile", { spacingM: 1.8 }),
    restored = importDesign(exportDesign(s));
  assert.equal(result(restored, "pile").status, "stale");
  assert.equal(makeDesignDraft(restored).status, "stale");
});
test("report escapes entered text and includes provenance, equations, limitations and linkage", () => {
  const s = createWorkspace();
  s.label = "<img src=x onerror=alert(1)>";
  const html = makeReport(s, "2026-09-21T09:00:00.000Z");
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  for (const text of [
    "초기 긴장력",
    "입력 개정",
    "단위 변환",
    "채택 Qu 근거",
    "성분별",
    "SYN-A-DESIGN-01",
    "Qu = 사용자",
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /sourceInput|sha256|\.pdf/);
});
test("public synthetic fixture is a complete finite 19-check saveable record", () => {
  const draft = makeDesignDraft(createWorkspace());
  assert.equal(draft.status, "pass");
  assert.equal(draft.origin, "synthetic");
  assert.equal(
    Object.values(draft.payload.calculations).reduce(
      (s, r) => s + r.checks.length,
      0,
    ),
    19,
  );
  for (const r of Object.values(draft.payload.calculations)) {
    assert.ok(Object.values(r.results).every(Number.isFinite));
    assert.ok(r.steps.every((s) => Number.isFinite(s.value)));
  }
  assert.doesNotMatch(
    JSON.stringify(draft),
    /sourceInput|sha256|filename|이천|B-B|9\.31/,
  );
});

test("different model identity with the same revision requires reconfirmation", () => {
  const s = createWorkspace();
  s.source.modelId = "A-OTHER";
  for (const id of MEMBER_IDS) assert.equal(result(s, id).status, "stale");
});

test("restore never invents missing source provenance", () => {
  const s = createWorkspace();
  delete s.source.id;
  assert.throws(() => restoreWorkspace(s), /메타데이터/);
});

test("section stiffness changes require external analysis reconfirmation", () => {
  for (const [id, key, value] of [
    ["anchor", "strandCount", "5"],
    ["timber", "thicknessMm", "110"],
    ["timber", "heightMm", "160"],
  ]) {
    const state = updateValue(createWorkspace(), id, key, value);
    const r = computeWorkspace(state);
    assert.equal(r[id].status, "stale");
    if (id === "anchor") assert.equal(r.wale.status, "stale");
    const checked = confirmGeometry(state, id);
    assert.notEqual(computeWorkspace(checked)[id].status, "stale");
  }
});
