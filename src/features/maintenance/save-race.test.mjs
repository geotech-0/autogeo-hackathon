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
  listRecords,
  listRevisions,
  resetProject,
} from "../../storage/database.ts";
import { saveAttachment } from "../../storage/attachments.ts";
import { EMPTY_GPR } from "./real-model.mjs";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }; return next(url, context); }`,
    ),
  import.meta.url,
);
const { default: MaintenancePage } = await import("./MaintenancePage.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
const text = (node) =>
  typeof node === "string" ? node : node.children.map(text).join("");
const button = (renderer, label) =>
  renderer.root
    .findAllByType("button")
    .find((node) => text(node).trim() === label);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function setup() {
  await resetProject([]);
  const attachment = await saveAttachment(
    new File(["QA original"], "survey.txt", { type: "text/plain" }),
  );
  await writeDraft("real-maintenance-v1", {
    recordId: null,
    editing: true,
    event: { date: "2026-01-02", author: "", note: "" },
    model: {
      ...structuredClone(EMPTY_GPR),
      title: "QA 조사",
      asset: "관리도로",
      line: "L1",
      surveyDate: "2026-01-01",
      interpreter: "QA",
      location: "북측",
      findings: "반사 이상 후보",
      followUp: "현장 확인",
      attachments: [attachment],
    },
  });
}
async function render(onSave) {
  let renderer;
  const props = { records: await listRecords(), notify() {}, onSave };
  await act(async () => {
    renderer = create(React.createElement(MaintenancePage, props));
  });
  await act(pause);
  return renderer;
}

test("GPR first save recovers its committed identity after unmount before response and saves revision two", async () => {
  await setup();
  const committed = deferred(),
    release = deferred();
  let pending;
  let renderer = await render(async (input) => {
    const saved = await saveRecord(input);
    committed.resolve(saved);
    await release.promise;
    return saved;
  });
  await act(async () => {
    pending = button(renderer, "조사 정보 저장").props.onClick();
    await committed.promise;
  });
  const first = await committed.promise;
  await act(async () => renderer.unmount());
  assert.equal(
    (await readDraft("real-maintenance-v1")).pendingRecordId,
    first.id,
  );
  await act(async () => {
    release.resolve();
    await pending;
  });
  renderer = await render(saveRecord);
  try {
    assert.ok(
      button(renderer, "조사 정보 수정"),
      "the committed record is recovered as saved when returning",
    );
    await act(async () => button(renderer, "조사 정보 수정").props.onClick());
    await act(async () => button(renderer, "조사 정보 저장").props.onClick());
    const records = await listRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].id, first.id);
    assert.equal(records[0].revision, 2);
    assert.deepEqual(
      (await listRevisions(first.id)).map((r) => r.revision),
      [2, 1],
    );
    await act(async () => button(renderer, "조사 등록").props.onClick());
    await act(async () => renderer.unmount());
    const fresh = await readDraft("real-maintenance-v1");
    assert.equal(fresh.recordId, null);
    assert.equal(fresh.pendingRecordId, undefined);
    assert.equal(fresh.model.title, "");
  } finally {
    if (renderer.toJSON()) await act(async () => renderer.unmount());
  }
});

test("GPR failed first save retains a retry identity without displaying saved-record actions", async () => {
  await setup();
  let id;
  let renderer = await render(async (input) => {
    id = input.id;
    throw new Error("QA record save failed");
  });
  await act(async () => button(renderer, "조사 정보 저장").props.onClick());
  assert.ok(id);
  assert.equal(button(renderer, "보관"), undefined);
  assert.equal(button(renderer, "조사 정보 수정"), undefined);
  assert.ok(button(renderer, "조사 정보 저장"));
  assert.equal((await listRecords()).length, 0);
  await act(async () => renderer.unmount());
  renderer = await render(saveRecord);
  try {
    await act(async () => button(renderer, "조사 정보 저장").props.onClick());
    const records = await listRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].id, id);
    assert.equal(records[0].revision, 1);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("GPR keeps edited input but blocks overwriting a newer imported lifecycle until saved data is explicitly reloaded", async () => {
  await setup();
  let saveCalls = 0;
  const onSave = async (input) => {
    saveCalls++;
    return saveRecord(input);
  };
  const renderer = await render(onSave);
  try {
    await act(async () => button(renderer, "조사 정보 저장").props.onClick());
    const [first] = await listRecords();
    await act(async () =>
      renderer.update(
        React.createElement(MaintenancePage, {
          records: [first],
          notify() {},
          onSave,
        }),
      ),
    );
    await act(async () => button(renderer, "조사 정보 수정").props.onClick());
    const findings = () =>
      renderer.root
        .findAllByType("label")
        .find((node) => text(node).startsWith("해석 결과"))
        .findByType("textarea");
    await act(async () =>
      findings().props.onChange({ target: { value: "작성 중인 추가 관찰" } }),
    );
    const updated = await saveRecord({
      ...first,
      payload: {
        ...first.payload,
        model: {
          ...first.payload.model,
          lifecycle: "confirmation",
          history: [
            ...first.payload.model.history,
            {
              stage: "confirmation",
              date: "2026-01-02",
              author: "QA",
              note: "다른 창에서 확인 완료",
            },
          ],
        },
      },
    });
    await act(async () =>
      renderer.update(
        React.createElement(MaintenancePage, {
          records: [updated],
          notify() {},
          onSave,
        }),
      ),
    );
    assert.equal(findings().props.value, "작성 중인 추가 관찰");
    assert.ok(button(renderer, "현재 입력 대신 최신 저장본 불러오기"));
    await act(async () => button(renderer, "조사 정보 저장").props.onClick());
    assert.equal(
      saveCalls,
      1,
      "the obsolete editor must not call the save API",
    );
    assert.equal((await listRecords())[0].revision, 2);
    await act(async () =>
      button(renderer, "현재 입력 대신 최신 저장본 불러오기").props.onClick(),
    );
    assert.equal(findings().props.value, first.payload.model.findings);
    assert.ok(button(renderer, "조사 정보 수정"));
    await act(async () => renderer.unmount());
    const restored = await readDraft("real-maintenance-v1");
    assert.equal(restored.model.lifecycle, "confirmation");
    assert.equal(restored.model.history.length, 2);
    assert.equal(restored.sourceRevision, 2);
  } finally {
    if (renderer.toJSON()) await act(async () => renderer.unmount());
  }
});

test("GPR legacy editing drafts adopt a matching base but preserve and block conflicting saved history", async (t) => {
  for (const changed of [false, true]) {
    await t.test(
      changed ? "newer performed history" : "unchanged performed history",
      async () => {
        await setup();
        const initial = await readDraft("real-maintenance-v1");
        const first = await saveRecord({
          stage: "maintenance",
          status: "pending",
          title: initial.model.title,
          summary: "QA legacy draft",
          origin: "imported_analysis",
          payload: {
            kind: "real_gpr",
            model: {
              ...initial.model,
              history: [
                {
                  stage: "survey",
                  date: "2026-01-01",
                  author: "QA",
                  note: "최초 등록",
                },
              ],
            },
            attachment_ids: initial.model.attachments.map((file) => file.id),
          },
        });
        if (changed)
          await saveRecord({
            ...first,
            payload: {
              ...first.payload,
              model: {
                ...first.payload.model,
                lifecycle: "confirmation",
                history: [
                  ...first.payload.model.history,
                  {
                    stage: "confirmation",
                    date: "2026-01-02",
                    author: "QA",
                    note: "최신 저장본의 확인",
                  },
                ],
              },
            },
          });
        await writeDraft("real-maintenance-v1", {
          ...initial,
          recordId: first.id,
          model: {
            ...first.payload.model,
            findings: "이전 버전에서 작성한 미저장 입력",
          },
        });
        let calls = 0;
        const renderer = await render(async (input) => {
          calls++;
          return saveRecord(input);
        });
        try {
          const findings = renderer.root
            .findAllByType("label")
            .find((node) => text(node).startsWith("해석 결과"))
            .findByType("textarea");
          assert.equal(
            findings.props.value,
            "이전 버전에서 작성한 미저장 입력",
          );
          assert.equal(
            Boolean(button(renderer, "현재 입력 대신 최신 저장본 불러오기")),
            changed,
          );
          await act(async () =>
            button(renderer, "조사 정보 저장").props.onClick(),
          );
          assert.equal(calls, changed ? 0 : 1);
          const [saved] = await listRecords();
          assert.equal(saved.revision, 2);
          assert.equal(saved.payload.model.history.length, changed ? 2 : 1);
          await act(async () => renderer.unmount());
          const persisted = await readDraft("real-maintenance-v1");
          assert.equal(
            persisted.model.findings,
            "이전 버전에서 작성한 미저장 입력",
          );
          assert.equal(persisted.sourceRevision, changed ? undefined : 2);
        } finally {
          if (renderer.toJSON()) await act(async () => renderer.unmount());
        }
      },
    );
  }
});
