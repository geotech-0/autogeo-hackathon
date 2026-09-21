import test from "node:test";
import assert from "node:assert/strict";
import { makeRecord, validateArchive } from "../src/storage/validation.mjs";
const draft = {
  stage: "design",
  title: "앵커 검토",
  status: "pass",
  summary: "정상 합성 사례",
  payload: { Rmax: 40, Jf: 105.3963 },
  dependencies: [{ analysis_id: "anchor-a", revision: 1 }],
};
const archive = (record) => ({
  schema_version: 1,
  site_id: "icheon-xi-deriche",
  records: [record],
});
test("stored result retains numeric input, source and dependency revision across JSON export/import", () => {
  const record = makeRecord(draft);
  const restored = validateArchive(JSON.parse(JSON.stringify(archive(record))))
    .records[0];
  assert.equal(restored.payload.Rmax, 40);
  assert.equal(restored.payload.Jf, 105.3963);
  assert.equal(restored.source_id, "icheon-user-record");
  assert.deepEqual(restored.dependencies, [
    { analysis_id: "anchor-a", revision: 1 },
  ]);
  assert.equal(restored.origin, "manual_record");
});
test("updating a record increments revision and retains identity, analysis and creation time", () => {
  const before = makeRecord(draft);
  const after = makeRecord(
    {
      ...draft,
      id: before.id,
      status: "stale",
      payload: { Rmax: 80, Jf: 210 },
    },
    before,
  );
  assert.equal(after.revision, 2);
  assert.equal(after.created_at, before.created_at);
  assert.equal(after.analysis_id, before.analysis_id);
  assert.equal(after.status, "stale");
  assert.equal(before.payload.Rmax, 40);
});
test("official standard metadata remains reference data and pending through archive roundtrip", () => {
  const record = makeRecord({
    ...draft,
    stage: "tender",
    status: "pending",
    origin: "official_reference",
    source_id: "official-KCS-21-30-00",
    source_revision: "2024-09-27",
    payload: {
      kind: "standard-adoption",
      clause: null,
      latest_status: "unverified",
    },
  });
  const restored = validateArchive(JSON.parse(JSON.stringify(archive(record))))
    .records[0];
  assert.equal(restored.origin, "official_reference");
  assert.equal(restored.status, "pending");
  assert.equal(restored.payload.clause, null);
  assert.equal(restored.payload.latest_status, "unverified");
});
test("rejects non-finite nested calculation output before successful storage", () => {
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(
      () => makeRecord({ ...draft, payload: { steps: [{ result: value }] } }),
      /유효하지 않은/,
    );
});
test("rejects cross-site, corrupt dates, missing provenance and unknown status", () => {
  const original = makeRecord(draft);
  for (const patch of [
    { site_id: "other-site" },
    { created_at: "not-a-date" },
    { source_id: "" },
    { revision: 0 },
    { status: "always-pass" },
    { dependencies: [{ analysis_id: "a", revision: -1 }] },
  ])
    assert.throws(() => validateArchive(archive({ ...original, ...patch })));
});
test("rejects duplicate IDs and unsupported archives before any import", () => {
  const r = makeRecord(draft);
  assert.throws(
    () =>
      validateArchive({
        schema_version: 1,
        site_id: "icheon-xi-deriche",
        records: [r, r],
      }),
    /중복/,
  );
  assert.throws(() => validateArchive({ ...archive(r), schema_version: 2 }));
});
test("import produces a detached copy; changing imported payload does not mutate source archive", () => {
  const original = archive(makeRecord(draft));
  const imported = validateArchive(original);
  imported.records[0].payload.Rmax = 90;
  assert.equal(original.records[0].payload.Rmax, 40);
});
