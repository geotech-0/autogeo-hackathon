import test from "node:test";
import assert from "node:assert/strict";
import { navigateGprDraft, committedGprDraft } from "./draft-navigation.mjs";
import { EMPTY_GPR } from "./real-model.mjs";
const fresh = () => ({
  recordId: null,
  model: structuredClone(EMPTY_GPR),
  event: { date: "2026-01-01", author: "", note: "" },
  editing: false,
});
const record = (id) => ({
  id,
  payload: {
    model: {
      ...structuredClone(EMPTY_GPR),
      title: `QA ${id}`,
      attachments: [{ id: `file-${id}` }],
      history: [{ date: "2026-01-01", note: "등록 원본" }],
    },
  },
});

test("GPR new and existing drafts remain separate across record navigation and JSON persistence", () => {
  const a = record("A"),
    b = record("B");
  let d = navigateGprDraft(fresh(), null);
  d.model.title = "QA 새 조사 미저장";
  d.model.attachments = [{ id: "new-file" }];
  d = navigateGprDraft(d, a);
  d.editing = true;
  d.model.findings = "QA A 수정 중";
  d.event.note = "QA A 조치 초안";
  d = navigateGprDraft(d, b);
  d.event.note = "QA B 조치 초안";
  d = navigateGprDraft(JSON.parse(JSON.stringify(d)), a);
  assert.equal(d.model.findings, "QA A 수정 중");
  assert.equal(d.event.note, "QA A 조치 초안");
  assert.equal(d.editing, true);
  assert.equal(
    a.payload.model.findings,
    "",
    "saved source record is immutable while editing",
  );
  d = navigateGprDraft(d, null);
  assert.equal(d.model.title, "QA 새 조사 미저장");
  assert.deepEqual(d.model.attachments, [{ id: "new-file" }]);
  d = navigateGprDraft(d, b);
  assert.equal(d.event.note, "QA B 조치 초안");
});

test("GPR successful save discards only that stale draft and explicit history load restores saved data", () => {
  const a = record("A"),
    b = record("B");
  let d = navigateGprDraft(fresh(), a);
  d.model.findings = "QA A 미저장";
  d = navigateGprDraft(d, b);
  d.event.note = "QA B 보존";
  d = navigateGprDraft(d, a, { forceSaved: true });
  assert.equal(d.model.findings, "");
  assert.equal(d.editing, false);
  d = navigateGprDraft(d, null);
  d.model.title = "QA 새 조사 저장";
  const saved = structuredClone(d.model);
  d = committedGprDraft(d, "NEW", saved);
  assert.equal(d.pendingDrafts.__new, undefined);
  d = navigateGprDraft(d, null);
  assert.equal(
    d.model.title,
    "",
    "start a fresh new investigation after its predecessor was saved",
  );
  d = navigateGprDraft(d, b);
  assert.equal(d.event.note, "QA B 보존");
  assert.deepEqual(d.model.history, b.payload.model.history);
});
