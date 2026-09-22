import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sliceClosedMesh } from "../../src/features/ground/mesh-slicer.mjs";
import {
  createRealWorkspace,
  computeWorkspace,
  updateValue,
  updateQuantity,
} from "../../src/features/design/model.mjs";
import ground from "./ground-demo.json";
import monitoring from "./monitoring-demo.json";
import license from "./three-license.txt";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  fmt = (v, n = 2) =>
    Number(v).toLocaleString("en-US", {
      minimumFractionDigits: n,
      maximumFractionDigits: n,
    });
let current = 0,
  groundReady = false,
  groundAvailable = false,
  rafId = 0;
const notes = [
  "현장에서는 도면, 계산서, 계측보고서를 각각 열어 같은 위치와 조건을 다시 찾아야 합니다. AutoGeo는 이 자료를 하나의 검토 흐름으로 연결합니다. 땅을 이해하고, 부재를 검토하고, 현장의 변화를 확인한 다음 조치까지 이어갑니다. 지금부터 직접 움직여 보겠습니다.",
  "슬라이더를 움직여 보겠습니다. 주상도에서 만든 채워진 지층을 같은 표고에서 잘라 볼 수 있습니다. 도면경계를 겹쳐 구조물과 지층의 위치 관계를 읽습니다. 경계 밖 10m까지 확장했지만 시추공 밖은 외삽 추정입니다. 암반 바닥 역시 관측한 바닥이 아닌 표시 하한입니다.",
  "계산서 채택 반력 45.62를 시연값 60으로 바꿔 보겠습니다. 소요 설계축력과 초기 긴장력이 바뀌고, 그 결과가 띠장 반력에도 이어집니다. 실제 앱과 같은 계산 엔진이므로 숫자와 계산 근거가 함께 갱신됩니다. 외부 탄소성해석 자체는 사용자가 수행하고 결과를 채택하는 구조입니다.",
  "INC-1을 선택하면 도면에서 어디에 있는지와 누적변위 추세를 함께 읽습니다. F-2로 바꾸면 위치와 그래프도 바뀝니다. 이 유량계는 자료와 기준 단위 확인이 필요해 판정을 보류합니다. 값을 보여 주는 것에서 그치지 않고 무엇을 더 확인해야 하는지 연결합니다.",
  "결과 숫자만 남으면 다음 사람이 판단 근거를 다시 찾아야 합니다. AutoGeo는 입력과 결과, 개정, 확인과 조치를 이어 갑니다. 여기서는 설명용 흐름을 눌러 볼 수 있고 실제 앱에서 검토를 저장할 수 있습니다. 현장의 근거가 다음 업무의 출발점이 되도록 만들었습니다.",
];
function go(n) {
  cancelAnimationFrame(rafId);
  current = Math.max(0, Math.min(4, n));
  $$(".slide").forEach((el, i) => {
    el.hidden = i !== current;
    el.classList.toggle("enter", i === current);
    if (i === current) el.scrollTop = 0;
  });
  $$(".progress [data-go]").forEach((el) =>
    el.setAttribute("aria-current", String(+el.dataset.go === current)),
  );
  $("#slide-count").textContent = `0${current + 1} / 05`;
  $("#prev").disabled = current === 0;
  $("#next").disabled = current === 4;
  $("#notes").innerHTML =
    `<strong>발표 노트 · ${current + 1} / 5</strong>${notes[current]}`;
  history.replaceState(null, "", `#${current + 1}`);
  if (current === 1) {
    if (!groundReady) {
      groundReady = true;
      requestAnimationFrame(initGround);
    } else {
      resizeGround();
      rafId = requestAnimationFrame(render);
    }
  }
}
$$("[data-go]").forEach((el) =>
  el.addEventListener("click", () => go(+el.dataset.go)),
);
$("#prev").onclick = () => go(current - 1);
$("#next").onclick = () => go(current + 1);
addEventListener("keydown", (e) => {
  if (
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    ["INPUT", "TEXTAREA", "SELECT", "SUMMARY"].includes(e.target.tagName) ||
    e.target.isContentEditable
  )
    return;
  if (e.key === "ArrowRight" || e.key === "PageDown") {
    e.preventDefault();
    go(current + 1);
  }
  if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    go(current - 1);
  }
  if (e.key === "Home") {
    e.preventDefault();
    go(0);
  }
  if (e.key === "End") {
    e.preventDefault();
    go(4);
  }
});
$("#notes-toggle").onclick = () => {
  const open = $("#notes").hidden;
  $("#notes").hidden = !open;
  $("#notes-toggle").setAttribute("aria-expanded", String(open));
};
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    $("#fullscreen").textContent = "브라우저 메뉴에서 전체 화면";
  }
};
$("#three-license").textContent = license;
$(".brand").onclick = (e) => {
  e.preventDefault();
  go(0);
};
let renderer,
  scene,
  camera,
  controls,
  layerGroup,
  lineGroup,
  fullModel = true,
  topView = false,
  cutTimer,
  z = 50.5,
  cuts = [];
const sourceLayers = ground.layers.map((l) => ({
  ...l,
  positions: l.indices.flatMap((i) => ground.positions.slice(i * 3, i * 3 + 3)),
}));
function threePositions(p) {
  const a = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    a[i] = p[i];
    a[i + 1] = p[i + 2] * 1.5;
    a[i + 2] = -p[i + 1];
  }
  return a;
}
function clearGroup(g) {
  if (!g) return;
  while (g.children.length) {
    const child = g.children[0];
    child.geometry?.dispose();
    child.material?.dispose();
    g.remove(child);
  }
}
function makeLine(points, color, dashed = false) {
  const g = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(p[0], p[2] * 1.5, -p[1])),
  );
  const m = dashed
    ? new THREE.LineDashedMaterial({
        color,
        dashSize: 3,
        gapSize: 2,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      })
    : new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      });
  const l = new THREE.Line(g, m);
  l.computeLineDistances();
  l.renderOrder = 3;
  return l;
}
function initGround() {
  try {
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute(
      "aria-label",
      "드래그로 회전하는 3D 지층 모델",
    );
    renderer.domElement.setAttribute("role", "img");
    $("#ground-stage").prepend(renderer.domElement);
    camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    camera.position.set(280, 240, 300);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -6, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 140;
    controls.maxDistance = 1000;
    controls.maxPolarAngle = Math.PI * 0.84;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5b707b, 2.7));
    const light = new THREE.DirectionalLight(0xfff4de, 2.5);
    light.position.set(-150, 300, 100);
    scene.add(light);
    layerGroup = new THREE.Group();
    lineGroup = new THREE.Group();
    scene.add(layerGroup, lineGroup);
    const grid = new THREE.GridHelper(340, 17, 0x46626a, 0x263c46);
    grid.position.y = -31;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    scene.add(grid);
    groundAvailable = true;
    resizeGround();
    new ResizeObserver(resizeGround).observe($("#ground-stage"));
  } catch (e) {
    $("#model-error").hidden = false;
    console.warn("WebGL fallback", e);
  }
  updateGround();
  render();
}
function resizeGround() {
  if (!groundAvailable || current !== 1) return;
  const r = $("#ground-stage").getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.zoom = Math.min(1, camera.aspect / 1.45);
  camera.updateProjectionMatrix();
}
function updateGround() {
  cuts = sourceLayers.map((l) => ({
    ...l,
    ...(fullModel
      ? { positions: l.positions, capPositions: [] }
      : sliceClosedMesh(
          { positions: l.positions },
          { axis: "z", value: z - 50, keep: "below" },
        )),
  }));
  clearGroup(layerGroup);
  clearGroup(lineGroup);
  if (groundAvailable) {
    for (const l of cuts) {
      if (!l.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(threePositions(l.positions), 3),
      );
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: l.color,
          roughness: 0.9,
          metalness: 0,
          side: THREE.DoubleSide,
          flatShading: false,
        }),
      );
      layerGroup.add(mesh);
    }
    const lineH = fullModel ? 20 : z - 50 + 0.15;
    if ($("#boundary-toggle").checked) {
      const pts = [...ground.cadBoundaryEN, ground.cadBoundaryEN[0]].map(
        (p) => [...p, lineH],
      );
      lineGroup.add(makeLine(pts, 0xf8db9c));
    }
    lineGroup.add(
      makeLine(
        [...ground.observationHullEN, ground.observationHullEN[0]].map((p) => [
          ...p,
          lineH,
        ]),
        0xffffff,
        true,
      ),
    );
    for (const h of ground.holes) {
      const top = Math.min(h.position[2], fullModel ? 99 : z - 50);
      const bottom = Math.max(
        -20,
        h.position[2] - Math.max(...h.layers.map((l) => l.to)),
      );
      if (top <= bottom) continue;
      lineGroup.add(
        makeLine(
          [
            [h.position[0], h.position[1], bottom],
            [h.position[0], h.position[1], top],
          ],
          0xe8faef,
        ),
      );
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1.25, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xf7fff9, depthTest: false }),
      );
      dot.position.set(h.position[0], top * 1.5 + 0.6, -h.position[1]);
      dot.renderOrder = 4;
      lineGroup.add(dot);
    }
  }
  $("#cut-status").textContent = fullModel ? "전체 지층" : "수평 절단";
  $("#z-value").textContent = fmt(z, 1);
  $("#ground-reset").textContent = fullModel ? "Z 절단 보기" : "전체 지층";
  drawSection();
}
function drawSection() {
  const c = $("#section-map"),
    ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const [x0, y0, x1, y1] = ground.localBoundsEN;
  const scale = Math.min(
    (c.width - 48) / (x1 - x0),
    (c.height - 48) / (y1 - y0),
  );
  const px = (x) => (x - x0) * scale + (c.width - (x1 - x0) * scale) / 2,
    py = (y) => (y1 - y) * scale + 24;
  ctx.fillStyle = "#e4ebe2";
  ctx.fillRect(px(x0), py(y1), scale * (x1 - x0), scale * (y1 - y0));
  const mapCuts = fullModel
    ? sourceLayers.map((l) => ({
        ...l,
        ...sliceClosedMesh(
          { positions: l.positions },
          { axis: "z", value: z - 50, keep: "below" },
        ),
      }))
    : cuts;
  for (const l of mapCuts) {
    ctx.fillStyle = l.color;
    ctx.beginPath();
    const p = l.capPositions;
    for (let i = 0; i < p.length; i += 9) {
      ctx.moveTo(px(p[i]), py(p[i + 1]));
      ctx.lineTo(px(p[i + 3]), py(p[i + 4]));
      ctx.lineTo(px(p[i + 6]), py(p[i + 7]));
      ctx.closePath();
    }
    ctx.fill();
  }
  const line = (pts, color, dashed, width) => {
    ctx.beginPath();
    pts.forEach((p, i) =>
      i ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1])),
    );
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.lineWidth = width;
    ctx.stroke();
  };
  line(ground.observationHullEN, "#faffed", true, 1.8);
  if ($("#boundary-toggle").checked)
    line(ground.cadBoundaryEN, "#a46429", false, 3);
  ctx.setLineDash([]);
  for (const h of ground.holes) {
    ctx.beginPath();
    ctx.arc(px(h.position[0]), py(h.position[1]), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#526d70";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = "#38574d";
  ctx.font = "16px sans-serif";
  ctx.fillText("N ↑", c.width - 49, 24);
  $("#map-caption").textContent =
    `EL.${fmt(z, 1)} m · ${fullModel ? "Z 평면 미리보기" : "같은 메쉬의 절단면"}`;
}
function render() {
  if (current !== 1 || !groundAvailable) return;
  controls.update();
  renderer.render(scene, camera);
  rafId = requestAnimationFrame(render);
}
$("#z-slider").oninput = (e) => {
  z = +e.target.value;
  fullModel = false;
  $("#z-value").textContent = fmt(z, 1);
  $("#cut-status").textContent = "평면 갱신 중";
  clearTimeout(cutTimer);
  cutTimer = setTimeout(updateGround, 90);
};
$("#boundary-toggle").onchange = updateGround;
$("#ground-reset").onclick = () => {
  fullModel = !fullModel;
  updateGround();
};
$("#ground-top").onclick = () => {
  if (!groundAvailable) return;
  topView = !topView;
  camera.position.set(...(topView ? [0, 470, 0.001] : [280, 240, 300]));
  controls.target.set(0, -6, 0);
  controls.update();
  $("#ground-top").setAttribute("aria-pressed", String(topView));
};
const original = createRealWorkspace(),
  baseline = computeWorkspace(original);
function setReaction(v) {
  if (!Number.isFinite(v) || v < 10 || v > 150) {
    $("#design-error").textContent =
      "시연 범위 10~150 kN/m 안에서 입력해 주세요.";
    $("#reaction-number").setAttribute("aria-invalid", "true");
    for (const id of [
      "anchor-force",
      "wale-force",
      "anchor-design",
      "wale-moment",
      "anchor-ratio",
      "wale-ratio",
      "design-step",
      "wale-step",
    ])
      $("#" + id).textContent = "—";
    $("#anchor-delta").textContent = "유효한 입력 후 계산됩니다";
    $("#wale-delta").textContent = "유효한 입력 후 계산됩니다";
    $("#anchor-meter").style.width = "0%";
    $("#wale-meter").style.width = "0%";
    return false;
  }
  $("#design-error").textContent = "";
  $("#reaction-number").removeAttribute("aria-invalid");
  $("#reaction-range").value = v;
  let state = updateValue(original, "anchor", "reactionKnPerM", String(v));
  if (v !== 45.62)
    state = updateQuantity(state, "anchor", "reactionKnPerM", {
      stage: "발표 시연",
      evidence: "발표용 반력 변경",
    });
  const r = computeWorkspace(state);
  if (!r.anchor.ok || !r.wale.ok) {
    $("#design-error").textContent = "입력 조건을 다시 확인해 주세요.";
    return false;
  }
  const a = r.anchor.results,
    w = r.wale.results;
  $("#anchor-force").textContent = fmt(a.jackingForceKn);
  $("#wale-force").textContent = fmt(w.supportReactionKn);
  $("#anchor-design").textContent = `${fmt(a.designForceKn)} kN`;
  $("#wale-moment").textContent = `${fmt(w.momentKnm)} kN·m`;
  $("#anchor-ratio").textContent = `${fmt(a.tensionUtilization * 100, 1)}%`;
  $("#wale-ratio").textContent = `${fmt(w.governingUtilization * 100, 1)}%`;
  $("#anchor-meter").style.width =
    `${Math.min(100, a.tensionUtilization * 100)}%`;
  $("#wale-meter").style.width =
    `${Math.min(100, w.governingUtilization * 100)}%`;
  const delta = (n) => `${n >= 0 ? "+" : ""}${fmt(n)} kN`;
  $("#anchor-delta").textContent =
    v === 45.62
      ? "계산서 채택값 기준"
      : `채택값 대비 ${delta(a.jackingForceKn - baseline.anchor.results.jackingForceKn)}`;
  $("#wale-delta").textContent =
    v === 45.62
      ? "앵커 긴장력을 연결"
      : `채택값 대비 ${delta(w.supportReactionKn - baseline.wale.results.supportReactionKn)}`;
  $("#design-step").textContent =
    `${fmt(v)} × 1.8 = ${fmt(a.designForceKn)} kN`;
  $("#wale-step").textContent =
    `${fmt(a.jackingForceKn)} × cos 35° × 393/550 = ${fmt(w.supportReactionKn)} kN`;
  return true;
}
$("#reaction-number").oninput = $("#reaction-number").onchange = (e) =>
  setReaction(e.target.value === "" ? NaN : Number(e.target.value));
$("#reaction-range").oninput = (e) => {
  $("#reaction-number").value = e.target.value;
  setReaction(+e.target.value);
};
$("#reaction-original").onclick = () => {
  $("#reaction-number").value = 45.62;
  setReaction(45.62);
};
$("#reaction-demo").onclick = () => {
  $("#reaction-number").value = 60;
  setReaction(60);
};
setReaction(45.62);
const ns = "http://www.w3.org/2000/svg",
  svgEl = (name, attrs) => {
    const e = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
const mapSvg = svgEl("svg", {
  viewBox: monitoring.plan.viewBox.join(" "),
  role: "group",
  "aria-label": "보고서 평면도의 계측기 대략 위치",
});
for (const g of monitoring.plan.geometry) {
  const line = svgEl("polyline", {
    points: g.points
      .concat(g.closed ? [g.points[0]] : [])
      .map((p) => p.join(","))
      .join(" "),
    fill: "none",
    stroke:
      g.kind === "boundary"
        ? "#6b8c81"
        : g.kind === "retaining"
          ? "#8ba19b"
          : "#c0cdc5",
    "stroke-width": g.kind === "boundary" ? 3 : 1.3,
  });
  mapSvg.append(line);
}
const dotGroup = svgEl("g", {});
mapSvg.append(dotGroup);
$("#monitor-map").append(mapSvg);
function sensorSelect(id) {
  const s = monitoring.sensors.find((x) => x.id === id);
  $$("[data-sensor]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.sensor === id)),
  );
  $("#sensor-name").textContent = `${s.id} ${s.label}`;
  $("#sensor-location").textContent = s.location;
  $("#sensor-value").textContent = fmt(s.evaluation.latest, 3);
  $("#sensor-unit").textContent = s.unit;
  $("#chart-metric").textContent = s.metric;
  const last = s.rows.at(-1);
  $("#chart-date").textContent = `최근 ${last.date}`;
  $("#sensor-note").classList.toggle("warning", id === "F-2");
  $("#sensor-note").textContent =
    id === "INC-1"
      ? "누적변위 1차 기준 10.81 mm 이내. 차트는 추세를 읽기 위해 Y축 0~2 mm로 확대했습니다. 속도기준은 별도 확인이 필요합니다."
      : "판정 보류 · 원시표와 요약값, 관리기준 단위의 확인이 필요합니다. 음수 원시값을 그대로 표시하고 초기 미기록값은 선에서 제외했습니다.";
  dotGroup.replaceChildren();
  for (const point of monitoring.sensors) {
    if (!point.point) continue;
    const active = point.id === id,
      clickable = ["INC-1", "F-2"].includes(point.id);
    if (active) {
      dotGroup.append(
        svgEl("circle", {
          cx: point.point[0],
          cy: point.point[1],
          r: 32,
          fill: "#4c94792a",
        }),
      );
    }
    const dot = svgEl("circle", {
      cx: point.point[0],
      cy: point.point[1],
      r: active ? 12 : clickable ? 10 : 4.5,
      fill: active ? "#126a53" : clickable ? "#53a589" : "#8faba2",
      stroke: clickable ? "#fff" : "none",
      "stroke-width": 3,
      ...(clickable
        ? {
            role: "button",
            tabindex: 0,
            "aria-label": `${point.id} 계측기 선택`,
          }
        : { "aria-hidden": "true" }),
    });
    if (clickable) {
      dot.style.cursor = "pointer";
      dot.addEventListener("click", () => sensorSelect(point.id));
      dot.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          sensorSelect(point.id);
        }
      });
    }
    dotGroup.append(dot);
    if (active) {
      const t = svgEl("text", {
        x: point.point[0] + 20,
        y: point.point[1] - 14,
        fill: "#164f40",
        "font-size": 23,
        "font-weight": 700,
        stroke: "#edf1e9",
        "stroke-width": 5,
        "paint-order": "stroke",
      });
      t.textContent = id;
      dotGroup.append(t);
    }
  }
  drawChart(s);
}
function drawChart(s) {
  const width = 630,
    height = 220,
    left = 48,
    right = 12,
    top = 20,
    bottom = 30,
    rows = s.rows,
    ts = rows.map((r) => Date.parse(r.date));
  const xmin = Math.min(...ts),
    xmax = Math.max(...ts);
  const vals = rows.map((r) => r.value).filter(Number.isFinite);
  const ymin = s.id === "INC-1" ? 0 : Math.min(...vals) - 20,
    ymax = s.id === "INC-1" ? 2 : Math.max(...vals) + 20;
  const x = (v) => left + ((v - xmin) / (xmax - xmin)) * (width - left - right),
    y = (v) => top + ((ymax - v) / (ymax - ymin)) * (height - top - bottom);
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${s.id} ${s.metric} 시계열. 최근 ${s.evaluation.latest} ${s.unit}`,
  });
  for (let i = 0; i < 5; i++) {
    const v = ymin + ((ymax - ymin) * i) / 4,
      yy = y(v);
    svg.append(
      svgEl("line", {
        x1: left,
        x2: width - right,
        y1: yy,
        y2: yy,
        stroke: "#304550",
        "stroke-width": 1,
      }),
    );
    const t = svgEl("text", {
      x: left - 10,
      y: yy + 4,
      "text-anchor": "end",
      fill: "#aebfc2",
      "font-size": 11,
    });
    t.textContent = fmt(v, s.id === "INC-1" ? 1 : 0);
    svg.append(t);
  }
  let d = "",
    pen = false;
  rows.forEach((r, i) => {
    if (!Number.isFinite(r.value)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(ts[i])},${y(r.value)} `;
    pen = true;
  });
  svg.append(
    svgEl("path", {
      d,
      fill: "none",
      stroke: s.id === "INC-1" ? "#a5e5ce" : "#f0bc91",
      "stroke-width": 3,
      "stroke-linejoin": "round",
    }),
  );
  rows.forEach((r, i) => {
    if (!Number.isFinite(r.value)) return;
    const dot = svgEl("circle", {
      cx: x(ts[i]),
      cy: y(r.value),
      r: 3.7,
      fill: s.id === "INC-1" ? "#d8f68f" : "#f0bc91",
    });
    const title = svgEl("title", {});
    title.textContent = `${r.date}: ${r.value} ${s.unit}`;
    dot.append(title);
    svg.append(dot);
  });
  for (const i of [0, Math.floor((rows.length - 1) / 2), rows.length - 1]) {
    const t = svgEl("text", {
      x: x(ts[i]),
      y: height - 7,
      "text-anchor":
        i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle",
      fill: "#aebfc2",
      "font-size": 11,
    });
    t.textContent = rows[i].date.slice(5).replace("-", ".");
    svg.append(t);
  }
  $("#monitor-chart").replaceChildren(svg);
}
$$("[data-sensor]").forEach(
  (b) => (b.onclick = () => sensorSelect(b.dataset.sensor)),
);
sensorSelect("INC-1");
const records = [
  {
    title: "결과와 함께, 판단 조건도.",
    items: [
      "채택한 입력과 계산 결과",
      "자료 출처와 검토 메모",
      "연결 부재의 계산 근거",
    ],
    desc: "실제 앱의 검토 저장에서 현재 조건을 보관합니다. 다음 검토에서 같은 근거를 다시 확인할 수 있습니다.",
  },
  {
    title: "무엇이 바뀌었는지.",
    items: [
      "이전 검토와 현재 개정",
      "입력과 결과의 변경 내용",
      "다시 확인해야 할 해석 조건",
    ],
    desc: "수정 전후의 조건을 비교하고, 이전 근거를 그대로 쓸 수 있는지 확인합니다.",
  },
  {
    title: "확인이 필요한 부분을 조치로.",
    items: [
      "계측·자료 불일치 확인",
      "조사 내용과 근거 첨부",
      "조치 상태와 검토 기록",
    ],
    desc: "현장에서 확인할 사항을 등록하고 조치 내용을 남깁니다. 이 화면의 카드는 기능 설명이며 실제 현장 기록이 아닙니다.",
  },
  {
    title: "다음 점검까지 이어지는 기록.",
    items: [
      "조치 이후 재점검",
      "관련 자료와 개정 연결",
      "JSON으로 기록 내보내기",
    ],
    desc: "다음 담당자가 판단의 흐름을 다시 확인할 수 있도록 합니다. 저장 범위는 현재 브라우저입니다.",
  },
];
function recordSelect(n) {
  const r = records[n];
  $("#record-title").textContent = r.title;
  $("#record-list").replaceChildren(
    ...r.items.map((t) => {
      const div = document.createElement("div");
      div.textContent = t;
      return div;
    }),
  );
  $("#record-desc").textContent = r.desc;
  $$("[data-record]").forEach((b) =>
    b.setAttribute("aria-pressed", String(+b.dataset.record === n)),
  );
}
$$("[data-record]").forEach(
  (b) => (b.onclick = () => recordSelect(+b.dataset.record)),
);
recordSelect(0);
go(/^#[1-5]$/.test(location.hash) ? +location.hash.slice(1) - 1 : 0);
