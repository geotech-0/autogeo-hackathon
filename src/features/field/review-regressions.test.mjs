import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import QualityReview from "./QualityReview.tsx";
import RealMonitoring from "./RealMonitoring.tsx";
import IssueTracker from "./IssueTracker.tsx";
import { writeDraft } from "../../storage/database.ts";

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
    .findByType("input");
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
      await act(async () => button(renderer, " 검토 저장").props.onClick());
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
