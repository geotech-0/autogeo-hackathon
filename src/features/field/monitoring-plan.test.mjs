import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { act, create } from "react-test-renderer";
import MonitoringPlan from "./MonitoringPlan.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const plan = JSON.parse(
  await readFile(
    new URL("../../data/real-field/monitoring-plan.json", import.meta.url),
    "utf8",
  ),
);
const data = JSON.parse(
  await readFile(
    new URL("../../data/real-field/monitoring.json", import.meta.url),
    "utf8",
  ),
);

test("monitoring plan accounts for every real sensor using local diagram coordinates and a traceable page", () => {
  assert.equal(plan.source.coordinateSystem, "report-plan-local");
  assert.equal(plan.source.reportId, "monitoring-03");
  assert.equal(plan.source.page, 54);
  assert.equal(plan.source.url, "/documents/monitoring-03.pdf#page=54");
  assert.deepEqual(
    plan.locations.map((s) => s.id).sort(),
    data.sensors.map((s) => s.id).sort(),
  );
  const [x, y, w, h] = plan.viewBox;
  const inside = (point) => {
    assert.ok(point.every(Number.isFinite));
    assert.ok(
      point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h,
    );
  };
  for (const location of plan.locations) {
    assert.ok(location.note);
    assert.equal(
      location.confidence,
      location.point ? "approximate" : "unlocated",
    );
    if (location.point) inside(location.point);
  }
  for (const line of plan.geometry) line.points.forEach(inside);
  assert.ok(plan.geometry.some((line) => line.kind === "retaining"));
  assert.ok(plan.geometry.some((line) => line.kind === "building"));
  assert.ok(
    data.sensors.every((sensor) => sensor.coordinate === null),
    "diagram points must never replace unknown survey coordinates",
  );
});

test("selection moves the plan highlight for every located instrument and preserves shared plan positions", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(MonitoringPlan, {
        sensorId: "INC-1",
        sensorLabel: "지중경사계",
      }),
    );
  });
  for (const location of plan.locations) {
    await act(async () =>
      renderer.update(
        React.createElement(MonitoringPlan, {
          sensorId: location.id,
          sensorLabel: "계측기",
        }),
      ),
    );
    const highlights = renderer.root.findAllByProps({
      className: "rf-plan-selected",
    });
    assert.equal(highlights.length, location.point ? 1 : 0);
    const svg = renderer.root.findByProps({ role: "img" });
    assert.ok(svg.props["aria-label"].includes(location.id));
    if (location.point) {
      assert.equal(highlights[0].props["data-sensor-id"], location.id);
      const dot = highlights[0].findByProps({
        className: "rf-plan-selected-dot",
      });
      assert.deepEqual([dot.props.cx, dot.props.cy], location.point);
    }
  }
  assert.equal(
    renderer.root.findByProps({ className: "rf-monitor-plan-source" }).props
      .href,
    plan.source.url,
  );
  for (const group of ["L-2", "L-3"]) {
    const levels = plan.locations.filter((s) => s.id.startsWith(`${group}-`));
    assert.equal(levels.length, 3);
    assert.ok(
      levels.every(
        (s) => JSON.stringify(s.point) === JSON.stringify(levels[0].point),
      ),
    );
  }
  await act(async () => renderer.unmount());
});

test("unknown location has no invented point or misleading highlight", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(MonitoringPlan, {
        sensorId: "UNLOCATED",
        sensorLabel: "위치 미등록 계측기",
      }),
    );
  });
  assert.equal(
    renderer.root.findAllByProps({ className: "rf-plan-selected" }).length,
    0,
  );
  assert.match(
    renderer.root.findByProps({ role: "img" }).props["aria-label"],
    /위치 미확인/,
  );
  await act(async () => renderer.unmount());
});
