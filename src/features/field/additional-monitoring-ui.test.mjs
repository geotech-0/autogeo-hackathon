import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import RealMonitoring from "./RealMonitoring.tsx";
import RealChart from "./RealChart.tsx";
import { readDraft, writeDraft } from "../../storage/database.ts";
import { SITE } from "../../contracts/index.ts";
import { ADDITIONAL_MONITORING_METHOD } from "./additional-monitoring.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const button = (r, label) =>
  r.root.findAllByType("button").find((n) => textOf(n) === label);
const field = (r, label) => r.root.findByProps({ "aria-label": label });
const labelInput = (r, label) =>
  r.root
    .findAllByType("label")
    .find((n) => textOf(n).startsWith(label))
    .findByType("input");
const change = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
const confirm = (r) =>
  act(async () =>
    field(r, "추가 계측 기준 확인").props.onChange({
      target: { checked: true },
    }),
  );
const blank = {
  recordId: "",
  sensor: "F-2",
  month: "all",
  metric: "delta",
  importCsv: "date,value\n",
  importSource: "",
  manualDate: "",
  manualValue: "",
  note: "",
  author: "",
};
async function render(props) {
  let r;
  await act(async () => {
    r = create(React.createElement(RealMonitoring, props));
  });
  await act(settle);
  return r;
}
async function setCriterion(r, direction = "absolute", limit = "20") {
  for (const [label, value] of [
    ["추가 계측 단위", "mm"],
    ["추가 계측 평가 방향", direction],
    ["추가 계측 기준값", limit],
    ["추가 계측 기준 근거", "QA 합성 기준"],
    ["추가 계측 기준 확인자", "QA 검수자"],
  ])
    await change(field(r, label), value);
  await confirm(r);
}

test("additional manual rows save pending until confirmed, then create a zone issue and restore exact review revisions", async () => {
  await writeDraft("real-monitoring-v1", blank);
  const saved = [],
    notices = [];
  const props = {
    records: [],
    notify: (...v) => notices.push(v),
    onSave: async (record) => {
      const previous = saved.filter((r) => r.id === record.id).at(-1);
      const result = {
        ...record,
        id: record.id || `qa-${saved.length + 1}`,
        revision: previous ? previous.revision + 1 : 1,
        analysis_id: "qa-analysis",
        assumptions: record.assumptions || [],
      };
      saved.push(result);
      return result;
    },
  };
  let r = await render(props);
  try {
    await change(labelInput(r, "원본·측정 기록 이름"), "QA 합성 수동 입력");
    for (const [date, value] of [
      ["2026-01-01", "-20"],
      ["2026-01-02", "20.01"],
    ]) {
      await change(labelInput(r, "측정일"), date);
      await change(labelInput(r, "측정값"), value);
      await act(async () => button(r, "행 추가").props.onClick());
    }
    assert.equal(button(r, "초과 → 구역 이슈 등록"), undefined);
    await act(async () => button(r, "추가 2행 보류 저장").props.onClick());
    assert.equal(saved[0].status, "pending");
    assert.equal(saved[0].payload.criteriaConfirmed, false);
    assert.equal(saved[0].payload.unit, null);
    await setCriterion(r);
    await act(async () => button(r, "초과 → 구역 이슈 등록").props.onClick());
    assert.equal(saved.length, 3);
    const review = saved[1],
      issue = saved[2];
    assert.equal(review.id, saved[0].id);
    assert.equal(review.revision, 2);
    assert.equal(review.status, "exceeded");
    assert.equal(issue.payload.monitoringReviewId, review.id);
    assert.equal(issue.payload.monitoringReviewRevision, 2);
    assert.equal(issue.zone_id, SITE.zone_id);
    assert.equal(issue.asset_id, "F-2");
    assert.equal(issue.status, "exceeded");
    assert.equal(issue.payload.evaluation.exceededCount, 1);
    assert.equal(issue.payload.history[0].author, "QA 검수자");
    assert.deepEqual(issue.dependencies, [
      { analysis_id: "qa-analysis", revision: 2 },
    ]);
    const archived = JSON.parse(JSON.stringify(review));
    await act(async () => r.unmount());
    await writeDraft("real-monitoring-v1", {
      ...blank,
      importCsv: "date,value\n2026-01-01,999",
    });
    r = await render({
      ...props,
      records: [archived, issue],
      requestedRecordId: archived.id,
    });
    assert.equal(
      field(r, "추가 계측 CSV").props.value,
      archived.payload.rawCsv,
    );
    assert.equal(field(r, "추가 계측 기준값").props.value, "20");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, true);
    assert.ok(button(r, "추가 계측 개정 저장"));
    await change(field(r, "추가 계측 기준값"), "21");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, false);
    await act(async () =>
      r.update(
        React.createElement(RealMonitoring, {
          ...props,
          records: [{ ...archived, revision: 9 }, issue],
          requestedRecordId: archived.id,
        }),
      ),
    );
    assert.equal(
      field(r, "추가 계측 기준값").props.value,
      "21",
      "record refresh preserves dirty input",
    );
    await confirm(r);
    await act(async () => button(r, "추가 계측 개정 저장").props.onClick());
    assert.equal(saved.at(-1).id, archived.id);
    assert.equal(saved.at(-1).revision, 3);
    assert.equal(saved.at(-1).status, "pass");
    assert.equal(saved.at(-1).payload.method, ADDITIONAL_MONITORING_METHOD);
  } finally {
    await act(async () => r.unmount());
  }
});

test("legacy imports stay pending and a different sensor starts without their CSV, criteria or IDs", async () => {
  await writeDraft("real-monitoring-v1", blank);
  const saved = [];
  const legacy = {
    id: "legacy-import",
    asset_id: "F-2",
    payload: {
      kind: "monitoring_import",
      sensorId: "F-2",
      rawCsv: "date,value\n2026-01-01,999",
      source: "legacy",
      unit: "m³",
      criteriaConfirmed: false,
    },
  };
  const props = {
    records: [legacy],
    requestedRecordId: legacy.id,
    notify() {},
    onSave: async (record) => {
      saved.push(record);
      return { ...record, id: record.id || "new", revision: 1 };
    },
  };
  const r = await render(props);
  try {
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, false);
    assert.equal(field(r, "추가 계측 단위").props.value, "");
    await act(async () => button(r, "추가 계측 개정 저장").props.onClick());
    assert.equal(saved[0].id, legacy.id);
    assert.equal(saved[0].status, "pending");
    await setCriterion(r);
    await act(async () =>
      r.root
        .findAllByType("button")
        .find((b) => textOf(b).startsWith("W-2"))
        .props.onClick(),
    );
    assert.equal(field(r, "추가 계측 CSV").props.value, "date,value\n");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, false);
    assert.equal(field(r, "추가 계측 단위").props.value, "");
    assert.equal(field(r, "추가 계측 기준값").props.value, "");
    assert.equal(labelInput(r, "원본·측정 기록 이름").props.value, "");
    assert.equal(button(r, "추가 계측 개정 저장"), undefined);
    await change(field(r, "추가 계측 CSV"), "date,value\n2026-01-01,0");
    await change(labelInput(r, "원본·측정 기록 이름"), "QA 새 W-2");
    await act(async () => button(r, "추가 1행 보류 저장").props.onClick());
    assert.equal(saved.at(-1).id, undefined);
    assert.equal(saved.at(-1).asset_id, "W-2");
  } finally {
    await act(async () => r.unmount());
  }
});

test("CSV/source edits revoke confirmation and invalid confirmed units or evidence never reach storage", async () => {
  await writeDraft("real-monitoring-v1", {
    ...blank,
    importCsv: "date,value\n2026-01-01,21",
    importSource: "QA CSV",
  });
  const saved = [],
    notices = [];
  const r = await render({
    records: [],
    notify: (...x) => notices.push(x),
    onSave: async (record) => {
      saved.push(record);
      return { ...record, id: "new", revision: 1 };
    },
  });
  try {
    await setCriterion(r);
    assert.ok(button(r, "초과 → 구역 이슈 등록"));
    await change(field(r, "추가 계측 CSV"), "date,value\n2026-01-01,22");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, false);
    assert.equal(button(r, "초과 → 구역 이슈 등록"), undefined);
    await confirm(r);
    await change(labelInput(r, "원본·측정 기록 이름"), "다른 출처");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, false);
    for (const key of ["추가 계측 단위", "추가 계측 기준 근거"]) {
      await setCriterion(r);
      await change(field(r, key), "");
      await confirm(r);
      const save = button(r, "추가 계측 검토 저장");
      assert.equal(save.props.disabled, true);
      assert.ok(
        r.root
          .findAllByType(RealChart)
          .at(-1)
          .props.points.every((p) => p.detail.includes("오류 확인 필요")),
      );
      await act(async () => save.props.onClick());
      assert.equal(saved.length, 0);
    }
    assert.ok(notices.length >= 2);
  } finally {
    await act(async () => r.unmount());
  }
});

test("an issue save failure reports the saved review and retry retains its ID", async () => {
  await writeDraft("real-monitoring-v1", {
    ...blank,
    importCsv: "date,value\n2026-01-01,21",
    importSource: "QA CSV",
  });
  const saved = [],
    notices = [];
  let failIssue = true;
  const r = await render({
    records: [],
    notify: (...args) => notices.push(args),
    onSave: async (record) => {
      if (record.payload.kind === "real_field_issue" && failIssue) {
        failIssue = false;
        throw new Error("QA 이슈 저장 실패");
      }
      const previous = saved.filter((x) => x.id === record.id).at(-1);
      const result = {
        ...record,
        id:
          record.id ||
          (record.payload.kind === "real_field_issue" ? "issue" : "review"),
        revision: previous ? previous.revision + 1 : 1,
        analysis_id: "qa-analysis",
      };
      saved.push(result);
      return result;
    },
  });
  try {
    await setCriterion(r);
    await act(async () => button(r, "초과 → 구역 이슈 등록").props.onClick());
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, "review");
    assert.ok(
      notices.some(([message]) => message.includes("추가 계측은 저장했습니다")),
    );
    assert.ok(button(r, "추가 계측 개정 저장"));
    await act(async () => button(r, "초과 → 구역 이슈 등록").props.onClick());
    assert.equal(saved[1].id, "review");
    assert.equal(saved[1].revision, 2);
    assert.equal(saved[2].payload.monitoringReviewId, "review");
    assert.equal(saved[2].payload.monitoringReviewRevision, 2);
  } finally {
    await act(async () => r.unmount());
  }
});

test("sensor-specific unsaved CSV and criteria restore with record/issue IDs and survive remount", async () => {
  await writeDraft("real-monitoring-v1", blank);
  const saved = [];
  const props = {
    records: [],
    notify() {},
    onSave: async (record) => {
      const previous = saved.filter((item) => item.id === record.id).at(-1);
      const result = {
        ...record,
        id:
          record.id ||
          (record.payload.kind === "real_field_issue"
            ? "f2-issue"
            : "f2-review"),
        revision: previous ? previous.revision + 1 : 1,
        analysis_id: "qa-analysis",
      };
      saved.push(result);
      return result;
    },
  };
  const switchTo = async (r, id) =>
    act(async () =>
      r.root
        .findAllByType("button")
        .find((b) => textOf(b).startsWith(id))
        .props.onClick(),
    );
  let r = await render(props);
  const f2Csv = "date,value\n2026-01-01,21.5";
  const w2Csv = "date,value\n2026-01-02,-3";
  try {
    await change(field(r, "추가 계측 CSV"), "date,value\n2026-01-01,21");
    await change(labelInput(r, "원본·측정 기록 이름"), "QA F2 원본");
    await setCriterion(r);
    await act(async () => button(r, "초과 → 구역 이슈 등록").props.onClick());
    assert.equal(saved.length, 2);
    const stored = JSON.parse(JSON.stringify(saved));
    await act(async () =>
      r.update(
        React.createElement(RealMonitoring, { ...props, records: stored }),
      ),
    );
    // These edits have no explicit record save; only the sensor-local draft should retain them.
    await change(field(r, "추가 계측 CSV"), f2Csv);
    await change(field(r, "추가 계측 단위"), "m³/day");
    await change(field(r, "추가 계측 위치"), "QA F2 위치");
    await confirm(r);
    await switchTo(r, "W-2");
    assert.equal(field(r, "추가 계측 CSV").props.value, "date,value\n");
    assert.equal(field(r, "추가 계측 단위").props.value, "");
    assert.equal(button(r, "추가 계측 개정 저장"), undefined);
    await change(field(r, "추가 계측 CSV"), w2Csv);
    await change(labelInput(r, "원본·측정 기록 이름"), "QA W2 별도 원본");
    await setCriterion(r, "below", "-2");
    await change(field(r, "추가 계측 단위"), "m");
    await confirm(r);
    await switchTo(r, "F-2");
    assert.equal(field(r, "추가 계측 CSV").props.value, f2Csv);
    assert.equal(field(r, "추가 계측 단위").props.value, "m³/day");
    assert.equal(field(r, "추가 계측 평가 방향").props.value, "absolute");
    assert.equal(field(r, "추가 계측 기준값").props.value, "20");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, true);
    assert.equal(field(r, "추가 계측 위치").props.value, "QA F2 위치");
    assert.ok(button(r, "추가 계측 개정 저장"));
    assert.ok(button(r, "초과 이슈에 개정 연결"));
    assert.equal(
      saved.length,
      2,
      "sensor switching must not save review records",
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    const persisted = await readDraft("real-monitoring-v1");
    assert.equal(persisted.importRecordId, "f2-review");
    assert.equal(persisted.importIssueId, "f2-issue");
    assert.equal(persisted.additionalBySensor["W-2"].importCsv, w2Csv);
    await act(async () => r.unmount());
    r = await render({ ...props, records: stored });
    assert.equal(field(r, "추가 계측 CSV").props.value, f2Csv);
    assert.ok(button(r, "추가 계측 개정 저장"));
    await switchTo(r, "W-2");
    assert.equal(field(r, "추가 계측 CSV").props.value, w2Csv);
    assert.equal(field(r, "추가 계측 단위").props.value, "m");
    assert.equal(field(r, "추가 계측 평가 방향").props.value, "below");
    assert.equal(field(r, "추가 계측 기준값").props.value, "-2");
    assert.equal(field(r, "추가 계측 기준 확인").props.checked, true);
    assert.equal(button(r, "추가 계측 개정 저장"), undefined);
    // An explicit history request intentionally replaces F2's draft with its saved revision.
    await act(async () =>
      r.update(
        React.createElement(RealMonitoring, {
          ...props,
          records: stored,
          requestedRecordId: "f2-review",
        }),
      ),
    );
    assert.equal(
      field(r, "추가 계측 CSV").props.value,
      stored[0].payload.rawCsv,
    );
    assert.equal(field(r, "추가 계측 단위").props.value, "mm");
    await switchTo(r, "W-2");
    assert.equal(field(r, "추가 계측 CSV").props.value, w2Csv);
    assert.equal(field(r, "추가 계측 단위").props.value, "m");
  } finally {
    await act(async () => r.unmount());
  }
});
