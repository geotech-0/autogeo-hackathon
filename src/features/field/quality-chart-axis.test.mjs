import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { act, create } from "react-test-renderer";
import RealChart from "./RealChart.tsx";
import { PlateChart } from "./Charts.tsx";
import QualityReview from "./QualityReview.tsx";
import { evaluatePlateInput, plateExample } from "./plate-input.mjs";
import { writeDraft } from "../../storage/database.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(element) {
    this.callback([{ contentRect: { width: element.clientWidth } }]);
  }
  disconnect() {}
};
const source = JSON.parse(
  await readFile(
    new URL("../../data/real-field/quality.json", import.meta.url),
    "utf8",
  ),
);
const text = (node) =>
  typeof node === "string" ? node : node.children.map(text).join("");
const button = (r, label) =>
  r.root.findAllByType("button").find((node) => text(node).trim() === label);
const click = (node) => act(async () => node.props.onClick());
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
async function mount(element, width = 320) {
  let renderer;
  await act(async () => {
    renderer = create(element, {
      createNodeMock: ({ props }) =>
        ["rf-plot", "field-chart-frame"].includes(props.className)
          ? { clientWidth: width }
          : null,
    });
  });
  return renderer;
}
const axisText = (r, plate = false) =>
  r.root
    .findByProps({ className: plate ? "field-x-axis" : "rf-x-axis" })
    .findAllByType("text");
const points = (r) => r.root.findAllByType("circle");
function assertTop(r, plate = false) {
  const labels = axisText(r, plate);
  const plotted = points(r);
  const grid = r.root
    .findAllByType("line")
    .filter((node) =>
      plate
        ? node.props.className === "field-gridline"
        : node.props.stroke === "#e7ecf2",
    );
  const plotTop = Math.min(...grid.map((node) => Number(node.props.y1)));
  const title = labels.at(-1);
  assert.ok(
    Number(title.props.y) < Number(labels[0].props.y),
    "X title has its own row above the tick labels",
  );
  assert.ok(
    labels.every((node) => Number(node.props.y) < plotTop),
    "all X text belongs above the plotting area",
  );
  assert.ok(
    plotted.every(
      (node) =>
        node.props.cy > Math.max(...labels.map((n) => Number(n.props.y))),
    ),
    "data points cannot occupy the X label rows",
  );
  assert.equal(
    labels[0].props.textAnchor,
    "start",
    "left endpoint stays within the plot width",
  );
  assert.equal(
    labels.at(-2).props.textAnchor,
    "end",
    "right endpoint stays within the plot width",
  );
  const yTitle = r.root
    .findAllByType("text")
    .find(
      (node) =>
        !labels.includes(node) &&
        ["rf-axis-title", "field-axis-title"].includes(node.props.className),
    );
  assert.ok(
    Number(yTitle.props.y) + 16 <= Number(title.props.y),
    "Y and X titles have separate non-overlapping rows",
  );
}

test("RealChart top axis keeps signed values, Y direction, thresholds and point selection; default monitoring axis stays below", async () => {
  for (const width of [320, 720]) {
    for (const invertY of [false, true]) {
      const selected = [];
      const props = {
        points: [
          { x: -2, y: -0.3, label: "negative" },
          { x: NaN, y: 0, label: "invalid" },
          { x: 0, y: 1.2, label: "positive" },
        ],
        xLabel: "log₁₀ P",
        yLabel: "log₁₀ |S|",
        thresholds: [0.5],
        thresholdLabels: ["입력 기준"],
        invertY,
        onPoint: (index) => selected.push(index),
      };
      const bottom = await mount(React.createElement(RealChart, props), width);
      const top = await mount(
        React.createElement(RealChart, { ...props, axisPosition: "top" }),
        width,
      );
      try {
        assertTop(top);
        const oldPoints = points(bottom),
          newPoints = points(top);
        assert.deepEqual(
          axisText(top).map(text),
          axisText(bottom).map(text),
          "moving the axis must not alter its signed tick values",
        );
        assert.match(text(axisText(top)[0]), /^-2\.0$/);
        assert.ok(
          axisText(bottom).every(
            (node) =>
              Number(node.props.y) >
              Math.max(...oldPoints.map((p) => p.props.cy)),
          ),
          "omitting axisPosition preserves the bottom monitoring layout",
        );
        oldPoints.forEach((old, index) => {
          assert.equal(newPoints[index].props.cx, old.props.cx);
          assert.ok(
            Math.abs(newPoints[index].props.cy - old.props.cy - 40) < 1e-8,
            "Y geometry is only translated, never rescaled or reversed",
          );
          assert.equal(
            newPoints[index].props["aria-label"],
            old.props["aria-label"],
          );
        });
        const threshold = (r) => r.root.findByProps({ strokeDasharray: "6 4" });
        assert.equal(threshold(top).props.y1 - threshold(bottom).props.y1, 40);
        await click(newPoints[1]);
        assert.deepEqual(
          selected,
          [2],
          "point selection still refers to the original data row",
        );
      } finally {
        await act(async () => {
          bottom.unmount();
          top.unmount();
        });
      }
    }
  }
});

test("PlateChart top axis preserves downward settlement, load values, limit and raw-row interaction at narrow and wide widths", async () => {
  const result = evaluatePlateInput(plateExample("normal"));
  for (const width of [320, 720]) {
    const selected = [];
    const props = {
      rows: result.rows,
      limit: result.limit,
      selected: 1,
      onSelect: (row) => selected.push(row),
    };
    const bottom = await mount(React.createElement(PlateChart, props), width);
    const top = await mount(
      React.createElement(PlateChart, { ...props, axisPosition: "top" }),
      width,
    );
    try {
      assertTop(top, true);
      assert.deepEqual(
        axisText(top, true).map(text),
        axisText(bottom, true).map(text),
      );
      points(bottom).forEach((old, index) => {
        const next = points(top)[index];
        assert.equal(next.props.cx, old.props.cx);
        assert.ok(Math.abs(next.props.cy - old.props.cy - 48) < 1e-8);
        assert.equal(next.props["aria-label"], old.props["aria-label"]);
      });
      const limit = (r) =>
        r.root.findByProps({ className: "field-limit-line" });
      assert.equal(limit(top).props.y1 - limit(bottom).props.y1, 48);
      await click(points(top)[1]);
      assert.deepEqual(selected, [
        result.rows.filter((row) => !row.problems.length)[1].rowNumber,
      ]);
      assert.equal(
        text(top.root.findByProps({ className: "field-chart-legend" })),
        text(bottom.root.findByProps({ className: "field-chart-legend" })),
      );
    } finally {
      await act(async () => {
        bottom.unmount();
        top.unmount();
      });
    }
  }
});

test("Every provided quality analysis and user CSV/example chart opts into the top X axis", async () => {
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
  await writeDraft("user-plate-input-v1", {
    ...plateExample("normal"),
    example: "",
    sourceName: "QA 사용자 입력",
    title: "QA CSV 축 배치",
  });
  const r = await mount(
    React.createElement(QualityReview, {
      records: [],
      notify() {},
      onSave() {
        throw new Error("Chart review must not save a record");
      },
    }),
  );
  await act(pause);
  try {
    let providedViews = 0;
    for (const dataset of source.datasets) {
      await click(button(r, dataset.name));
      const views =
        dataset.id === "dcpt"
          ? ["ps"]
          : dataset.id === "tension"
            ? ["ps", "logps", "time"]
            : ["ps", "logps", "time", "hold"];
      for (const view of views) {
        if (dataset.id !== "dcpt") {
          const selector = r.root
            .findAllByType("select")
            .find((node) =>
              node
                .findAllByType("option")
                .some((option) => option.props.value === "logps"),
            );
          await act(async () =>
            selector.props.onChange({ target: { value: view } }),
          );
          if (view === "hold") {
            const stage = dataset.rows.find((row) => row.hold > 0).stage;
            const stages = r.root
              .findAllByType("select")
              .find((node) =>
                node
                  .findAllByType("option")
                  .some((option) => text(option) === stage),
              );
            await act(async () =>
              stages.props.onChange({ target: { value: stage } }),
            );
          }
        }
        const chart = r.root.findByType(RealChart);
        assert.equal(chart.props.axisPosition, "top", `${dataset.id}/${view}`);
        assert.ok(
          chart.props.points.length > 0,
          `${dataset.id}/${view} contains the provided observations`,
        );
        assertTop(r);
        providedViews++;
      }
    }
    assert.equal(providedViews, 12);
    await click(button(r, "내 시험자료 검토"));
    await act(pause);
    for (const example of [
      null,
      "기준 이내",
      "기준 초과",
      "기준 미설정",
      "입력 오류",
    ]) {
      if (example) await click(button(r, `예제 · ${example}`));
      await click(button(r, "압력–침하"));
      assert.equal(r.root.findByType(PlateChart).props.axisPosition, "top");
      assertTop(r, true);
      await click(button(r, "시간–침하"));
      assert.equal(r.root.findByType(RealChart).props.axisPosition, "top");
      if (r.root.findAllByProps({ className: "rf-x-axis" }).length)
        assertTop(r);
    }
  } finally {
    await act(async () => r.unmount());
  }
});
