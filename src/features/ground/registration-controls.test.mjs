import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import RegistrationControls from "./RegistrationControls.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const field = (r, label) => r.root.findByProps({ "aria-label": label });
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const edit = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));

test("Drone adjustment accepts signed decimal drafts without changing committed coordinates, aggregates invalid fields, and resets them", async () => {
  const original = { east: 0, north: 0, rotation: 0, scale: 1, height: 0 };
  let value = { ...original },
    r;
  const validity = [],
    changes = [];
  const props = () => ({
    value,
    onChange(next) {
      value = next;
      changes.push(next);
      r.update(React.createElement(RegistrationControls, props()));
    },
    onReset() {
      value = { ...original };
      r.update(React.createElement(RegistrationControls, props()));
    },
    onValidityChange: (valid) => validity.push(valid),
  });
  await act(async () => {
    r = create(React.createElement(RegistrationControls, props()));
  });
  try {
    const east = () => field(r, "드론 동쪽 이동");
    const scale = () => field(r, "드론 축척");
    assert.equal(validity.at(-1), true);
    await edit(east(), "-");
    assert.equal(east().props.value, "-");
    assert.equal(value.east, 0);
    await edit(east(), "-0.25");
    assert.equal(value.east, 0);
    await act(async () => east().props.onBlur());
    assert.equal(value.east, -0.25);
    assert.equal(validity.at(-1), true);
    await edit(scale(), "0.75");
    await edit(east(), "101");
    await act(async () => scale().props.onBlur());
    assert.equal(value.scale, 0.75);
    assert.equal(validity.at(-1), false);
    await act(async () => east().props.onBlur());
    assert.equal(east().props["aria-invalid"], true);
    assert.equal(value.east, -0.25);
    const errorId = east().props["aria-describedby"];
    assert.ok(errorId);
    assert.match(textOf(r.root.findByProps({ id: errorId })), /-100~100 m/);
    await act(async () => east().props.onKeyDown({ key: "Escape" }));
    assert.equal(east().props.value, "-0.25");
    assert.equal(validity.at(-1), true);
    await edit(scale(), "");
    await act(async () => scale().props.onBlur());
    assert.equal(scale().props["aria-invalid"], true);
    assert.equal(
      value.scale,
      0.75,
      "blank input must not silently become zero",
    );
    await act(async () =>
      r.root
        .findAllByType("button")
        .find((b) => textOf(b).includes("원본 정합으로"))
        .props.onClick(),
    );
    assert.deepEqual(value, original);
    assert.equal(scale().props.value, "1");
    assert.equal(east().props.value, "0");
    assert.equal(validity.at(-1), true);
    assert.equal(
      value.height,
      0,
      "UI edits preserve the established vertical correction",
    );
    await edit(field(r, "드론 회전"), "40");
    await act(async () => field(r, "드론 회전").props.onBlur());
    assert.match(
      textOf(
        r.root.findByProps({
          id: field(r, "드론 회전").props["aria-describedby"],
        }),
      ),
      /-30~30 °/,
    );
    assert.equal(value.rotation, 0);
  } finally {
    await act(async () => r.unmount());
  }
  assert.equal(validity.at(-1), true);
});
