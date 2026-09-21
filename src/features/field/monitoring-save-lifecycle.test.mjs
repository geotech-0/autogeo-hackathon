import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import RealMonitoring from "./RealMonitoring.tsx";
import {
  writeDraft,
  readDraft,
  saveRecord,
  listRecords,
  resetProject,
} from "../../storage/database.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise((r) => setTimeout(r, 30));
const text = (n) => (typeof n === "string" ? n : n.children.map(text).join(""));
const button = (r, label) =>
  r.root.findAllByType("button").find((n) => text(n).trim() === label);
const draft = {
  recordId: "",
  sensor: "F-2",
  month: "all",
  metric: "delta",
  note: "",
  author: "",
  importRecordId: "",
  importIssueId: "",
  importCsv: "date,value\n2026-01-01,25\n",
  importSource: "QA delayed save",
  importLocation: "QA isolated test",
  importCriterion: {
    unit: "mm",
    direction: "above",
    limit: "20",
    evidence: "QA only",
    confirmedBy: "QA",
    confirmed: true,
  },
  additionalBySensor: {},
  manualDate: "",
  manualValue: "",
};
async function render(props) {
  let r;
  await act(async () => {
    r = create(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(RealMonitoring, props),
      ),
    );
  });
  await act(settle);
  return r;
}

for (const [name, firstLabel, secondLabel, kind] of [
  ["reported measurement", "검토 저장", "검토 저장", "real_monitoring_review"],
  [
    "additional readings",
    "추가 계측 검토 저장",
    "추가 계측 개정 저장",
    "monitoring_import",
  ],
  [
    "additional readings with issue",
    "초과 → 구역 이슈 등록",
    "초과 이슈에 개정 연결",
    "monitoring_import",
  ],
])
  test(`${name}: navigation before save response preserves the same record and issue IDs`, async () => {
    await resetProject([]);
    await writeDraft("real-monitoring-v1", draft);
    let release, committed;
    const gate = new Promise((r) => {
      release = r;
    });
    const committedGate = new Promise((r) => {
      committed = r;
    });
    let first = true;
    const props = {
      records: [],
      notify() {},
      onSave: async (value) => {
        const record = await saveRecord(value);
        if (first) {
          first = false;
          committed(record);
          await gate;
        }
        return record;
      },
    };
    let r = await render(props),
      pending;
    try {
      await act(async () => {
        pending = button(r, firstLabel).props.onClick();
        await committedGate;
      });
      const initial = (await listRecords()).find(
        (value) => value.payload.kind === kind,
      );
      assert.ok(initial?.id);
      await act(async () => r.unmount());
      await act(settle);
      const persisted = await readDraft("real-monitoring-v1");
      assert.equal(
        kind === "real_monitoring_review"
          ? persisted.pendingRecordId
          : persisted.importPendingRecordId,
        initial.id,
      );
      if (name.endsWith("with issue")) {
        // Return before the old response or refreshed parent records arrive,
        // then save a newer measurement using the reserved review/issue IDs.
        r = await render(props);
        await act(async () =>
          r.root
            .findByProps({ "aria-label": "추가 계측 CSV" })
            .props.onChange({
              target: { value: "date,value\n2026-01-01,30\n" },
            }),
        );
        await act(async () =>
          r.root
            .findByProps({ "aria-label": "추가 계측 기준 확인" })
            .props.onChange({ target: { checked: true } }),
        );
        await act(async () => button(r, firstLabel).props.onClick());
        const currentIssue = (await listRecords()).find(
          (value) => value.payload.kind === "real_field_issue",
        );
        assert.equal(currentIssue.id, persisted.importPendingIssueId);
        assert.equal(currentIssue.payload.monitoringReviewRevision, 2);
        assert.equal(currentIssue.payload.rows[0].value, 30);
        await act(async () => {
          release();
          await pending;
        });
        assert.deepEqual(
          (await listRecords()).find(
            (value) => value.payload.kind === "real_field_issue",
          ),
          currentIssue,
          "the departed save must not replace the newer issue",
        );
      } else {
        // Return before the first response or parent record refresh arrives.
        r = await render(props);
        await act(async () => button(r, firstLabel).props.onClick());
        await act(async () => {
          release();
          await pending;
        });
      }
      const records = await listRecords();
      const reviews = records.filter((value) => value.payload.kind === kind);
      assert.equal(reviews.length, 1);
      assert.equal(reviews[0].id, initial.id);
      assert.equal(reviews[0].revision, 2);
      if (name.endsWith("with issue")) {
        const issues = records.filter(
          (value) => value.payload.kind === "real_field_issue",
        );
        assert.equal(issues.length, 1);
        assert.equal(issues[0].revision, 1);
        assert.equal(issues[0].payload.monitoringReviewId, initial.id);
        assert.equal(issues[0].payload.monitoringReviewRevision, 2);
        assert.equal(issues[0].payload.rows[0].value, 30);
        assert.equal(issues[0].payload.history.length, 1);
        assert.equal(reviews[0].payload.rows[0].value, 30);
      }
    } finally {
      await act(async () => {
        release();
        await pending;
      });
      await act(async () => r.unmount());
    }
  });

test("failed first additional save keeps a retry ID without claiming a saved review", async () => {
  await resetProject([]);
  await writeDraft("real-monitoring-v1", draft);
  let fail = true;
  const props = {
    records: [],
    notify() {},
    onSave: async (value) => {
      if (fail) throw new Error("QA unavailable");
      return saveRecord(value);
    },
  };
  let r = await render(props);
  try {
    await act(async () => button(r, "추가 계측 검토 저장").props.onClick());
    assert.ok(button(r, "추가 계측 검토 저장"));
    assert.equal(button(r, "추가 계측 개정 저장"), undefined);
    await act(async () => r.unmount());
    await act(settle);
    const reserved = (await readDraft("real-monitoring-v1"))
      .importPendingRecordId;
    assert.ok(reserved);
    assert.equal((await listRecords()).length, 0);
    fail = false;
    r = await render(props);
    await act(async () => button(r, "추가 계측 검토 저장").props.onClick());
    assert.equal((await listRecords())[0].id, reserved);
    assert.equal((await listRecords())[0].revision, 1);
  } finally {
    await act(async () => r.unmount());
  }
});

test("a failed issue step preserves its saved review and resumes the reserved issue after navigation", async () => {
  await resetProject([]);
  await writeDraft("real-monitoring-v1", draft);
  let failIssue = true;
  const props = {
    records: [],
    notify() {},
    onSave: async (value) => {
      if (failIssue && value.payload.kind === "real_field_issue")
        throw new Error("QA issue storage unavailable");
      return saveRecord(value);
    },
  };
  let r = await render(props);
  try {
    await act(async () => button(r, "초과 → 구역 이슈 등록").props.onClick());
    const initial = (await listRecords())[0];
    assert.equal(initial.payload.kind, "monitoring_import");
    assert.equal(initial.revision, 1);
    assert.equal((await listRecords()).length, 1);
    await act(async () => r.unmount());
    await act(settle);
    const persisted = await readDraft("real-monitoring-v1");
    assert.equal(persisted.importRecordId, initial.id);
    assert.ok(persisted.importPendingIssueId);
    assert.equal(persisted.importIssueId, "");
    failIssue = false;
    r = await render({ ...props, records: await listRecords() });
    assert.ok(
      r.root
        .findAllByProps({ role: "status" })
        .some((node) =>
          text(node).includes("초과 이슈 연결이 완료되지 않았습니다"),
        ),
    );
    await act(async () => button(r, "초과 → 구역 이슈 등록").props.onClick());
    const records = await listRecords();
    assert.equal(records.length, 2);
    const review = records.find(
      (value) => value.payload.kind === "monitoring_import",
    );
    const issue = records.find(
      (value) => value.payload.kind === "real_field_issue",
    );
    assert.equal(review.id, initial.id);
    assert.equal(review.revision, 2);
    assert.equal(issue.id, persisted.importPendingIssueId);
    assert.equal(issue.revision, 1);
    assert.equal(issue.payload.monitoringReviewId, review.id);
    assert.equal(issue.payload.monitoringReviewRevision, 2);
  } finally {
    await act(async () => r.unmount());
  }
});
