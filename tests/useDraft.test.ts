import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { useDraft } from "../src/storage/useDraft";
import { getDatabase, readDraft, writeDraft } from "../src/storage/database";

// These tests render the real hook and exercise its asynchronous React effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
type Value = { input: string };
type Hook = ReturnType<typeof useDraft<Value>>;
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
const autosave = () => new Promise((resolve) => setTimeout(resolve, 180));

async function renderDraft(key: string) {
  let current: Hook;
  function Probe() {
    current = useDraft<Value>(key, { input: "initial" });
    return null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  await act(settle);
  return {
    get current() {
      return current!;
    },
    close: () => act(async () => renderer!.unmount()),
  };
}

test("failed draft hydration never overwrites unread saved data; retry restores it and later edits persist", async (t) => {
  const key = "read-failure-regression";
  await writeDraft(key, { input: "previous user draft" });
  let failRead = true;
  let writes = 0;
  const originalGet = IDBObjectStore.prototype.get;
  const originalPut = IDBObjectStore.prototype.put;
  t.mock.method(
    IDBObjectStore.prototype,
    "get",
    function (this: IDBObjectStore, query: IDBValidKey) {
      if (this.name === "drafts" && query === key && failRead)
        throw new Error("simulated read failure");
      return originalGet.call(this, query);
    },
  );
  t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (this: IDBObjectStore, value: unknown, recordKey?: IDBValidKey) {
      if (this.name === "drafts" && recordKey === key) writes++;
      return originalPut.call(this, value, recordKey);
    },
  );
  const probe = await renderDraft(key);
  try {
    assert.equal(
      probe.current[2].ready,
      true,
      "in-memory input remains usable after failure",
    );
    assert.match(probe.current[2].error!, /read failure/);
    await act(async () => probe.current[1]({ input: "unsaved screen edit" }));
    await act(autosave);
    assert.equal(probe.current[0].input, "unsaved screen edit");
    assert.equal(
      writes,
      0,
      "neither initial values nor user edits may replace unread storage",
    );
    await act(async () => probe.current[2].retry());
    await act(settle);
    await act(autosave);
    assert.equal(
      probe.current[0].input,
      "unsaved screen edit",
      "a failed retry must retain the in-memory edit",
    );
    assert.equal(writes, 0);
    failRead = false;
    assert.deepEqual(await readDraft(key), { input: "previous user draft" });
    await act(async () => probe.current[2].retry());
    await act(settle);
    assert.deepEqual(probe.current[0], { input: "previous user draft" });
    assert.equal(probe.current[2].error, null);
    await act(async () => probe.current[1]({ input: "edit after recovery" }));
    await act(autosave);
    assert.deepEqual(await readDraft(key), { input: "edit after recovery" });
    assert.equal(probe.current[2].error, null);
  } finally {
    await probe.close();
  }
});

test("write failure preserves the stored draft and a later successful edit clears the error", async (t) => {
  const key = "write-failure-regression";
  await writeDraft(key, { input: "last saved" });
  let failWrite = true;
  const originalPut = IDBObjectStore.prototype.put;
  t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (this: IDBObjectStore, value: unknown, recordKey?: IDBValidKey) {
      if (this.name === "drafts" && recordKey === key && failWrite)
        throw new Error("simulated write failure");
      return originalPut.call(this, value, recordKey);
    },
  );
  const probe = await renderDraft(key);
  try {
    await act(async () => probe.current[1]({ input: "first attempt" }));
    await act(autosave);
    assert.match(probe.current[2].error!, /write failure/);
    assert.deepEqual(await readDraft(key), { input: "last saved" });
    failWrite = false;
    await act(async () => probe.current[1]({ input: "successful later edit" }));
    await act(autosave);
    assert.deepEqual(await readDraft(key), { input: "successful later edit" });
    assert.equal(probe.current[2].error, null);
  } finally {
    await probe.close();
  }
});

test("late completion from an older autosave cannot clear a newer failure or introduce a stale error", async (t) => {
  const key = "out-of-order-write-feedback";
  await writeDraft(key, { input: "saved" });
  const db = await getDatabase();
  const originalTransaction = db.transaction.bind(db);
  const pending: {
    oncomplete?: () => void;
    onerror?: () => void;
    error: Error | null;
    objectStore: () => { put: () => void };
  }[] = [];
  // Control only transaction completion order; reads still use fake IndexedDB.
  t.mock.method(
    db,
    "transaction",
    (names: string | string[], mode?: IDBTransactionMode) => {
      if (names === "drafts" && mode === "readwrite") {
        const tx = {
          error: null as Error | null,
          objectStore: () => ({ put() {} }),
        };
        pending.push(tx);
        return tx;
      }
      return originalTransaction(names, mode);
    },
  );
  const probe = await renderDraft(key);
  try {
    await act(autosave);
    await act(async () => probe.current[1]({ input: "newer edit" }));
    await act(autosave);
    assert.equal(pending.length, 2);
    await act(async () => {
      pending[1].error = new Error("latest write failed");
      pending[1].onerror?.();
    });
    assert.match(probe.current[2].error!, /latest write failed/);
    await act(async () => pending[0].oncomplete?.());
    assert.match(
      probe.current[2].error!,
      /latest write failed/,
      "older success must not clear the current failure",
    );
    await act(async () => probe.current[1]({ input: "third edit" }));
    await act(autosave);
    await act(async () => probe.current[1]({ input: "fourth edit" }));
    await act(autosave);
    assert.equal(pending.length, 4);
    await act(async () => pending[3].oncomplete?.());
    assert.equal(probe.current[2].error, null);
    await act(async () => {
      pending[2].error = new Error("stale failure");
      pending[2].onerror?.();
    });
    assert.equal(probe.current[2].error, null);
  } finally {
    await probe.close();
  }
});
