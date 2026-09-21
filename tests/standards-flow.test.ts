import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestInstance } from "react-test-renderer";
import StandardsPage from "../src/components/StandardsPage";
import type { ProjectRecord, ProjectRecordDraft } from "../src/contracts";
import { writeDraft } from "../src/storage/database";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
function content(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(content).join("");
}
const record = (
  id: string,
  payload: Record<string, unknown>,
): ProjectRecord => ({
  id,
  payload,
  site_id: "icheon-xi-deriche",
  zone_id: "IC-EXC",
  stage: "tender",
  status: "pending",
  title: "QA 기준 검토",
  summary: "QA",
  revision: 3,
  source_id: "qa",
  source_revision: "qa",
  analysis_id: id,
  method_version: "qa",
  created_at: "2026-09-22T00:00:00+09:00",
  updated_at: "2026-09-22T00:00:00+09:00",
  origin: "official_reference",
  assumptions: [],
});
async function setup(records: ProjectRecord[], requestedRecordId?: string) {
  await writeDraft("official-standard-review", {
    activeCode: "KDS 21 30 00",
    byCode: {},
  });
  await writeDraft("project-reference-review", {
    activeId: "kds-2020",
    recordIds: {},
  });
  const saved: ProjectRecordDraft[] = [];
  const notify = () => {};
  const onSave = async (draft: ProjectRecordDraft) => {
    saved.push(draft);
    return {
      ...record(draft.id || "new-record", draft.payload),
      ...draft,
      revision: 4,
    } as ProjectRecord;
  };
  let renderer: ReturnType<typeof create>;
  const props = { records, requestedRecordId, notify, onSave };
  await act(async () => {
    renderer = create(createElement(StandardsPage, props));
  });
  await act(settle);
  return {
    get root() {
      return renderer!.root;
    },
    saved,
    refresh: (next: ProjectRecord[]) =>
      act(async () => {
        renderer!.update(
          createElement(StandardsPage, { ...props, records: next }),
        );
      }),
    close: () => act(async () => renderer!.unmount()),
  };
}
test("official criterion history restores the saved edition, edits survive refresh, and save creates a revision", async () => {
  const original = record("official-review", {
    kind: "standard-adoption",
    code: "KCS 21 30 00",
    edition: "2022 QA",
    clause: "2.1 QA",
    memo: "stored evidence",
  });
  const ui = await setup([original], original.id);
  try {
    const edition = () => ui.root.findByProps({ "aria-label": "현장 검토판" });
    assert.equal(edition().props.value, "2022 QA");
    assert.equal(
      ui.root
        .findAllByType("button")
        .find((x) => content(x) === "공식 기준·적용판")!.props["aria-pressed"],
      true,
    );
    await act(async () =>
      edition().props.onChange({ target: { value: "2024 QA edit" } }),
    );
    await ui.refresh([{ ...original }]);
    assert.equal(edition().props.value, "2024 QA edit");
    const save = ui.root
      .findAllByType("button")
      .find((x) => content(x) === "검토 개정 저장")!;
    await act(async () => save.props.onClick());
    assert.equal(ui.saved.length, 1);
    assert.equal(ui.saved[0].id, original.id);
    assert.equal(ui.saved[0].payload.edition, "2024 QA edit");
    assert.equal(ui.saved[0].payload.clause, "2.1 QA");
    assert.equal(ui.saved[0].payload.memo, "stored evidence");
  } finally {
    await ui.close();
  }
});
test("switching official criteria preserves independent drafts and blank edition cannot save", async () => {
  const ui = await setup([]);
  try {
    const edition = () => ui.root.findByProps({ "aria-label": "현장 검토판" });
    const entry = (code: string) =>
      ui.root
        .findAllByType("button")
        .find(
          (x) =>
            x.props.className?.includes("standard-item") &&
            content(x).startsWith(code),
        )!;
    await act(async () =>
      edition().props.onChange({ target: { value: "first draft" } }),
    );
    await act(async () => entry("KCS 21 30 00").props.onClick());
    assert.equal(edition().props.value, "2024");
    await act(async () =>
      edition().props.onChange({ target: { value: "second draft" } }),
    );
    await act(async () => entry("KDS 21 30 00").props.onClick());
    assert.equal(edition().props.value, "first draft");
    await act(async () => edition().props.onChange({ target: { value: " " } }));
    assert.equal(edition().props["aria-invalid"], true);
    assert.equal(
      ui.root
        .findAllByType("button")
        .find((x) => content(x) === "검토 이력에 저장")!.props.disabled,
      true,
    );
  } finally {
    await ui.close();
  }
});
test("project-basis history selects the original reference and revises the same record", async () => {
  const original = record("basis-review", {
    kind: "standard-adoption",
    reference_id: "foundation",
  });
  const ui = await setup([original], original.id);
  try {
    const selected = ui.root
      .findAllByType("button")
      .find(
        (x) => x.props["aria-pressed"] && content(x).includes("기초 지지력"),
      );
    assert.ok(selected);
    const save = ui.root
      .findAllByType("button")
      .find((x) => content(x) === "근거 개정 저장")!;
    await act(async () => save.props.onClick());
    assert.equal(ui.saved[0].id, original.id);
    assert.equal(ui.saved[0].payload.reference_id, "foundation");
    assert.equal(ui.saved[0].payload.pdf_page, 182);
  } finally {
    await ui.close();
  }
});
