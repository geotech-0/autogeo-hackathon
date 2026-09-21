import test from "node:test";
import assert from "node:assert/strict";
import {
  REAL_DESIGN,
  MEMBER_IDS,
  createRealWorkspace,
  computeWorkspace,
  updateValue,
  updateQuantity,
  confirmGeometry,
  getModule,
  sourceComparison,
  exportDesign,
  importDesign,
  restoreWorkspace,
  makeDesignDraft,
} from "./model.mjs";
import { makeReport } from "./report.mjs";
const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test("real catalog distinguishes six sections, seven supported cases and source-only reviews", () => {
  assert.equal(REAL_DESIGN.sections.length, 6);
  assert.equal(REAL_DESIGN.sections.filter((s) => s.supported).length, 3);
  assert.equal(REAL_DESIGN.presets.length, 7);
  assert.equal(
    REAL_DESIGN.presets.filter((p) => p.sectionId === "d").length,
    1,
  );
  for (const p of REAL_DESIGN.presets) {
    const s = createRealWorkspace(p.id),
      r = computeWorkspace(s);
    for (const id of MEMBER_IDS) {
      assert.ok(r[id].ok);
      assert.ok(p.pages[id][0] >= 95);
      assert.ok(!JSON.stringify(getModule(s, id)).includes("합성"));
    }
  }
});
test("real B-left anchor independent arithmetic and 35-degree full-precision wale linkage", () => {
  const s = createRealWorkspace(),
    r = computeWorkspace(s),
    A = 4 * 98.71;
  const T = 45.62 * 1.8,
    J = T + (200000 * 3 * A) / (12.5 * 1e6) + (0.05 * 0.8 * 1570 * A) / 1000;
  near(r.anchor.results.designForceKn, 82.116);
  near(r.anchor.results.jackingForceKn, J);
  const P = (J * Math.cos((35 * Math.PI) / 180) * 393) / 550,
    w = P / (1.1 * 1.8);
  near(r.wale.results.supportReactionKn, P);
  near(r.wale.results.momentKnm, (w * 1.8 ** 2) / 10);
  near(r.wale.results.shearKn, 0.6 * w * 1.8);
  near(r.wale.dependencies[0].value, J);
  assert.notEqual(J, 125.865);
  assert.ok(
    sourceComparison(s, "anchor").some(
      (x) => x.key === "jackingForceKn" && Math.abs(x.difference) > 0,
    ),
  );
});
test("all 20 original member cases retain input precision and bounded printed rounding differences", () => {
  let count = 0;
  for (const p of REAL_DESIGN.presets) {
    const s = createRealWorkspace(p.id);
    const r = computeWorkspace(s);
    for (const id of MEMBER_IDS) {
      if (["pile", "timber"].includes(id) && p.level !== 1) continue;
      count++;
      for (const x of sourceComparison(s, id)) {
        // Original one-decimal member-force diagrams / thickness output are rounded. No correction factor is applied.
        assert.ok(
          Math.abs(x.difference) < 0.11,
          `${p.id}/${id}/${x.key}: ${x.difference}`,
        );
      }
      assert.ok(
        Object.values(r[id].results)
          .filter((x) => typeof x === "number")
          .every(Number.isFinite),
      );
    }
  }
  assert.equal(count, 20);
});
test("H-pile direct printed Qu and per-section displacement depths remain independent", () => {
  for (const [id, H, delta] of [
    ["b-left-1", 9.31, 16.8],
    ["c-1", 9.71, 16],
    ["d-1", 8.31, 1.7],
  ]) {
    const r = computeWorkspace(createRealWorkspace(id)).pile;
    near(r.input.ultimateBearingKn, 2118.24);
    near(r.results.allowableBearingKn, 1059.12);
    near(r.results.displacementLimitMm, H * 3);
    near(r.results.displacementMm, delta);
  }
});
test("source D-depth conflict cannot be cleared by geometry confirmation or roundtrip", () => {
  let s = createRealWorkspace("d-1");
  for (const id of MEMBER_IDS) s = confirmGeometry(s, id);
  s = importDesign(exportDesign(s));
  for (const r of Object.values(computeWorkspace(s)))
    assert.equal(r.status, "stale");
  assert.match(makeReport(s), /3\.31 m/);
  assert.match(makeReport(s), /8\.31 m/);
});
test("manual reaction changes origin and exact linked result; preserves source metadata on roundtrip", () => {
  let s = createRealWorkspace("c-2");
  s = updateValue(s, "anchor", "reactionKnPerM", "160");
  s = updateQuantity(s, "anchor", "reactionKnPerM", {
    stage: "CS12 · 재해석",
    evidence: "수동 확인표 p2",
  });
  const q = s.members.anchor.quantities.reactionKnPerM;
  assert.equal(q.origin, "manual_record");
  assert.equal(q.sourceRevision, "2023.06");
  assert.deepEqual(importDesign(exportDesign(s)), s);
  const r = computeWorkspace(s);
  near(r.anchor.results.designForceKn, 288);
  near(r.wale.input.anchorForceKn, r.anchor.results.jackingForceKn);
  const draft = makeDesignDraft(s);
  assert.equal(draft.origin, "calculated");
  assert.equal(draft.source_id, "IC-DESIGN-202306");
  assert.equal(draft.asset_id, "IC-C-RETAINING");
  assert.equal(draft.payload.source_origin, "imported_analysis");
});
test("actual accepted edits show exceeded, geometry-stale and invalid states without losing source", () => {
  let s = updateValue(
    createRealWorkspace(),
    "anchor",
    "reactionKnPerM",
    "1000",
  );
  assert.equal(computeWorkspace(s).anchor.status, "exceeded");
  s = updateValue(createRealWorkspace(), "timber", "thicknessMm", "30");
  assert.equal(computeWorkspace(s).timber.status, "stale");
  s = confirmGeometry(s, "timber");
  assert.equal(computeWorkspace(s).timber.status, "exceeded");
  s = updateValue(createRealWorkspace(), "anchor", "reactionKnPerM", "");
  assert.equal(computeWorkspace(s).anchor.status, "error");
  assert.throws(() => makeDesignDraft(s));
  s = updateQuantity(createRealWorkspace(), "anchor", "reactionKnPerM", {
    evidence: "",
  });
  assert.equal(computeWorkspace(s).anchor.status, "error");
});
test("actual whitelist rejects fixed source geometry and forged unknown preset imports", () => {
  const s = createRealWorkspace();
  assert.throws(() => updateValue(s, "wale", "angleDeg", "40"));
  assert.throws(() => updateValue(s, "pile", "excavationDepthM", "20"));
  assert.throws(() => restoreWorkspace({ ...s, presetId: "unknown" }));
  const forged = structuredClone(s);
  forged.members.anchor.values.reactionKnPerM = "999";
  forged.members.anchor.origins.reactionKnPerM = "imported_analysis";
  assert.equal(
    restoreWorkspace(forged).members.anchor.origins.reactionKnPerM,
    "manual_record",
  );
});
test("real report includes source pages, complete formulas, current section and no synthetic site defaults", () => {
  const s = createRealWorkspace("c-3"),
    html = makeReport(s, "2026-09-21T00:00:00.000Z", "https://example.test");
  assert.match(html, /C-C′/);
  assert.match(html, /p128~131/);
  assert.match(
    html,
    /https:\/\/example.test\/documents\/design-calculation.pdf#page=128/,
  );
  assert.match(html, /35/);
  assert.match(html, /원문 표시값/);
  assert.doesNotMatch(html, /합성 시연|합성 모델|합성 A|A-01|10\.0 m|30°/);
  assert.match(exportDesign(s), /sourceRevision/);
});

test("derived public report keeps source pages without unavailable original links", () => {
  const html = makeReport(
    createRealWorkspace("b-left-1"),
    "2026-09-21T00:00:00Z",
    "https://example.test",
    false,
  );
  assert.match(html, /흙막이계산서 PDF p95~98/);
  assert.match(html, /원본 미포함, 현장 원자료본에서 확인/);
  assert.doesNotMatch(html, /href="[^"]*\/documents\//);
  assert.match(html, /소요 설계축력/);
});
