import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import QualityReview from "./QualityReview.tsx";
import RealMonitoring from "./RealMonitoring.tsx";
import IssueTracker from "./IssueTracker.tsx";
import {
  writeDraft,
  saveRecord,
  listRecords,
  listRevisions,
  resetProject,
} from "../../storage/database.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const button = (renderer, label) =>
  renderer.root.findAllByType("button").find((node) => textOf(node) === label);
const input = (renderer, label) =>
  renderer.root
    .findAllByType("label")
    .find((node) => textOf(node).startsWith(label))
    .find((node) => node.type === "input" || node.type === "textarea");
const choose = (renderer, label) =>
  renderer.root
    .findAllByType("label")
    .find((node) => textOf(node).startsWith(label))
    .findByType("select");
const change = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
async function render(Component, props) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Component, props));
  });
  await act(settle);
  return renderer;
}

test("quality review saves full precision DCPT inputs/results and history restores them without replacing later edits", async () => {
  const saved = [],
    notices = [];
  const props = {
    records: [],
    notify: (...args) => notices.push(args),
    onSave: async (record) => {
      const result = {
        ...record,
        id: "dcpt-review",
        revision: saved.length + 1,
      };
      saved.push(result);
      return result;
    },
  };
  let renderer = await render(QualityReview, props);
  try {
    await act(async () =>
      renderer.root
        .findAllByType("button")
        .find((b) => textOf(b).startsWith("DCPT"))
        .props.onClick(),
    );
    await change(input(renderer, "관입량"), "1.7");
    await act(async () => button(renderer, " 검토 저장").props.onClick());
    assert.equal(saved.length, 1);
    const calc = saved[0].payload.dcptCalculation;
    assert.equal(calc.penetrationCmPerBlow, 1.7);
    assert.ok(Math.abs(calc.results.ndcpt - 17.647058823529413) < 1e-13);
    assert.ok(Math.abs(calc.results.qa - 277.94117647058823) < 1e-12);
    assert.notEqual(calc.results.qa, Number(calc.results.qa.toFixed(2)));
    const archived = JSON.parse(JSON.stringify(saved[0]));
    await act(async () => renderer.unmount());
    await writeDraft("real-quality-review-v1", {
      recordId: "",
      test: "dcpt",
      view: "ps",
      penetration: "9",
      criterion: "",
      limit: "",
      note: "",
      author: "",
      holdStage: "",
    });
    renderer = await render(QualityReview, {
      ...props,
      records: [archived],
      requestedRecordId: archived.id,
    });
    assert.equal(input(renderer, "관입량").props.value, "1.7");
    await change(input(renderer, "관입량"), "2.4");
    await act(async () =>
      renderer.update(
        React.createElement(QualityReview, {
          ...props,
          records: [{ ...archived, revision: 9 }],
          requestedRecordId: archived.id,
        }),
      ),
    );
    assert.equal(
      input(renderer, "관입량").props.value,
      "2.4",
      "unrelated record refresh must keep dirty input",
    );
    for (const value of ["", "NaN", "1e-320"]) {
      await change(input(renderer, "관입량"), value);
      await act(async () =>
        button(renderer, " 검토 개정 저장").props.onClick(),
      );
      assert.equal(saved.length, 1, "invalid input must never reach onSave");
    }
    assert.ok(notices.some(([message]) => message.includes("관입량")));
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("monitoring save follows actual January/February/all source sets and blocks an empty month", async () => {
  await writeDraft("real-monitoring-v1", {
    recordId: "",
    sensor: "W-2",
    month: "2024-01",
    metric: "delta",
    importCsv: "date,value\n",
    importSource: "",
    manualDate: "",
    manualValue: "",
    note: "",
    author: "",
  });
  const saved = [],
    notices = [];
  const renderer = await render(RealMonitoring, {
    records: [],
    notify: (...args) => notices.push(args),
    onSave: async (record) => {
      saved.push(record);
      return { ...record, id: "monitoring-review" };
    },
  });
  try {
    await act(async () => button(renderer, " 검토 저장").props.onClick());
    assert.equal(saved[0].source_revision, "2024-01, 2024-02");
    assert.equal(saved[0].payload.measurementPeriod.selected, "2024-01");
    assert.equal(saved[0].source_id, "monitoring-01 + monitoring-02");
    assert.equal(
      renderer.root
        .findAllByType("a")
        .find((a) => textOf(a).includes("원문 표")).props.href,
      "/documents/monitoring-02.pdf#page=64",
    );
    assert.match(saved[0].payload.criterionSource, /page=38$/);
    await change(choose(renderer, "측정 기간"), "2024-02");
    await act(async () => button(renderer, " 검토 저장").props.onClick());
    assert.equal(saved[1].source_revision, "2024-02, 2024-03");
    assert.equal(saved[1].source_id, "monitoring-02 + monitoring-03");
    await change(choose(renderer, "측정 기간"), "all");
    await act(async () => button(renderer, " 검토 저장").props.onClick());
    assert.deepEqual(
      saved[2].payload.sourceReports.map((s) => s.id),
      ["monitoring-01", "monitoring-02", "monitoring-03"],
    );
    await act(async () =>
      renderer.root
        .findAllByType("button")
        .find((b) => textOf(b).startsWith("F-2"))
        .props.onClick(),
    );
    await change(choose(renderer, "측정 기간"), "2024-01");
    await act(async () => button(renderer, " 검토 저장").props.onClick());
    assert.equal(saved.length, 3);
    assert.equal(
      renderer.root
        .findAllByType("a")
        .some((a) => textOf(a).includes("원문 표")),
      false,
    );
    assert.ok(
      notices.some(([message]) => message.includes("측정 기록이 없습니다")),
    );
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("issue UI keeps unresolved reinspection open, closes explicitly, and reopens both new and legacy history intact", async () => {
  let record = {
    id: "issue",
    status: "action",
    revision: 2,
    payload: {
      kind: "real_field_issue",
      lifecycle: "action",
      history: [
        {
          stage: "identified",
          date: "2024-03-20",
          author: "담당",
          note: "이상 확인",
        },
        { stage: "action", date: "2024-03-21", author: "담당", note: "조치" },
      ],
    },
  };
  const props = () => ({
    records: [record],
    notify() {},
    onSave: async (next) => {
      record = { ...next, revision: record.revision + 1 };
      return record;
    },
  });
  const renderer = await render(IssueTracker, props());
  const update = () =>
    act(async () =>
      renderer.update(React.createElement(IssueTracker, props())),
    );
  try {
    await change(input(renderer, "수행일"), "2024-03-22");
    await change(input(renderer, "담당자"), "검수자");
    await change(input(renderer, "수행 내용"), "이상 지속, 미해결");
    await act(async () => button(renderer, "재점검 결과 기록").props.onClick());
    assert.equal(record.status, "action");
    assert.equal(record.payload.lifecycle, "reinspection");
    const prior = structuredClone(record.payload.history);
    await update();
    assert.equal(button(renderer, "해결 확인 후 마감").props.disabled, true);
    await change(input(renderer, "수행 내용"), "추가 조치 실시");
    await act(async () => button(renderer, "후속 조치 기록").props.onClick());
    assert.equal(record.payload.lifecycle, "action");
    await update();
    await change(input(renderer, "수행 내용"), "후속 재점검, 이상 해소");
    await act(async () => button(renderer, "재점검 결과 기록").props.onClick());
    await update();
    await change(input(renderer, "수행 내용"), "해결 근거 확인 후 마감");
    await act(async () =>
      renderer.root
        .findByProps({ type: "checkbox" })
        .props.onChange({ target: { checked: true } }),
    );
    await act(async () =>
      button(renderer, "해결 확인 후 마감").props.onClick(),
    );
    assert.equal(record.status, "closed");
    assert.equal(record.payload.lifecycle, "closed");
    assert.deepEqual(record.payload.history.slice(0, prior.length), prior);
    await update();
    await change(input(renderer, "수행 내용"), "후속 이상 접수");
    await act(async () =>
      button(renderer, "후속 조치로 다시 열기").props.onClick(),
    );
    assert.equal(record.status, "action");
    const legacyHistory = [
      {
        stage: "reinspection",
        date: "2024-03-20",
        author: "과거담당",
        note: "과거 자동마감 원문 보존",
      },
    ];
    record = {
      ...record,
      status: "closed",
      payload: {
        ...record.payload,
        lifecycle: "reinspection",
        history: legacyHistory,
      },
    };
    await update();
    await change(input(renderer, "수행 내용"), "과거 마감건 후속 확인");
    await act(async () =>
      button(renderer, "후속 조치로 다시 열기").props.onClick(),
    );
    assert.equal(record.status, "action");
    assert.deepEqual(record.payload.history[0], legacyHistory[0]);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("issue drafts survive issue switching and remount, and only the successfully saved note is cleared", async () => {
  await writeDraft("real-issue-actions-v1", { selected: "", events: {} });
  const records = ["qa-issue-a", "qa-issue-b"].map((id) => ({
    id,
    title: id,
    status: "pending",
    revision: 1,
    payload: {
      kind: "real_field_issue",
      lifecycle: "identified",
      history: [
        {
          stage: "identified",
          date: "2026-01-01",
          author: "QA",
          note: "합성 검수 기록",
        },
      ],
    },
  }));
  let fail = true;
  const saved = [];
  const props = {
    records,
    notify() {},
    onSave: async (record) => {
      if (fail) throw new Error("QA 저장 실패");
      saved.push(record);
      return { ...record, revision: 2 };
    },
  };
  let r = await render(IssueTracker, props);
  try {
    await change(input(r, "수행일"), "2026-01-02");
    await change(input(r, "담당자"), "QA 검수자 A");
    await change(input(r, "수행 내용"), "A 미저장 조치\n상세 두 번째 줄");
    await change(choose(r, "이슈 선택"), records[1].id);
    assert.equal(input(r, "수행 내용").props.value, "");
    await change(input(r, "담당자"), "QA 검수자 B");
    await change(input(r, "수행 내용"), "B 미저장 조치");
    await change(choose(r, "이슈 선택"), records[0].id);
    assert.equal(input(r, "담당자").props.value, "QA 검수자 A");
    assert.equal(
      input(r, "수행 내용").props.value,
      "A 미저장 조치\n상세 두 번째 줄",
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    await act(async () => r.unmount());
    r = await render(IssueTracker, props);
    assert.equal(choose(r, "이슈 선택").props.value, records[0].id);
    assert.equal(
      input(r, "수행 내용").props.value,
      "A 미저장 조치\n상세 두 번째 줄",
    );
    await act(async () => button(r, "조치 기록").props.onClick());
    assert.equal(
      input(r, "수행 내용").props.value,
      "A 미저장 조치\n상세 두 번째 줄",
      "failed save retains unsaved work",
    );
    assert.match(textOf(r.root.findByProps({ role: "alert" })), /QA 저장 실패/);
    fail = false;
    await act(async () => button(r, "조치 기록").props.onClick());
    assert.equal(saved[0].id, records[0].id);
    assert.equal(saved[0].payload.history.length, 2);
    assert.equal(input(r, "수행 내용").props.value, "");
    await change(choose(r, "이슈 선택"), records[1].id);
    assert.equal(input(r, "수행 내용").props.value, "B 미저장 조치");
  } finally {
    await act(async () => r.unmount());
  }
});

test("quality reference repeated saves revise the current review and a different test starts a new record", async () => {
  await resetProject([]);
  await writeDraft("real-quality-review-v1", {
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
  });
  const saved = [];
  function ReviewWithRecords() {
    const [records, setRecords] = React.useState([]);
    return React.createElement(QualityReview, {
      records,
      notify() {},
      // Match App.onSave: commit first, refresh records, then return the result.
      onSave: async (input) => {
        const record = await saveRecord(input);
        setRecords(await listRecords());
        saved.push(record);
        return record;
      },
    });
  }
  const r = await render(ReviewWithRecords, {});
  try {
    await act(async () => button(r, " 검토 저장").props.onClick());
    await change(input(r, "기준 이름"), "QA 합성 참고 비교");
    await change(input(r, "허용 절대변위"), "10");
    await act(async () => button(r, " 검토 개정 저장").props.onClick());
    assert.ok(saved[0].id);
    assert.equal(saved[1].id, saved[0].id);
    assert.deepEqual(
      saved.slice(0, 2).map((record) => record.revision),
      [1, 2],
    );
    assert.deepEqual(
      (await listRevisions(saved[0].id)).map((record) => record.revision),
      [2, 1],
    );
    assert.equal(saved[1].payload.criterion.limitMm, 10);
    await act(async () =>
      r.root
        .findAllByType("button")
        .find((b) => textOf(b).startsWith("DCPT"))
        .props.onClick(),
    );
    await act(async () => button(r, " 검토 저장").props.onClick());
    assert.notEqual(
      saved[2].id,
      saved[0].id,
      "different reference dataset must never overwrite previous review",
    );
    assert.equal(saved[2].revision, 1);
    assert.equal((await listRecords()).length, 2);
    assert.equal(saved[2].payload.datasetId, "dcpt");
  } finally {
    await act(async () => r.unmount());
  }
});
