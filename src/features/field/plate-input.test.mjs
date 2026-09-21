import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import QualityReview from "./QualityReview.tsx";
import {
  EMPTY_PLATE_INPUT,
  evaluatePlateInput,
  plateExample,
  plateInputRecord,
  restorePlateInput,
} from "./plate-input.mjs";
import { nextIssue } from "./real-engine.mjs";
import { writeDraft } from "../../storage/database.ts";

const csv =
  "time_min,stage,load_kN,settlement_mm\n0,재하,0,0\n5,재하,25,2\n10,유지,25,12\n15,제하,0,4";
const validInput = () => ({
  ...EMPTY_PLATE_INPUT,
  title: "PLT QA",
  sourceName: "my-plate.csv",
  csv,
  diameterMm: "564.1895835477563",
  criterion: "QA 최대침하 10mm",
  limitMm: "10",
  confirmed: true,
});

test("user plate load/pressure CSV uses independently known 0.25m² area and preserves original rows", () => {
  const input = validInput();
  const result = evaluatePlateInput(input);
  assert.ok(Math.abs(result.area - 0.25) < 1e-15);
  assert.ok(Math.abs(result.rows[1].pressure - 100) < 1e-12);
  assert.equal(result.rows[1].raw.load_kN, "25");
  assert.equal(result.totalCount, 4);
  assert.equal(result.status, "exceeded");
  assert.equal(result.maxSettlement, 12);
  const pressure = evaluatePlateInput({
    ...input,
    mode: "pressure",
    csv: csv.replace("load_kN", "pressure_kPa").replaceAll(",25,", ",100,"),
  });
  assert.ok(Math.abs(pressure.rows[1].load - 25) < 1e-12);
  assert.equal(pressure.rows[1].pressure, 100);
  assert.equal(pressure.rows[3].stage, "제하");
});

test("user plate confirmed threshold, unset basis, malformed CSV and conversion overflow have distinct states", () => {
  const input = validInput();
  assert.equal(evaluatePlateInput({ ...input, limitMm: "12" }).status, "pass");
  for (const patch of [
    { limitMm: "" },
    { criterion: "" },
    { confirmed: false },
  ])
    assert.equal(evaluatePlateInput({ ...input, ...patch }).status, "pending");
  for (const patch of [
    { csv: csv.replace("10,유지", "5,유지") },
    { mode: "pressure" },
    { diameterMm: "0" },
    { diameterMm: "1e-160" },
    { limitMm: "NaN" },
    { csv: csv.replace(",25,2", ",25,") },
  ]) {
    assert.equal(evaluatePlateInput({ ...input, ...patch }).status, "error");
    assert.throws(() => plateInputRecord({ ...input, ...patch }));
  }
  assert.equal(evaluatePlateInput(plateExample("normal")).status, "pass");
  assert.equal(evaluatePlateInput(plateExample("exceeded")).status, "exceeded");
  assert.equal(evaluatePlateInput(plateExample("pending")).status, "pending");
  assert.equal(evaluatePlateInput(plateExample("invalid")).status, "error");
});

test("plate CSV record JSON roundtrip retains provenance and parameters; issue enters existing action lifecycle", () => {
  const input = {
    ...validInput(),
    author: "QA 담당",
    note: "최대 침하 초과, 현장 확인 필요",
  };
  const record = JSON.parse(
    JSON.stringify({ ...plateInputRecord(input), id: "plate-user-1" }),
  );
  assert.equal(record.origin, "manual_record");
  assert.equal(record.payload.provenance, "user_supplied_csv");
  assert.equal(record.payload.plateInput.csv, csv);
  assert.equal(record.payload.units.pressure, "kPa");
  assert.deepEqual(restorePlateInput(record), {
    ...input,
    recordId: record.id,
  });
  assert.throws(() =>
    restorePlateInput({
      ...record,
      payload: {
        ...record.payload,
        plateInput: { ...record.payload.plateInput, confirmed: "false" },
      },
    }),
  );
  assert.throws(() =>
    restorePlateInput({
      ...record,
      payload: {
        ...record.payload,
        plateInput: { ...record.payload.plateInput, limitMm: null },
      },
    }),
  );
  assert.equal(plateInputRecord(restorePlateInput(record)).id, record.id);
  assert.equal(plateInputRecord(plateExample("normal")).origin, "synthetic");
  assert.equal(
    plateInputRecord(plateExample("normal")).payload.provenance,
    "synthetic_validation_example",
  );
  const issue = plateInputRecord(input, true, "2026-09-22");
  assert.equal(issue.payload.kind, "real_field_issue");
  assert.equal(issue.status, "pending");
  const progressed = nextIssue(
    issue.payload,
    { date: "2026-09-22", author: "QA 담당", note: "계기 영점 및 재시험 조치" },
    "action",
  );
  assert.equal(progressed.lifecycle, "action");
  assert.equal(progressed.history.length, 2);
  assert.equal(progressed.plateInput.csv, csv);
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pause = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const button = (renderer, label) =>
  renderer.root.findAllByType("button").find((b) => textOf(b).trim() === label);
const control = (renderer, label, type = "input") =>
  renderer.root
    .findAllByType("label")
    .find((l) => textOf(l).startsWith(label))
    .findByType(type);
const change = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
async function render(props) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(QualityReview, props));
  });
  await act(async () => pause());
  await act(async () => pause());
  return renderer;
}

test("plate input UI uploads, confirms, saves, restores across remount/history, and preserves edits after record refresh", async () => {
  await writeDraft("real-quality-review-v1", {
    workspace: "reference",
    test: "plate",
    view: "ps",
    penetration: "1.2",
    criterion: "",
    limit: "",
    note: "",
    author: "",
    holdStage: "",
    recordId: "",
  });
  await writeDraft("user-plate-input-v1", { ...EMPTY_PLATE_INPUT });
  const saved = [];
  const props = {
    records: saved,
    notify() {},
    onSave: async (record) => {
      const value = {
        ...record,
        id: "plate-review-1",
        revision: saved.length + 1,
      };
      saved.push(value);
      return value;
    },
  };
  let renderer = await render(props);
  try {
    await act(async () => button(renderer, "내 시험자료 검토").props.onClick());
    await act(async () => pause());
    await act(async () =>
      renderer.root.findByProps({ type: "file" }).props.onChange({
        target: {
          files: [
            { name: "my-test.csv", size: csv.length, text: async () => csv },
          ],
        },
      }),
    );
    await change(control(renderer, "원형 재하판 직경"), "564.1895835477563");
    await change(control(renderer, "최대 침하 관리기준"), "10");
    await change(control(renderer, "관리기준 이름"), "QA 최대침하 10mm");
    await act(async () =>
      renderer.root
        .findByProps({ type: "checkbox" })
        .props.onChange({ target: { checked: true } }),
    );
    await act(async () => button(renderer, "CSV 검토 저장").props.onClick());
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, "exceeded");
    assert.equal(saved[0].payload.plateInput.sourceName, "my-test.csv");
    assert.equal(saved[0].payload.result.rows[1].raw.load_kN, "25");
    await act(async () => pause(200));
    await act(async () => renderer.unmount());
    renderer = await render(props);
    assert.equal(control(renderer, "최대 침하 관리기준").props.value, "10");
    assert.equal(
      control(renderer, "원본·출처 이름").props.value,
      "my-test.csv",
    );
    assert.equal(button(renderer, "CSV 검토 개정 저장").props.disabled, false);
    await change(control(renderer, "원형 재하판 직경"), "600");
    const record = JSON.parse(JSON.stringify(saved[0]));
    await act(async () =>
      renderer.update(
        React.createElement(QualityReview, {
          ...props,
          records: [record],
          requestedRecordId: record.id,
        }),
      ),
    );
    assert.equal(
      control(renderer, "원형 재하판 직경").props.value,
      "564.1895835477563",
    );
    assert.equal(
      renderer.root.findByProps({ type: "checkbox" }).props.checked,
      true,
    );
    await change(control(renderer, "최대 침하 관리기준"), "15");
    await act(async () =>
      renderer.update(
        React.createElement(QualityReview, {
          ...props,
          records: [{ ...record, revision: 9 }],
          requestedRecordId: record.id,
        }),
      ),
    );
    assert.equal(control(renderer, "최대 침하 관리기준").props.value, "15");
    await act(async () =>
      button(renderer, "CSV 검토 개정 저장").props.onClick(),
    );
    assert.equal(saved[1].id, record.id);
    assert.equal(saved[1].status, "pass");
    await change(control(renderer, "이슈 담당자"), "QA 담당");
    await change(control(renderer, "시험 이슈 내용"), "원본 계기 영점 확인");
    await act(async () =>
      button(renderer, "시험 이슈를 조치·재점검에 등록").props.onClick(),
    );
    assert.equal(saved[2].payload.kind, "real_field_issue");
    assert.equal(saved[2].payload.history[0].note, "원본 계기 영점 확인");
    await change(
      renderer.root.findByProps({ "aria-label": "평판재하 CSV" }),
      csv.replace("10,유지", "5,유지"),
    );
    assert.equal(button(renderer, "CSV 검토 개정 저장").props.disabled, true);
    await act(async () =>
      button(renderer, "CSV 검토 개정 저장").props.onClick(),
    );
    assert.equal(
      saved.length,
      3,
      "even direct invocation must reject malformed input",
    );
    await act(async () =>
      button(renderer, "예제 · 기준 미설정").props.onClick(),
    );
    await act(async () => button(renderer, "CSV 검토 저장").props.onClick());
    assert.equal(saved[3].status, "pending");
    assert.equal(saved[3].origin, "synthetic");
  } finally {
    await act(async () => renderer.unmount());
  }
});
