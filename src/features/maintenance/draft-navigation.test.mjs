import test from "node:test";
import assert from "node:assert/strict";
import {
  navigateGprDraft,
  committedGprDraft,
  recoverGprDraft,
} from "./draft-navigation.mjs";
import { EMPTY_GPR } from "./real-model.mjs";
const fresh = () => ({
  recordId: null,
  model: structuredClone(EMPTY_GPR),
  event: { date: "2026-01-01", author: "", note: "" },
  editing: false,
});
const record = (id) => ({
  id,
  revision: 1,
  payload: {
    model: {
      ...structuredClone(EMPTY_GPR),
      title: `QA ${id}`,
      attachments: [{ id: `file-${id}` }],
      history: [{ date: "2026-01-01", note: "등록 원본" }],
    },
  },
});

test("GPR viewing cache follows newer saved models while retaining only follow-up drafts", () => {
  const a = record("A"),
    b = record("B");
  const newer = structuredClone(a);
  newer.revision = 2;
  newer.payload.model.lifecycle = "confirmation";
  newer.payload.model.history.push({
    date: "2026-01-02",
    note: "새 개정 현장 확인",
  });
  let d = navigateGprDraft(fresh(), a);
  d = navigateGprDraft(d, b);
  d = navigateGprDraft(JSON.parse(JSON.stringify(d)), newer);
  assert.equal(d.model.lifecycle, "confirmation");
  assert.equal(d.model.history.length, 2);
  assert.equal(d.sourceRevision, 2);
  d = navigateGprDraft(fresh(), a);
  d.event.note = "작성 중인 후속 확인";
  d = navigateGprDraft(d, b);
  d = navigateGprDraft(JSON.parse(JSON.stringify(d)), newer);
  assert.equal(d.event.note, "작성 중인 후속 확인");
  assert.equal(d.model.history.length, 2);
  assert.equal(d.sourceRevision, 2);
  d.event = { date: "2026-08-04", author: "", note: "" };
  d = navigateGprDraft(d, b);
  d = navigateGprDraft(d, newer);
  assert.equal(
    d.event.date,
    "2026-08-04",
    "a date-only follow-up edit is also preserved",
  );
  d.editing = true;
  d.model.findings = "저장 전 입력";
  d = navigateGprDraft(d, b);
  const latest = { ...newer, revision: 3 };
  d = navigateGprDraft(d, latest);
  assert.equal(d.model.findings, "저장 전 입력");
  assert.equal(
    d.sourceRevision,
    2,
    "a pending model edit retains the source revision for conflict detection",
  );
});

test("GPR reserved new identity follows the new draft and recovers a completed save without losing later edits", () => {
  let d = navigateGprDraft(fresh(), null);
  d.pendingRecordId = "new-reserved";
  d.model.title = "새 조사";
  d = navigateGprDraft(d, record("A"));
  assert.equal(d.pendingRecordId, undefined);
  d = navigateGprDraft(JSON.parse(JSON.stringify(d)), null);
  assert.equal(d.pendingRecordId, "new-reserved");
  const saved = {
    id: "new-reserved",
    revision: 1,
    payload: {
      model: {
        ...structuredClone(d.model),
        history: [{ date: "2026-01-01", note: "등록" }],
      },
    },
  };
  const recovered = recoverGprDraft(d, saved);
  assert.equal(recovered.recordId, saved.id);
  assert.equal(recovered.editing, false);
  assert.equal(recovered.pendingRecordId, undefined);
  assert.equal(recovered.pendingDrafts.__new, undefined);
  d.model.findings = "돌아온 뒤 추가한 내용";
  const edited = recoverGprDraft(d, saved);
  assert.equal(edited.model.findings, d.model.findings);
  assert.equal(edited.model.history.length, 1);
  assert.equal(edited.recordId, saved.id);
  assert.equal(edited.editing, true);
  assert.equal(
    recoverGprDraft({ ...recovered, sourceRevision: 2 }, saved).sourceRevision,
    2,
    "temporarily stale parent props must never downgrade a just-committed revision",
  );
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
