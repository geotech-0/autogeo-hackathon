import { EMPTY_GPR } from "./real-model.mjs";
import { siteDate } from "../../utils/site-date.mjs";

const slot = (id) => id || "__new";
const snapshot = (draft) =>
  structuredClone({
    model: draft.model,
    event: draft.event,
    editing: draft.editing,
  });

// Browsing saved records never commits edits or discards another record's form.
export function navigateGprDraft(draft, record, { forceSaved = false } = {}) {
  const pendingDrafts = { ...draft.pendingDrafts };
  if (draft.recordId || draft.editing)
    pendingDrafts[slot(draft.recordId)] = snapshot(draft);
  const recordId = record?.id || null;
  const remembered = !forceSaved && pendingDrafts[slot(recordId)];
  const next = remembered || {
    model: structuredClone(record?.payload.model || EMPTY_GPR),
    event: { date: siteDate(), author: "", note: "" },
    editing: !record,
  };
  return { ...draft, ...structuredClone(next), recordId, pendingDrafts };
}

export function committedGprDraft(draft, recordId, model) {
  const pendingDrafts = { ...draft.pendingDrafts };
  delete pendingDrafts[slot(draft.recordId)];
  delete pendingDrafts[slot(recordId)];
  return { ...draft, recordId, model, editing: false, pendingDrafts };
}
