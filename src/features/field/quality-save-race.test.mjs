import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import QualityReview from "./QualityReview.tsx";
import { plateExample } from "./plate-input.mjs";
import {
  writeDraft,
  readDraft,
  saveRecord,
  listRecords,
  listRevisions,
  resetProject,
} from "../../storage/database.ts";

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
const reference = {
  recordId: "",
  test: "plate",
  view: "ps",
  penetration: "1.2",
  criterion: "",
  limit: "",
  note: "",
  author: "",
  holdStage: "",
  workspace: "reference",
};
async function setup(user) {
  await resetProject([]);
  await writeDraft("real-quality-review-v1", {
    ...reference,
    workspace: user ? "user" : "reference",
  });
  if (user) await writeDraft("user-plate-input-v1", plateExample("normal"));
}
async function render(onSave) {
  let renderer;
  const props = { records: await listRecords(), notify() {}, onSave };
  await act(async () => {
    renderer = create(React.createElement(QualityReview, props));
  });
  await act(pause);
  await act(pause);
  return renderer;
}

for (const user of [false, true]) {
  const label = user ? "CSV 검토 저장" : "검토 저장";
  const revised = user ? "CSV 검토 개정 저장" : "검토 개정 저장";
  const key = user ? "user-plate-input-v1" : "real-quality-review-v1";
  test(`${user ? "CSV" : "provided"} quality save retains one identity after DB commit, unmount before response, and repeat save`, async () => {
    await setup(user);
    const committed = deferred(),
      release = deferred();
    let pending;
    let renderer = await render(async (input) => {
      const record = await saveRecord(input);
      committed.resolve(record);
      await release.promise;
      return record;
    });
    await act(async () => {
      pending = button(renderer, label).props.onClick();
      await committed.promise;
    });
    const first = await committed.promise;
    await act(async () => renderer.unmount());
    assert.equal(
      (await readDraft(key)).recordId,
      first.id,
      "the identity must already be durable while the save response is held",
    );
    await act(async () => {
      release.resolve();
      await pending;
    });
    renderer = await render(saveRecord);
    try {
      assert.ok(button(renderer, revised));
      await act(async () => button(renderer, revised).props.onClick());
      const records = await listRecords();
      assert.equal(records.length, 1);
      assert.equal(records[0].id, first.id);
      assert.equal(records[0].revision, 2);
      assert.deepEqual(
        (await listRevisions(first.id)).map((record) => record.revision),
        [2, 1],
      );
      if (user)
        await act(async () => button(renderer, "새 시험 입력").props.onClick());
      else
        await act(async () =>
          renderer.root
            .findAllByType("button")
            .find((node) => text(node).startsWith("말뚝재하시험"))
            .props.onClick(),
        );
      await act(async () => renderer.unmount());
      assert.equal(
        (await readDraft(key)).recordId,
        "",
        "an intentional new test must discard the previous identity",
      );
    } finally {
      if (renderer.toJSON()) await act(async () => renderer.unmount());
    }
  });

  test(`${user ? "CSV" : "provided"} quality failed save retains a retry ID without claiming a saved revision`, async () => {
    await setup(user);
    let reserved;
    let renderer = await render(async (input) => {
      reserved = input.id;
      throw new Error("QA storage unavailable");
    });
    await act(async () => button(renderer, label).props.onClick());
    assert.ok(reserved);
    assert.ok(button(renderer, label));
    assert.equal(button(renderer, revised), undefined);
    assert.equal((await listRecords()).length, 0);
    await act(async () => renderer.unmount());
    renderer = await render(saveRecord);
    try {
      await act(async () => button(renderer, label).props.onClick());
      const records = await listRecords();
      assert.equal(records.length, 1);
      assert.equal(records[0].id, reserved);
      assert.equal(records[0].revision, 1);
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}
