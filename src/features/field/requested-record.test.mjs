import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { useRequestedRecord } from "./useRequestedRecord.ts";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("history deep link waits for hydration and applies once without replacing later edits", async () => {
  const opened = [];
  function Probe(props) {
    useRequestedRecord(props.id, props.records, props.ready, (r) =>
      opened.push(r.id),
    );
    return null;
  }
  let root;
  await act(async () => {
    root = create(
      React.createElement(Probe, {
        id: "a",
        records: [{ id: "a" }],
        ready: false,
      }),
    );
  });
  assert.deepEqual(opened, []);
  await act(async () =>
    root.update(
      React.createElement(Probe, {
        id: "a",
        records: [{ id: "a" }],
        ready: true,
      }),
    ),
  );
  assert.deepEqual(opened, ["a"]);
  await act(async () =>
    root.update(
      React.createElement(Probe, {
        id: "a",
        records: [{ id: "a", revision: 2 }, { id: "b" }],
        ready: true,
      }),
    ),
  );
  assert.deepEqual(opened, ["a"]);
  await act(async () =>
    root.update(
      React.createElement(Probe, {
        id: "b",
        records: [{ id: "a" }, { id: "b" }],
        ready: true,
      }),
    ),
  );
  assert.deepEqual(opened, ["a", "b"]);
  await act(async () => root.unmount());
});
