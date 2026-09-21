import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestInstance } from "react-test-renderer";
import StandardsPage from "../src/components/StandardsPage";
import type { ProjectRecord, ProjectRecordDraft } from "../src/contracts";
import {
  writeDraft,
  saveRecord,
  listRecords,
  resetProject,
} from "../src/storage/database";
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

for (const scope of ["official", "project"] as const) {
  for (const published of [true, false]) {
    test(`${scope} committed save survives departure with ${published ? "refreshed" : "still empty"} record props and resumes as the same record revision`, async () => {
      await resetProject([]);
      await writeDraft("official-standard-review", {
        activeCode: "KDS 21 30 00",
        byCode: {},
      });
      await writeDraft("project-reference-review", {
        activeId: "kds-2020",
        recordIds: {},
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      const onSave = async (draft: ProjectRecordDraft) => {
        const committed = await saveRecord(draft);
        if (first) {
          first = false;
          await gate;
        }
        return committed;
      };
      const props = { records: [] as ProjectRecord[], onSave, notify() {} };
      let renderer!: ReturnType<typeof create>;
      const button = (label: string) =>
        renderer.root
          .findAllByType("button")
          .find((item) => content(item).trim() === label)!;
      const render = async (records: ProjectRecord[]) => {
        await act(async () => {
          renderer = create(
            createElement(StandardsPage, { ...props, records }),
          );
        });
        await act(settle);
        if (scope === "official")
          await act(async () => button("공식 기준·적용판").props.onClick());
      };
      const initialLabel =
        scope === "official" ? "검토 이력에 저장" : "검토 근거로 저장";
      const revisionLabel =
        scope === "official" ? "검토 개정 저장" : "근거 개정 저장";
      await render([]);
      let pending!: Promise<void>;
      try {
        if (scope === "official")
          await act(async () =>
            renderer.root
              .findByProps({ "aria-label": "현장 검토판" })
              .props.onChange({ target: { value: "QA 별도 확인판" } }),
          );
        await act(async () => {
          pending = button(initialLabel).props.onClick();
          await settle();
        });
        const firstRecords = await listRecords();
        assert.equal(
          firstRecords.length,
          1,
          "the record must already be committed before navigating away",
        );
        await act(async () => renderer.unmount());
        if (published)
          await act(async () => {
            release();
            await pending;
          });
        await render(published ? firstRecords : []);
        const resumedLabel = published ? revisionLabel : "저장 재시도";
        assert.ok(
          button(resumedLabel),
          "returning must retain the same identity even before record props refresh",
        );
        if (!published)
          assert.equal(
            button(revisionLabel),
            undefined,
            "a provisional ID must not claim a confirmed saved revision",
          );
        if (scope === "official")
          assert.equal(
            renderer.root.findByProps({ "aria-label": "현장 검토판" }).props
              .value,
            "QA 별도 확인판",
          );
        await act(async () => button(resumedLabel).props.onClick());
        const finalRecords = await listRecords();
        assert.equal(finalRecords.length, 1);
        assert.equal(finalRecords[0].id, firstRecords[0].id);
        assert.equal(finalRecords[0].revision, 2);
      } finally {
        await act(async () => {
          release();
          await pending;
        });
        await act(async () => renderer.unmount());
      }
    });
  }
}
