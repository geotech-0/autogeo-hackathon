import { EMPTY_GPR } from "./real-model.mjs";
import { siteDate } from "../../utils/site-date.mjs";

const slot = (id) => id || "__new";
const performedState = (model) =>
  JSON.stringify([
    model.lifecycle,
    model.closed,
    model.archived,
    model.history,
  ]);
const snapshot = (draft) =>
  structuredClone({
    model: draft.model,
    event: draft.event,
    editing: draft.editing,
    pendingRecordId: draft.pendingRecordId,
    sourceRevision: draft.sourceRevision,
  });

// Browsing saved records never commits edits or discards another record's form.
export function navigateGprDraft(draft, record, { forceSaved = false } = {}) {
  const pendingDrafts = { ...draft.pendingDrafts };
  if (
    draft.editing ||
    draft.event.note.trim() ||
    draft.event.author.trim() ||
    draft.event.date !== siteDate()
  )
    pendingDrafts[slot(draft.recordId)] = snapshot(draft);
  else delete pendingDrafts[slot(draft.recordId)];
  const recordId = record?.id || null;
  const remembered = !forceSaved && pendingDrafts[slot(recordId)];
  const saved = {
    model: structuredClone(record?.payload.model || EMPTY_GPR),
    event: { date: siteDate(), author: "", note: "" },
    editing: !record,
    pendingRecordId: undefined,
    sourceRevision: record?.revision,
  };
  // A follow-up note is a draft; merely viewing an old model is not. Keep the
  // note alongside the latest saved lifecycle/history when revisiting a record.
  const next = remembered?.editing
    ? remembered
    : { ...saved, ...(remembered ? { event: remembered.event } : {}) };
  return { ...draft, ...structuredClone(next), recordId, pendingDrafts };
}

export function committedGprDraft(draft, recordId, model, revision) {
  const pendingDrafts = { ...draft.pendingDrafts };
  delete pendingDrafts[slot(draft.recordId)];
  delete pendingDrafts[slot(recordId)];
  return {
    ...draft,
    recordId,
    model,
    editing: false,
    pendingDrafts,
    pendingRecordId: undefined,
    sourceRevision: revision,
  };
}

export function gprDraftConflict(draft, record) {
  if (!draft.editing || !draft.recordId || draft.recordId !== record?.id)
    return false;
  return draft.sourceRevision === undefined
    ? performedState(draft.model) !== performedState(record.payload.model)
    : draft.sourceRevision < record.revision;
}

export function recoverGprDraft(draft, record) {
  if (!record) return draft;
  if (!draft.recordId && draft.pendingRecordId === record.id) {
    const model = structuredClone(record.payload.model);
    const current = { ...draft.model, history: model.history };
    if (JSON.stringify(current) === JSON.stringify(model))
      return committedGprDraft(draft, record.id, model, record.revision);
    // Preserve edits made after returning before the pending save completed.
    const pendingDrafts = { ...draft.pendingDrafts };
    delete pendingDrafts.__new;
    return {
      ...draft,
      model: current,
      recordId: record.id,
      pendingRecordId: undefined,
      sourceRevision: record.revision,
      pendingDrafts,
    };
  }
  // Drafts from older releases have no base revision. Preserve their edits and
  // adopt the current base only when their performed history still agrees.
  if (
    draft.recordId === record.id &&
    draft.editing &&
    draft.sourceRevision === undefined &&
    !gprDraftConflict(draft, record)
  )
    return { ...draft, sourceRevision: record.revision };
  if (
    draft.recordId === record.id &&
    !draft.editing &&
    (draft.sourceRevision === undefined ||
      draft.sourceRevision < record.revision)
  )
    return {
      ...draft,
      model: structuredClone(record.payload.model),
      sourceRevision: record.revision,
    };
  return draft;
}
