import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { create, act } from "react-test-renderer";
import ModelSliceSection from "./ModelSliceSection.tsx";
import {
  preparePlanLinework,
  planOverlayBounds,
  planProjection,
} from "./plan-cad.mjs";

const assets = JSON.parse(
  await readFile(
    new URL("../../../public/data/ground/site-assets.json", import.meta.url),
    "utf8",
  ),
);
const cad = JSON.parse(
  await readFile(
    new URL("../../../public/data/ground/cad-linework.json", import.meta.url),
    "utf8",
  ),
);
const linework = preparePlanLinework(cad, assets.frame);
const bounds = [239850, 521520, 240000, 521620];
const coordinates = (path) =>
  [...path.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `${message}: ${actual} vs ${expected}`,
  );

test("actual CAD linework returns to EN once and excludes both boundary layers from retaining lines", () => {
  assert.equal(linework.layers.length, 6);
  assert.ok(
    linework.layers.every((l) => !["지구계", "대지경계선"].includes(l.name)),
  );
  const p = coordinates(cad.layers.find((l) => l.name === "지구계").path)[0];
  close(
    assets.frame.originENH[0] + p[0],
    assets.cad.boundaryEN[0][0],
    "boundary E",
  );
  close(
    assets.frame.originENH[1] - p[1],
    assets.cad.boundaryEN[0][1],
    "boundary N",
  );
  const retaining = coordinates(
    linework.layers.find((l) => l.name === "0-SLOP LINE").path,
  )[0];
  close(linework.originENH[0] + retaining[0], 239930.591, "retaining E");
  close(linework.originENH[1] - retaining[1], 521572.396, "retaining N");
  assert.throws(
    () => preparePlanLinework({ ...cad, frameId: "wrong" }, assets.frame),
    /좌표/,
  );
  assert.throws(
    () => preparePlanLinework({ ...cad, originENH: [0, 0, 0] }, assets.frame),
    /좌표/,
  );
  assert.throws(
    () =>
      preparePlanLinework(
        { ...cad, layers: [{ name: "test", path: "M1,2 L3,NaN" }] },
        assets.frame,
      ),
    /선형/,
  );
});

test("all actual drawing vertices fit mobile/desktop plan bounds at equal E/N scale without mirroring", () => {
  const combined = planOverlayBounds(bounds, assets.cad.boundaryEN, linework, {
    boundary: true,
    linework: true,
  });
  assert.ok(combined[0] < bounds[0] && combined[1] < bounds[1]);
  assert.ok(combined[2] > bounds[2] && combined[3] > bounds[3]);
  assert.deepEqual(
    planOverlayBounds(bounds, assets.cad.boundaryEN, linework, {
      boundary: false,
      linework: false,
    }),
    bounds,
  );
  for (const width of [260, 800, 1360]) {
    const plot = { left: 56, top: 26, width: width - 82, height: 306 };
    const p = planProjection(combined, plot);
    close(
      p.x(239900 + 10) - p.x(239900),
      p.y(521600) - p.y(521600 + 10),
      "equal E/N scale",
    );
    const inPlot = (e, n) => {
      assert.ok(p.x(e) > plot.left && p.x(e) < plot.left + plot.width);
      assert.ok(p.y(n) > plot.top && p.y(n) < plot.top + plot.height);
    };
    for (const point of assets.cad.boundaryEN) inPlot(...point);
    for (const layer of linework.layers)
      for (const [localE, negativeLocalN] of coordinates(layer.path)) {
        const e = linework.originENH[0] + localE,
          n = linework.originENH[1] - negativeLocalN;
        inPlot(e, n);
        // This is the SVG translate + positive scale used for the original path.
        close(p.x(linework.originENH[0]) + p.scale * localE, p.x(e), "SVG E");
        close(
          p.y(linework.originENH[1]) + p.scale * negativeLocalN,
          p.y(n),
          "SVG N",
        );
      }
  }
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) =>
  typeof node === "string" ? node : node.children.map(text).join("");
const checkbox = (r, name) =>
  r.root
    .findAllByType("label")
    .find((n) => text(n) === name)
    ?.findByType("input");
const props = {
  layers: [
    {
      id: "test",
      name: "test",
      color: "#abc",
      capPositions: [
        239900, 521580, 40, 239950, 521580, 40, 239900, 521610, 40,
      ],
    },
  ],
  slice: {
    enabled: true,
    axis: "x",
    positions: { x: 239900, y: 521600, z: 40 },
    keep: "above",
    mode: "plane",
    showPlane: true,
  },
  visible: [true],
  bounds,
  baseElevation: 10,
  topElevation: 100,
  holes: [],
  linked: true,
  assets,
  showPlanBoundary: true,
  showPlanLinework: true,
  onPlanOverlayChange() {},
};

test("drawing overlays and their independent checkboxes exist only for Z sections", async () => {
  const originalFetch = globalThis.fetch;
  let requested = 0,
    r;
  globalThis.fetch = async (url) => {
    assert.equal(url, assets.cad.lineworkUrl);
    requested++;
    return { ok: true, json: async () => cad };
  };
  function Fixture({ axis }) {
    const [shown, setShown] = React.useState({
      boundary: true,
      linework: true,
    });
    return React.createElement(ModelSliceSection, {
      ...props,
      slice: { ...props.slice, axis },
      showPlanBoundary: shown.boundary,
      showPlanLinework: shown.linework,
      onPlanOverlayChange: (key, checked) =>
        setShown((s) => ({ ...s, [key]: checked })),
    });
  }
  const displayed = (label) =>
    r.root.findAllByProps({ "aria-label": label }).length;
  try {
    await act(async () => {
      r = create(React.createElement(Fixture, { axis: "x" }));
    });
    assert.equal(requested, 0);
    assert.equal(checkbox(r, "도면경계"), undefined);
    await act(async () =>
      r.update(React.createElement(Fixture, { axis: "y" })),
    );
    assert.equal(requested, 0);
    assert.equal(displayed("흙막이 도면선 중첩"), 0);
    await act(async () =>
      r.update(React.createElement(Fixture, { axis: "z" })),
    );
    assert.equal(requested, 1);
    assert.equal(displayed("도면경계 중첩"), 1);
    assert.equal(displayed("흙막이 도면선 중첩"), 1);
    await act(async () =>
      checkbox(r, "도면경계").props.onChange({ target: { checked: false } }),
    );
    assert.equal(displayed("도면경계 중첩"), 0);
    assert.equal(displayed("흙막이 도면선 중첩"), 1);
    await act(async () =>
      checkbox(r, "흙막이 도면선").props.onChange({
        target: { checked: false },
      }),
    );
    assert.equal(displayed("흙막이 도면선 중첩"), 0);
    await act(async () =>
      checkbox(r, "도면경계").props.onChange({ target: { checked: true } }),
    );
    assert.equal(displayed("도면경계 중첩"), 1);
    assert.equal(displayed("흙막이 도면선 중첩"), 0);
    await act(async () =>
      r.update(React.createElement(Fixture, { axis: "x" })),
    );
    assert.equal(displayed("도면경계 중첩"), 0);
    assert.equal(checkbox(r, "흙막이 도면선"), undefined);
    await act(async () =>
      r.update(React.createElement(Fixture, { axis: "z" })),
    );
    assert.equal(checkbox(r, "흙막이 도면선").props.checked, false);
    assert.equal(requested, 1, "switching axes reuses the registered paths");
  } finally {
    if (r) await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});

test("a failed CAD request is reported without hiding the available plan boundary", async () => {
  const originalFetch = globalThis.fetch;
  let r;
  globalThis.fetch = async () => ({ ok: false });
  try {
    await act(async () => {
      r = create(
        React.createElement(ModelSliceSection, {
          ...props,
          slice: { ...props.slice, axis: "z" },
        }),
      );
    });
    assert.match(
      text(r.root.findByProps({ role: "status" })),
      /불러오지 못했습니다/,
    );
    assert.equal(
      r.root.findAllByProps({ "aria-label": "도면경계 중첩" }).length,
      1,
    );
    assert.equal(
      r.root.findAllByProps({ "aria-label": "흙막이 도면선 중첩" }).length,
      0,
    );
  } finally {
    if (r) await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});
