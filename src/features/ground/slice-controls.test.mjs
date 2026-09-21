import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import SliceControls, { CoordinateInput } from "./SliceControls.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const byLabel = (renderer, label) =>
  renderer.root.findByProps({ "aria-label": label });
const byText = (renderer, text) =>
  renderer.root.findAllByType("button").find((b) => textOf(b) === text);
const edit = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
async function mount(Component, props) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Component, props));
  });
  return renderer;
}

test("CoordinateInput blocks pending, blank and invalid edits until blur or Enter commits a valid number", async () => {
  const validity = [],
    commits = [];
  const renderer = await mount(CoordinateInput, {
    value: 1.234567,
    min: 0,
    max: 3,
    label: "좌표",
    onChange: (n) => commits.push(n),
    onValidityChange: (v) => validity.push(v),
  });
  const field = () => byLabel(renderer, "좌표");
  try {
    assert.equal(validity.at(-1), true);
    assert.equal(
      field().props.value,
      "1.234567",
      "focus/blur must not silently round a stored coordinate",
    );
    await edit(field(), "1.75");
    assert.equal(validity.at(-1), false);
    assert.deepEqual(commits, []);
    await act(async () => field().props.onBlur());
    assert.deepEqual(commits, [1.75]);
    assert.equal(validity.at(-1), true);
    for (const text of ["", "99", "NaN"]) {
      await edit(field(), text);
      await act(async () => field().props.onBlur());
      assert.equal(validity.at(-1), false);
      assert.equal(field().props["aria-invalid"], true);
      assert.deepEqual(commits, [1.75]);
    }
    await edit(field(), "2.6");
    assert.equal(validity.at(-1), false);
    let blurred = false;
    await act(async () =>
      field().props.onKeyDown({
        key: "Enter",
        currentTarget: {
          blur() {
            blurred = true;
          },
        },
      }),
    );
    assert.equal(blurred, true);
    assert.deepEqual(commits, [1.75, 2.6]);
    assert.equal(validity.at(-1), true);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("CoordinateInput revalidates changed bounds and clears dirty text only on external value replacement", async () => {
  const validity = [],
    commits = [];
  let props = {
    value: 5,
    min: 0,
    max: 10,
    label: "좌표",
    onChange: (n) => commits.push(n),
    onValidityChange: (v) => validity.push(v),
  };
  const renderer = await mount(CoordinateInput, props);
  const update = async (next) => {
    props = { ...props, ...next };
    await act(async () =>
      renderer.update(React.createElement(CoordinateInput, props)),
    );
  };
  const field = () => byLabel(renderer, "좌표");
  try {
    await update({ max: 4 });
    assert.equal(validity.at(-1), false);
    assert.equal(field().props.value, "5");
    assert.equal(field().props["aria-invalid"], true);
    await update({ max: 10 });
    assert.equal(validity.at(-1), true);
    await edit(field(), "8");
    await update({ max: 7 });
    assert.equal(validity.at(-1), false);
    assert.equal(field().props["aria-invalid"], true);
    await update({ max: 10 });
    assert.equal(
      validity.at(-1),
      false,
      "a newly valid range must not silently commit a dirty edit",
    );
    await act(async () => field().props.onBlur());
    assert.deepEqual(commits, [8]);
    assert.equal(validity.at(-1), true);
    await edit(field(), "");
    await update({ value: 3 });
    assert.equal(field().props.value, "3");
    assert.equal(field().props["aria-invalid"], false);
    assert.equal(validity.at(-1), true);
  } finally {
    await act(async () => renderer.unmount());
  }
});

function controlsProps(validity) {
  return {
    slice: {
      enabled: true,
      axis: "y",
      positions: { x: 239925, y: 521600, z: 40 },
      keep: "above",
      mode: "cut",
      showPlane: true,
    },
    limits: { x: [239800, 240050], y: [521500, 521700], z: [20, 80] },
    cameraView: "perspective",
    onCamera() {},
    baseElevation: 20,
    maxBase: 30,
    onValidityChange: (v) => validity.push(v),
    onChange() {},
    onBase() {},
  };
}

test("Slider rounding retains fractional model endpoints without leaving the valid range", async () => {
  const validity = [];
  let props = controlsProps(validity),
    renderer;
  props.limits.y = [521494.11, 521687.78];
  props.onChange = (slice) => {
    props = { ...props, slice };
    renderer.update(React.createElement(SliceControls, props));
  };
  renderer = await mount(SliceControls, props);
  try {
    for (const endpoint of props.limits.y) {
      await edit(byLabel(renderer, "Y 절단 위치 슬라이더"), String(endpoint));
      assert.equal(props.slice.positions.y, endpoint);
      assert.equal(validity.at(-1), true);
      assert.equal(
        byLabel(renderer, "Y 절단 위치 값").props.value,
        String(endpoint),
      );
    }
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("SliceControls aggregates position and base validity and drops obsolete axis errors on axis change", async () => {
  const validity = [];
  let props = controlsProps(validity),
    renderer;
  const update = async (next) => {
    props = { ...props, ...next };
    await act(async () =>
      renderer.update(React.createElement(SliceControls, props)),
    );
  };
  props.onChange = (slice) => {
    props = { ...props, slice };
    renderer.update(React.createElement(SliceControls, props));
  };
  props.onBase = (baseElevation) => {
    props = { ...props, baseElevation };
    renderer.update(React.createElement(SliceControls, props));
  };
  renderer = await mount(SliceControls, props);
  const coordinate = () =>
    byLabel(renderer, `${props.slice.axis.toUpperCase()} 절단 위치 값`);
  const base = () => byLabel(renderer, "암반 모델 표시 하한 값");
  try {
    assert.equal(validity.at(-1), true);
    assert.equal(byLabel(renderer, "Y 절단 위치 슬라이더").props.step, "any");
    await edit(byLabel(renderer, "Y 절단 위치 슬라이더"), "521610.27");
    assert.equal(props.slice.positions.y, 521610.3);
    await edit(coordinate(), "521650.123");
    await edit(base(), "99");
    await act(async () => coordinate().props.onBlur());
    assert.equal(
      byLabel(renderer, "Y 절단 위치 슬라이더").props.value,
      521650.123,
    );
    assert.equal(
      validity.at(-1),
      false,
      "base still invalid after position commits",
    );
    await edit(base(), "25");
    assert.equal(validity.at(-1), false);
    await act(async () => base().props.onBlur());
    assert.equal(validity.at(-1), true);
    await edit(coordinate(), "");
    assert.equal(validity.at(-1), false);
    await update({ slice: { ...props.slice, axis: "x" } });
    assert.equal(coordinate().props.value, "239925");
    assert.equal(validity.at(-1), true);
    await edit(coordinate(), "999999");
    await update({ slice: { ...props.slice, enabled: false } });
    assert.equal(
      validity.at(-1),
      true,
      "hidden obsolete input must no longer block unrelated views",
    );
    await edit(base(), "");
    assert.equal(
      validity.at(-1),
      false,
      "base remains active even without slicing",
    );
  } finally {
    await act(async () => renderer.unmount());
  }
  assert.equal(
    validity.at(-1),
    true,
    "unmount releases the parent's validation gate",
  );
});

test("Center and automatic reset recover invalid edits even when the committed value is unchanged", async () => {
  const validity = [];
  let props = controlsProps(validity),
    renderer;
  props.onChange = (slice) => {
    props = { ...props, slice };
    renderer.update(React.createElement(SliceControls, props));
  };
  props.onBase = (value) => {
    props = { ...props, baseElevation: value ?? 20 };
    renderer.update(React.createElement(SliceControls, props));
  };
  renderer = await mount(SliceControls, props);
  try {
    await edit(byLabel(renderer, "Y 절단 위치 값"), "999999");
    assert.equal(validity.at(-1), false);
    await act(async () =>
      byLabel(renderer, "Y 절단 위치 중앙으로").props.onClick(),
    );
    assert.equal(props.slice.positions.y, 521600);
    assert.equal(byLabel(renderer, "Y 절단 위치 값").props.value, "521600");
    assert.equal(validity.at(-1), true);
    await edit(byLabel(renderer, "암반 모델 표시 하한 값"), "");
    await act(async () => byText(renderer, "자동 설정").props.onClick());
    assert.equal(byLabel(renderer, "암반 모델 표시 하한 값").props.value, "20");
    assert.equal(validity.at(-1), true);
  } finally {
    await act(async () => renderer.unmount());
  }
});
