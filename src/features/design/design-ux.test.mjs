import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import {
  writeDraft,
  readDraft,
  saveRecord,
  listRevisions,
} from "../../storage/database.ts";
import { createRealWorkspace } from "./model.mjs";

// This interaction test renders the real page without browser-only CSS or source assets.
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function load(url, context, next) {
    if (url.endsWith('/design.css')) return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  }`),
  import.meta.url,
);
globalThis.__HAS_PROVIDED_ORIGINALS__ = false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { default: DesignPage } = await import("./DesignPage.tsx");
const focused = [];
const collapsedAncestors = new Map();
globalThis.document = {
  getElementById: (id) => ({
    focus: () => focused.push(id),
    scrollIntoView() {},
    closest: () => collapsedAncestors.get(id),
  }),
};
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const buttons = (r, label) =>
  r.root
    .findAllByType("button")
    .filter((node) => textOf(node).trim() === label);
const button = (r, label) => buttons(r, label)[0];
const field = (r, label) => r.root.findByProps({ "aria-label": label });
const click = (node) => act(async () => node.props.onClick());
const change = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
const step = (r, n) =>
  r.root.findByProps({ "aria-label": "검토 단계" }).findAllByType("button")[n];
const tab = (r, id) => r.root.findByProps({ id: `design-member-${id}` });
async function render(props = {}, restore = false) {
  if (!restore)
    await writeDraft("design-real-library-v1", {
      activePresetId: "b-left-1",
      workspaces: { "b-left-1": createRealWorkspace() },
    });
  let r;
  await act(async () => {
    r = create(
      React.createElement(DesignPage, {
        records: [],
        notify() {},
        onSave: async () => {
          throw new Error("Unexpected save");
        },
        ...props,
      }),
      {
        createNodeMock: ({ type, props }) => ({
          focus: () => focused.push(props.id || type),
          scrollIntoView() {},
        }),
      },
    );
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  return r;
}

test("Design save retries keep their per-preset ID without implying success, then survive unmount before response", async () => {
  let release, committed, pending, first;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const persisted = new Promise((resolve) => {
    committed = resolve;
  });
  const records = [],
    attempts = [];
  const props = {
    records,
    notify() {},
    async onSave(draft) {
      attempts.push(draft.id);
      if (attempts.length === 1) throw new Error("QA initial save failure");
      const record = await saveRecord(draft);
      const index = records.findIndex((r) => r.id === record.id);
      if (index < 0) records.push(record);
      else records[index] = record;
      if (!first) {
        first = record;
        committed();
        await response;
      }
      return record;
    },
  };
  let r = await render(props);
  try {
    await click(button(r, "검토안 저장"));
    assert.equal(records.length, 0);
    assert.ok(
      button(r, "검토안 저장"),
      "a reserved ID is not a saved revision",
    );
    assert.equal(button(r, "개정 저장"), undefined);
    await act(async () => {
      pending = button(r, "검토안 저장").props.onClick();
      await persisted;
    });
    await act(async () => r.unmount());
    await act(async () => {
      release();
      await pending;
    });
    assert.equal(
      (await readDraft("design-real-library-v1")).recordIds?.["b-left-1"],
      first.id,
    );
    assert.equal(
      attempts[0],
      first.id,
      "retry reuses the initially reserved ID",
    );
    r = await render(props, true);
    await change(field(r, "흙막이 단면"), "c");
    assert.ok(
      button(r, "검토안 저장"),
      "an untouched preset remains a new review",
    );
    await change(field(r, "흙막이 단면"), "b-left");
    await click(button(r, "개정 저장"));
    assert.equal(records.length, 1);
    assert.equal(records[0].id, first.id);
    assert.equal(records[0].revision, 2);
    assert.equal((await listRevisions(first.id)).length, 2);
    await click(button(r, "새 검토안으로 저장"));
    assert.equal(
      records.length,
      2,
      "an explicit alternative still creates a separate record",
    );
    const alternative = records.find((record) => record.id !== first.id);
    assert.equal(alternative.revision, 1);
    assert.deepEqual(alternative.dependencies, [
      { analysis_id: first.analysis_id, revision: 2 },
    ]);
  } finally {
    release();
    await act(async () => r.unmount());
  }
});

test("blank and non-integer geometry blocks all-member saving; linked wale errors lead to the anchor field", async () => {
  const r = await render();
  try {
    await click(step(r, 1));
    await change(field(r, "어스앵커 강연선 본수"), "");
    assert.equal(button(r, "검토안 저장").props.disabled, true);
    assert.equal(field(r, "어스앵커 강연선 본수").props["aria-invalid"], true);
    assert.match(
      textOf(r.root.findByProps({ className: "design-summary-score" })),
      /2개 부재입력 확인 필요/,
    );
    await click(button(r, "띠장 입력 확인"));
    assert.equal(focused.at(-1), "design-input-anchor-strandCount");
    await change(field(r, "어스앵커 강연선 본수"), "4.5");
    assert.match(textOf(r.root), /강연선 수는 양의 정수/);
    await change(field(r, "어스앵커 강연선 본수"), "13");
    assert.match(textOf(r.root), /1~12 본 소프트웨어 지원범위/);
    await change(field(r, "어스앵커 강연선 본수"), "5");
    assert.equal(button(r, "검토안 저장").props.disabled, false);
    await act(async () =>
      tab(r, "anchor").props.onKeyDown({
        key: "ArrowRight",
        preventDefault() {},
      }),
    );
    assert.equal(tab(r, "wale").props["aria-selected"], true);
    assert.equal(tab(r, "anchor").props.tabIndex, -1);
    assert.equal(tab(r, "wale").props.tabIndex, 0);
    await click(step(r, 2));
    assert.ok(button(r, "앵커 해석값 재확인"));
    assert.equal(button(r, "이 모델의 해석결과로 확인"), undefined);
    await click(button(r, "앵커 해석값 재확인"));
    assert.equal(tab(r, "anchor").props["aria-selected"], true);
    await click(button(r, "이 모델의 해석결과로 확인"));
    assert.doesNotMatch(
      textOf(r.root.findByProps({ id: "design-save-guidance" })),
      /해석 재확인 상태/,
    );
  } finally {
    await act(async () => r.unmount());
  }
});

test("missing analysis evidence opens details and result repair focuses the missing metadata, preserving raw numbers on unit changes", async () => {
  const r = await render();
  try {
    await click(step(r, 2));
    const raw = field(r, "어스앵커 최대 축방향 반력 R′").props.value;
    await change(field(r, "최대 축방향 반력 R′ 단위"), "kN/개");
    assert.equal(field(r, "어스앵커 최대 축방향 반력 R′").props.value, raw);
    assert.match(
      textOf(r.root),
      /단위를 바꿔도 입력 숫자는 자동 변환되지 않습니다/,
    );
    await change(field(r, "최대 축방향 반력 R′ 근거"), "");
    assert.equal(
      field(r, "최대 축방향 반력 R′ 근거").props["aria-invalid"],
      true,
    );
    assert.equal(
      field(r, "어스앵커 최대 축방향 반력 R′").props["aria-invalid"],
      false,
    );
    assert.equal(
      r.root.findByProps({
        className: "design-details design-analysis-evidence",
      }).props.open,
      true,
    );
    await click(step(r, 3));
    const collapsedEvidence = { open: false, parentElement: null };
    collapsedAncestors.set(
      "design-input-anchor-reactionKnPerM-evidence",
      collapsedEvidence,
    );
    await click(button(r, "최대 축방향 반력 R′"));
    assert.equal(focused.at(-1), "design-input-anchor-reactionKnPerM-evidence");
    assert.equal(collapsedEvidence.open, true);
    collapsedAncestors.clear();
    assert.equal(field(r, "최대 축방향 반력 R′ 근거").props.value, "");
    await change(field(r, "최대 축방향 반력 R′ 근거"), "QA 선택 표와 페이지");
    assert.equal(button(r, "검토안 저장").props.disabled, false);
    await click(step(r, 0));
    await change(field(r, "해석 모델 개정"), "");
    await click(step(r, 3));
    assert.ok(button(r, "자료 출처"));
    assert.doesNotMatch(
      textOf(
        r.root.findByProps({
          className: "notice notice-error design-result-errors",
        }),
      ),
      /_source/,
    );
    await click(button(r, "자료 출처"));
    assert.equal(focused.at(-1), "design-source-modelRevision");
  } finally {
    await act(async () => r.unmount());
  }
});

test("saving opens the record list; reloading another location and revising retains the original record contract", async () => {
  const saved = [];
  const props = {
    records: [],
    notify() {},
    onSave: async (draft) => {
      const record = {
        ...draft,
        id: draft.id || "qa-design",
        analysis_id: "qa-analysis",
        revision: saved.length + 1,
        updated_at: "2026-09-21T16:00:00Z",
      };
      saved.push(record);
      return record;
    },
  };
  const r = await render(props);
  try {
    await change(field(r, "검토안 이름"), "QA 설계 사용자 흐름");
    await click(button(r, "검토안 저장"));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].payload.workspace.presetId, "b-left-1");
    assert.deepEqual(Object.keys(saved[0].payload.workspace.members).sort(), [
      "anchor",
      "pile",
      "timber",
      "wale",
    ]);
    assert.equal(focused.at(-1), "h3");
    props.records = [saved[0]];
    await act(async () => r.update(React.createElement(DesignPage, props)));
    await change(field(r, "흙막이 단면"), "c");
    await click(field(r, "QA 설계 사용자 흐름 개정 1 불러오기"));
    assert.equal(field(r, "흙막이 단면").props.value, "b-left");
    assert.equal(focused.at(-1), "h2");
    await click(button(r, "새 개정 저장"));
    assert.equal(saved[1].id, saved[0].id);
    assert.equal(saved[1].revision, 2);
    assert.deepEqual(saved[1].payload.workspace, saved[0].payload.workspace);
  } finally {
    await act(async () => r.unmount());
  }
});
