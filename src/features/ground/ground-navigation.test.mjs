import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import React from "react";
import { create, act } from "react-test-renderer";
import {
  writeDraft,
  readDraft,
  saveRecord,
  listRevisions,
} from "../../storage/database.ts";

// Only styles are stubbed. Components, data, model calculations and draft storage
// run unchanged in this isolated in-memory IndexedDB process.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css"))
      return { format: "module", source: "", shortCircuit: true };
    return nextLoad(url, context);
  },
});
globalThis.__HAS_PROVIDED_ORIGINALS__ = false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { default: RealGroundPage } = await import("./RealGroundPage.tsx");
const { default: RealGroundScene } = await import("./RealGroundScene.tsx");
const { default: RealSiteMap } = await import("./RealSiteMap.tsx");
const source = JSON.parse(
  await readFile(
    new URL("../../data/real-ground/boreholes.json", import.meta.url),
    "utf8",
  ),
);
const assets = JSON.parse(
  await readFile(
    new URL("../../../public/data/ground/site-assets.json", import.meta.url),
    "utf8",
  ),
);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const textOf = (node) =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const button = (r, text) =>
  r.root.findAllByType("button").find((n) => textOf(n).trim() === text);
const field = (r, label) => r.root.findByProps({ "aria-label": label });
const change = (node, value) =>
  act(async () => node.props.onChange({ target: { value } }));
const click = (r, text) => act(async () => button(r, text).props.onClick());

const initial = {
  tab: "map",
  selected: "2022-08:NBH-6",
  modelCampaign: "2022-08",
  shownCampaigns: source.campaigns.map((c) => c.id),
  sectionNorth: 521622.7,
  mode: "ground",
  visible: [true, true, true],
  representation: "solid",
  solidVisible: [true, true, true],
  meshOpacity: 1,
  cutaway: false,
  slice: {
    enabled: true,
    axis: "y",
    keep: "below",
    mode: "cut",
    showPlane: true,
    positions: { x: 239925, y: 521622.7, z: 40 },
  },
  baseElevation: null,
  cameraView: "perspective",
  showHoles: true,
  showCAD: true,
  showCADLinework: false,
  showGCP: false,
  extrapolate: false,
  showVariance: false,
  verticalScale: 1.5,
  parameters: { model: "spherical", range: "150", sill: "50", nugget: "0" },
  registration: { east: 0, north: 0, rotation: 0, scale: 1, height: 0 },
};

test("Z drawing options keep independent map settings and survive both draft and saved-view restoration", async () => {
  const originalFetch = globalThis.fetch;
  const cad = JSON.parse(
    await readFile(
      new URL("../../../public/data/ground/cad-linework.json", import.meta.url),
      "utf8",
    ),
  );
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => (String(url).endsWith("site-assets.json") ? assets : cad),
  });
  await writeDraft("real-ground-view-v2", {
    ...initial,
    tab: "model",
    slice: { ...initial.slice, axis: "z" },
  });
  const records = [];
  const props = {
    records,
    notify() {},
    onSave: async (value) => {
      const saved = await saveRecord(value);
      records.splice(0, records.length, saved);
      return saved;
    },
  };
  const checkbox = (r, label) =>
    r.root
      .findAllByType("label")
      .find((n) => textOf(n) === label)
      .findByType("input");
  let r;
  const render = async () => {
    await act(async () => {
      r = create(React.createElement(RealGroundPage, props));
    });
    await act(settle);
  };
  try {
    await render();
    assert.equal(
      checkbox(r, "도면경계").props.checked,
      true,
      "old drafts gain a compatible default",
    );
    assert.equal(checkbox(r, "흙막이 도면선").props.checked, true);
    await act(async () =>
      checkbox(r, "도면경계").props.onChange({ target: { checked: false } }),
    );
    await act(async () =>
      checkbox(r, "흙막이 도면선").props.onChange({
        target: { checked: false },
      }),
    );
    await act(async () => r.unmount());
    await act(settle);
    await render();
    assert.equal(checkbox(r, "도면경계").props.checked, false);
    assert.equal(checkbox(r, "흙막이 도면선").props.checked, false);
    await click(r, "검토 저장");
    assert.equal(records[0].payload.view.showPlanBoundary, false);
    assert.equal(records[0].payload.view.showPlanLinework, false);
    assert.equal(
      records[0].payload.view.showCAD,
      true,
      "plan options must not alter map overlays",
    );
    assert.equal(records[0].payload.view.showCADLinework, false);
    await act(async () =>
      checkbox(r, "도면경계").props.onChange({ target: { checked: true } }),
    );
    await act(async () =>
      checkbox(r, "흙막이 도면선").props.onChange({
        target: { checked: true },
      }),
    );
    await click(r, "불러오기");
    assert.equal(checkbox(r, "도면경계").props.checked, false);
    assert.equal(checkbox(r, "흙막이 도면선").props.checked, false);
  } finally {
    if (r) await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});

test("Cross-campaign map selection preserves the active model, explicit model navigation follows the selected hole, and saved views recover pending input", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).endsWith("site-assets.json") ? assets : { points: [] },
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  await writeDraft("real-ground-view-v2", initial);
  let r;
  const records = [],
    notices = [];
  const props = {
    records,
    notify: (...notice) => notices.push(notice),
    onSave: async (record) => {
      const previous = records.findIndex((r) => r.id === record.id);
      const saved = {
        ...record,
        id: record.id || "qa-ground-navigation",
        revision: previous < 0 ? 1 : records[previous].revision + 1,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      };
      if (previous < 0) records.push(saved);
      else records[previous] = saved;
      return saved;
    },
  };
  await act(async () => {
    r = create(React.createElement(RealGroundPage, props));
  });
  await act(settle);
  try {
    const other = source.holes.find((h) => h.campaign === "2021-02");
    await act(async () =>
      r.root.findByType(RealSiteMap).props.onSelect(other.id),
    );
    await click(r, "3D·단면");
    let scene = r.root.findByType(RealGroundScene);
    assert.equal(field(r, "모델 조사차수").props.value, "2022-08");
    assert.equal(
      scene.props.slice.positions.y,
      initial.slice.positions.y,
      "selecting a hole from another survey must not move the active model's slice outside its domain",
    );
    await click(r, `${other.campaign} ${other.label}의 모델로 이동`);
    scene = r.root.findByType(RealGroundScene);
    assert.equal(field(r, "모델 조사차수").props.value, other.campaign);
    assert.equal(field(r, "모델 시추공").props.value, other.id);
    assert.equal(scene.props.slice.positions.x, other.easting);
    assert.equal(scene.props.slice.positions.y, other.northing);
    assert.equal(
      scene.props.holes.length,
      source.holes.filter((h) => h.campaign === other.campaign).length,
    );
    for (const mode of ["DSM + 영상", "실제 점군"]) {
      await click(r, mode);
      assert.ok(
        r.root
          .findByType(RealGroundScene)
          .props.holes.every((h) => h.campaign === other.campaign),
        "the visible survey selector must control observed holes in drone views too",
      );
    }
    await click(r, "지층 모델");
    await click(r, "선택 공의 관측 자료");
    await change(field(r, "시추공 검색"), "no-such-borehole");
    assert.ok(r.root.findAllByProps({ className: "real-empty-search" }).length);
    await click(r, "선택 공의 3D·단면 보기");
    await click(r, "Y · 동서 단면");
    await change(field(r, "절단 후 남길 방향"), "below");
    await click(r, "Y · 동서 단면");
    assert.equal(
      field(r, "절단 후 남길 방향").props.value,
      "below",
      "clicking the selected axis must not reverse the kept side",
    );
    await click(r, "정합·검수");
    await change(field(r, "드론 동쪽 이동"), "-0.25");
    assert.equal(button(r, "검토 저장").props.disabled, true);
    await act(async () => field(r, "드론 동쪽 이동").props.onBlur());
    assert.equal(button(r, "검토 저장").props.disabled, false);
    await change(field(r, "드론 축척"), "");
    await act(async () => field(r, "드론 축척").props.onBlur());
    assert.equal(button(r, "검토 저장").props.disabled, true);
    assert.equal(button(r, "JSON 내보내기").props.disabled, true);
    await act(async () =>
      field(r, "드론 축척").props.onKeyDown({ key: "Escape" }),
    );
    await click(r, "검토 저장");
    assert.equal(records.length, 1);
    assert.equal(records[0].payload.registration.east, -0.25);
    assert.equal(records[0].payload.registration.scale, 1);
    assert.equal(field(r, "저장된 실제 지반 검토").props.value, records[0].id);
    await change(field(r, "드론 축척"), "");
    assert.equal(button(r, "개정 저장").props.disabled, true);
    await click(r, "불러오기");
    assert.equal(
      field(r, "드론 축척").props.value,
      "1",
      "loading the same committed value must discard an invalid input draft",
    );
    assert.equal(button(r, "개정 저장").props.disabled, false);
    await click(r, "3D·단면");
    assert.equal(field(r, "절단 후 남길 방향").props.value, "below");
    assert.equal(
      r.root.findByType(RealGroundScene).props.registration.east,
      -0.25,
    );
    await click(r, "위에서 보기");
    await click(r, "개정 저장");
    assert.equal(records[0].revision, 2);
    const savedNorth = records[0].payload.view.slice.positions.y;
    await change(field(r, "Y 절단 위치 값"), "");
    await act(async () => field(r, "Y 절단 위치 값").props.onBlur());
    assert.equal(button(r, "개정 저장").props.disabled, true);
    await click(r, "불러오기");
    assert.equal(field(r, "Y 절단 위치 값").props.value, String(savedNorth));
    assert.equal(button(r, "개정 저장").props.disabled, false);
    assert.equal(button(r, "위에서 보기").props["aria-pressed"], true);
    await click(r, "선택 공의 관측 자료");
    assert.equal(field(r, "시추공 검색").props.value, "");
    assert.equal(
      r.root.findAllByProps({ className: "real-empty-search" }).length,
      0,
    );
    await click(r, "현장 지도");
    assert.match(
      textOf(r.root.findByProps({ className: "real-map-caption" })),
      /드론 추가 맞춤 적용/,
    );
    for (let i = 0; i < source.campaigns.length; i++) {
      await act(async () =>
        r.root
          .findByProps({ className: "real-campaign-pills" })
          .findAllByType("input")
          [i].props.onChange({ target: { checked: false } }),
      );
    }
    assert.equal(r.root.findByType(RealSiteMap).props.holes.length, 0);
    assert.ok(button(r, "이 차수 표시"));
    await click(r, "모든 차수 표시");
    assert.equal(r.root.findByType(RealSiteMap).props.holes.length, 32);
    assert.ok(notices.some(([message]) => message.includes("불러왔습니다")));
  } finally {
    await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});

test("Ground save retries keep their ID without implying success, then survive unmount before the response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).endsWith("site-assets.json") ? assets : { points: [] },
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  await writeDraft("real-ground-view-v2", initial);
  let release, committed, pending, first, r;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const persisted = new Promise((resolve) => {
    committed = resolve;
  });
  const records = [],
    attempts = [];
  const props = {
    records,
    notify() {},
    async onSave(draft) {
      attempts.push(draft.id);
      if (attempts.length === 1) throw new Error("QA initial save failure");
      const record = await saveRecord(draft);
      const index = records.findIndex((r) => r.id === record.id);
      if (index < 0) records.push(record);
      else records[index] = record;
      if (!first) {
        first = record;
        committed();
        await response;
      }
      return record;
    },
  };
  const mount = async () => {
    await act(async () => {
      r = create(React.createElement(RealGroundPage, props));
    });
    await act(settle);
  };
  await mount();
  try {
    await click(r, "검토 저장");
    assert.equal(records.length, 0);
    assert.ok(button(r, "검토 저장"), "a reserved ID is not a saved revision");
    assert.equal(button(r, "개정 저장"), undefined);
    await act(async () => {
      pending = button(r, "검토 저장").props.onClick();
      await persisted;
    });
    await act(async () => r.unmount());
    await act(async () => {
      release();
      await pending;
    });
    assert.equal((await readDraft("real-ground-view-v2")).recordId, first.id);
    assert.equal(
      attempts[0],
      first.id,
      "retry reuses the initially reserved ID",
    );
    await mount();
    await click(r, "개정 저장");
    assert.equal(records.length, 1);
    assert.equal(records[0].id, first.id);
    assert.equal(records[0].revision, 2);
    assert.equal((await listRevisions(first.id)).length, 2);
  } finally {
    release();
    await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});

test("Explicit observation and model links focus their destinations, including repeated selection, without hijacking normal tab navigation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).endsWith("site-assets.json") ? assets : { points: [] },
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  await writeDraft("real-ground-view-v2", initial);
  const events = [];
  const targets = new Set([
    "real-ground-hole-detail",
    "real-ground-model-toolbar",
    "real-ground-original-heading",
  ]);
  let r;
  await act(async () => {
    r = create(
      React.createElement(RealGroundPage, {
        records: [],
        notify() {},
        onSave() {
          throw new Error("This navigation test must not save a record");
        },
      }),
      {
        createNodeMock(element) {
          if (!targets.has(element.props.id)) return null;
          return {
            focus(options) {
              events.push({
                action: "focus",
                id: element.props.id,
                label: element.props["aria-label"],
                options,
              });
            },
            scrollIntoView(options) {
              events.push({ action: "scroll", id: element.props.id, options });
            },
          };
        },
      },
    );
  });
  await act(settle);
  const expectDestination = (id, label) => {
    assert.equal(
      events.length,
      2,
      "one focus and one scroll per explicit action",
    );
    assert.deepEqual(events[0], {
      action: "focus",
      id,
      label,
      options: { preventScroll: true },
    });
    assert.deepEqual(events[1], {
      action: "scroll",
      id,
      options: { block: "start", inline: "nearest", behavior: "auto" },
    });
    assert.equal(r.root.findByProps({ id }).props.tabIndex, -1);
    events.length = 0;
  };
  try {
    await click(r, "3D·단면");
    assert.deepEqual(events, [], "normal tab navigation retains its own focus");
    await click(r, "선택 공의 관측 자료");
    expectDestination("real-ground-hole-detail", "2022-08 NBH-6 관측 자료");

    const selectedRow = () =>
      field(r, "2022-08 NBH-6 관측 자료 보기").parent.parent;
    await act(async () => selectedRow().props.onClick());
    expectDestination("real-ground-hole-detail", "2022-08 NBH-6 관측 자료");
    await act(async () => selectedRow().props.onClick());
    expectDestination("real-ground-hole-detail", "2022-08 NBH-6 관측 자료");

    const other = source.holes.find((h) => h.campaign === "2021-02");
    let propagationStopped = false;
    await act(async () =>
      field(r, `${other.campaign} ${other.label} 관측 자료 보기`).props.onClick(
        {
          stopPropagation() {
            propagationStopped = true;
          },
        },
      ),
    );
    assert.equal(
      propagationStopped,
      true,
      "the row button must not navigate twice",
    );
    expectDestination(
      "real-ground-hole-detail",
      `${other.campaign} ${other.label} 관측 자료`,
    );
    assert.equal(
      textOf(r.root.findByProps({ id: "real-ground-hole-detail" })),
      other.label,
    );

    await click(r, "선택 공의 3D·단면 보기");
    expectDestination("real-ground-model-toolbar", "3D·단면 모델 조작");
    assert.equal(field(r, "모델 시추공").props.value, other.id);
    await click(r, "조사자료");
    assert.deepEqual(
      events,
      [],
      "returning through the tab must not reuse the old destination request",
    );
    await click(r, "지층 자료·출처 보기");
    expectDestination("real-ground-original-heading", undefined);
  } finally {
    await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});

test("A press on a map borehole selects it, while dragging from that marker pans without changing selection", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => assets });
  const selected = [];
  let r;
  await act(async () => {
    r = create(
      React.createElement(RealSiteMap, {
        assets,
        holes: source.holes,
        selected: source.holes[0].id,
        onSelect: (id) => selected.push(id),
      }),
    );
  });
  try {
    const svg = () =>
      r.root.findAllByType("svg").find((node) => node.props.role === "group");
    const id = source.holes[0].id;
    const currentTarget = {
      setPointerCapture() {},
      getBoundingClientRect: () => ({ width: 900, height: 520 }),
    };
    const press = {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 200,
      currentTarget,
      target: { closest: () => ({ getAttribute: () => id }) },
    };
    await act(async () => svg().props.onPointerDown(press));
    await act(async () => svg().props.onPointerUp(press));
    assert.deepEqual(selected, [id]);
    const originalViewBox = svg().props.viewBox;
    await act(async () => svg().props.onPointerDown(press));
    await act(async () =>
      svg().props.onPointerMove({ ...press, clientX: 350, clientY: 230 }),
    );
    assert.notEqual(svg().props.viewBox, originalViewBox);
    await act(async () =>
      svg().props.onPointerUp({ ...press, clientX: 350, clientY: 230 }),
    );
    assert.deepEqual(
      selected,
      [id],
      "dragging must not also select the marker",
    );
    const marker = () => r.root.findByProps({ "data-hole-id": id });
    assert.equal(marker().props["aria-pressed"], true);
    let prevented = false;
    await act(async () =>
      marker().props.onKeyDown({
        key: " ",
        preventDefault() {
          prevented = true;
        },
      }),
    );
    assert.equal(prevented, true);
    assert.deepEqual(
      selected,
      [id, id],
      "keyboard selection remains available",
    );
    await act(async () => svg().props.onPointerDown(press));
    await act(async () => svg().props.onPointerCancel());
    await act(async () => svg().props.onPointerUp(press));
    assert.deepEqual(selected, [id, id], "a cancelled touch must not select");
    await act(async () => marker().props.onClick({ detail: 0 }));
    assert.deepEqual(
      selected,
      [id, id, id],
      "assistive activation works without pointer events",
    );
    await act(async () => marker().props.onClick({ detail: 1 }));
    assert.deepEqual(
      selected,
      [id, id, id],
      "a pointer click is not counted twice",
    );
  } finally {
    await act(async () => r.unmount());
    globalThis.fetch = originalFetch;
  }
});
