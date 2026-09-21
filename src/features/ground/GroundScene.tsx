import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EXCAVATION, STRATA, horizonsFor, convexHull } from "./engine.mjs";

type Hole = {
  id: string;
  easting: number;
  northing: number;
  collar: number;
  totalDepth: number;
  layers: { id: string; from: number; to: number }[];
};
type Point = {
  e: number;
  n: number;
  heights: number[];
  variance: number;
  extrapolated: boolean;
  crossed: boolean;
};
export type GroundGrid = {
  nx: number;
  ny: number;
  points: Point[];
  maxVariance: number;
};
type Props = {
  grid: GroundGrid;
  holes: Hole[];
  selected: string;
  onSelect: (id: string) => void;
  sectionNorth: number;
  depth: number;
  layers: boolean[];
  showHoles: boolean;
  showVariance: boolean;
  verticalScale: number;
  resetKey: number;
  planView: boolean;
};
type Viewer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  data: THREE.Group;
  render: () => void;
  pickables: THREE.Object3D[];
};
const local = (e: number, n: number, h: number, scale: number) =>
  new THREE.Vector3(e - 60, (h - 8) * scale, 50 - n);
function disposeTree(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    if (m.material)
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((a) => {
        mats.add(a);
        const map = (a as THREE.MeshBasicMaterial).map;
        if (map) textures.add(map);
      });
  });
  mats.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
function label(text: string, color = "#455265", scale = 1) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 80;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 80);
  ctx.font = "700 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,.95)";
  ctx.strokeText(text, 128, 40);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 40);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  sprite.scale.set(22 * scale, 6.8 * scale, 1);
  sprite.userData.labelPixelWidth = 80 * scale;
  return sprite;
}
function line(points: THREE.Vector3[], color: string, width = 1) {
  const material = new THREE.LineBasicMaterial({
    color,
    linewidth: width,
    transparent: true,
    opacity: 0.8,
  });
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    material,
  );
}
function quad(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  positions: number[],
) {
  positions.push(
    ...a.toArray(),
    ...b.toArray(),
    ...c.toArray(),
    ...a.toArray(),
    ...c.toArray(),
    ...d.toArray(),
  );
}

export default function GroundScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<Viewer | null>(null),
    select = useRef(props.onSelect);
  const [error, setError] = useState("");
  select.current = props.onSelect;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setError(
        "3D를 표시할 수 없는 환경입니다. 아래 단면과 시추표에서 같은 모델을 확인하세요.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#F0F4F6");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "합성 시추공과 크리깅 지층 3D. 마우스로 회전·확대하며 공을 선택할 수 있습니다.",
    );
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
    camera.position.set(155, 130, 165);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 15, 0);
    controls.minDistance = 55;
    controls.maxDistance = 520;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.enableDamping = false;
    controls.update();
    scene.add(new THREE.HemisphereLight("#ffffff", "#708493", 2.3));
    const sun = new THREE.DirectionalLight("#fff3e5", 3.1);
    sun.position.set(-60, 140, 90);
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#d3e6ff", 1.1);
    fill.position.set(80, 35, -80);
    scene.add(fill);
    const gridHelper = new THREE.GridHelper(180, 18, "#BDCADA", "#DCE3EA");
    gridHelper.position.y = -0.2;
    scene.add(gridHelper);
    const data = new THREE.Group();
    scene.add(data);
    const render = () => {
      const height = Math.max(1, renderer.domElement.clientHeight);
      data.traverse((o) => {
        if (o instanceof THREE.Sprite && o.userData.labelPixelWidth) {
          o.visible =
            renderer.domElement.clientWidth >= 500 || !o.userData.hideOnNarrow;
          const span =
            (2 *
              Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
              camera.position.distanceTo(o.position)) /
            camera.zoom;
          const width = (span * o.userData.labelPixelWidth) / height;
          o.scale.set(width, (width * 80) / 256, 1);
        }
      });
      renderer.render(scene, camera);
    };
    const v = {
      scene,
      camera,
      controls,
      renderer,
      data,
      render,
      pickables: [] as THREE.Object3D[],
    };
    viewer.current = v;
    controls.addEventListener("change", render);
    const resize = () => {
      const rect = el.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.zoom = Math.min(1, camera.aspect / 1.3);
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(v.pickables, false)[0];
      if (hit?.object.userData.holeId)
        select.current(String(hit.object.userData.holeId));
    };
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        "3D 표시가 중단되었습니다. 페이지를 새로고침하거나 아래 단면을 확인하세요.",
      );
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      viewer.current = null;
    };
  }, []);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const {
      grid,
      holes,
      layers,
      depth,
      showHoles,
      showVariance,
      verticalScale: s,
      sectionNorth,
      selected,
    } = props;
    disposeTree(v.data);
    v.data.clear();
    v.pickables = [];
    const at = (p: Point, h: number) => local(p.e, p.n, h, s);
    const floor = 36 - depth;
    const inCut = (e: number, n: number) =>
      depth > 0 &&
      e > EXCAVATION.minE &&
      e < EXCAVATION.maxE &&
      n > EXCAVATION.minN &&
      n < EXCAVATION.maxN;
    for (let k = 0; k < 4; k++) {
      if (!layers[k]) continue;
      const positions: number[] = [],
        colors: number[] = [];
      const base = new THREE.Color(STRATA[k].color);
      for (let j = 0; j < grid.ny - 1; j++)
        for (let i = 0; i < grid.nx - 1; i++) {
          const ps = [
            grid.points[j * grid.nx + i],
            grid.points[j * grid.nx + i + 1],
            grid.points[(j + 1) * grid.nx + i + 1],
            grid.points[(j + 1) * grid.nx + i],
          ];
          const cut = inCut((ps[0].e + ps[2].e) / 2, (ps[0].n + ps[2].n) / 2);
          if (cut && ps.every((p) => p.heights[k + 1] >= floor)) continue;
          const points = ps.map((p) =>
            at(p, cut ? Math.min(p.heights[k], floor) : p.heights[k]),
          );
          quad(points[0], points[3], points[2], points[1], positions);
          const variance = ps.reduce((sum, p) => sum + p.variance, 0) / 4;
          const color = showVariance
            ? new THREE.Color().setHSL(
                0.59 - (variance / Math.max(grid.maxVariance, 0.001)) * 0.5,
                0.65,
                0.66,
              )
            : base;
          for (let z = 0; z < 6; z++) colors.push(color.r, color.g, color.b);
        }
      // Exterior geological block and the four excavated faces.
      const edge = (a: Point, b: Point, excavated = false) => {
        const topA = excavated ? Math.max(floor, a.heights[k]) : a.heights[k],
          topB = excavated ? Math.max(floor, b.heights[k]) : b.heights[k];
        const lowA = excavated
            ? Math.max(floor, a.heights[k + 1])
            : a.heights[k + 1],
          lowB = excavated
            ? Math.max(floor, b.heights[k + 1])
            : b.heights[k + 1];
        if (topA - lowA < 1e-7 && topB - lowB < 1e-7) return;
        quad(at(a, topA), at(b, topB), at(b, lowB), at(a, lowA), positions);
        const c = base.clone().multiplyScalar(excavated ? 0.91 : 0.83);
        for (let z = 0; z < 6; z++) colors.push(c.r, c.g, c.b);
      };
      for (let i = 0; i < grid.nx - 1; i++) {
        edge(grid.points[i], grid.points[i + 1]);
        edge(
          grid.points[(grid.ny - 1) * grid.nx + i],
          grid.points[(grid.ny - 1) * grid.nx + i + 1],
        );
      }
      for (let j = 0; j < grid.ny - 1; j++) {
        edge(grid.points[j * grid.nx], grid.points[(j + 1) * grid.nx]);
        edge(
          grid.points[j * grid.nx + grid.nx - 1],
          grid.points[(j + 1) * grid.nx + grid.nx - 1],
        );
      }
      if (depth > 0) {
        for (let j = 0; j < grid.ny - 1; j++)
          for (let i = 0; i < grid.nx - 1; i++) {
            const a = grid.points[j * grid.nx + i],
              b = grid.points[j * grid.nx + i + 1],
              c = grid.points[(j + 1) * grid.nx + i];
            if (
              a.e >= EXCAVATION.minE &&
              b.e <= EXCAVATION.maxE &&
              (a.n === EXCAVATION.minN || a.n === EXCAVATION.maxN)
            )
              edge(a, b, true);
            if (
              a.n >= EXCAVATION.minN &&
              c.n <= EXCAVATION.maxN &&
              (a.e === EXCAVATION.minE || a.e === EXCAVATION.maxE)
            )
              edge(a, c, true);
          }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.92,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      );
      v.data.add(mesh);
    }
    if (showHoles)
      holes.forEach((h) => {
        const hs = horizonsFor(h),
          active = h.id === selected;
        h.layers.forEach((_, k) => {
          const top = hs[k],
            bottom = hs[k + 1],
            geometry = new THREE.CylinderGeometry(
              active ? 1.2 : 0.72,
              active ? 1.2 : 0.72,
              (top - bottom) * s,
              12,
            );
          const material = new THREE.MeshStandardMaterial({
            color: STRATA[k].color,
            roughness: 0.5,
            emissive: active ? "#385FA3" : "#000000",
            emissiveIntensity: active ? 0.28 : 0,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.copy(
            local(h.easting, h.northing, (top + bottom) / 2, s),
          );
          mesh.userData.holeId = h.id;
          v.pickables.push(mesh);
          v.data.add(mesh);
        });
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(active ? 1.7 : 1.1, 16, 10),
          new THREE.MeshStandardMaterial({
            color: active ? "#0F6FFF" : "#FFFFFF",
            roughness: 0.3,
          }),
        );
        head.position.copy(local(h.easting, h.northing, h.collar + 1, s));
        head.userData.holeId = h.id;
        v.data.add(head);
        v.pickables.push(head);
        const tag = label(
          h.id,
          active ? "#0B56CF" : "#253950",
          active ? 1.16 : 0.95,
        );
        tag.userData.hideOnNarrow =
          !active && !["BH-01", "BH-04", "BH-09", "BH-12"].includes(h.id);
        tag.position.copy(
          local(h.easting, h.northing, h.collar + (active ? 7 : 5), s),
        );
        v.data.add(tag);
      });
    const cutLine = line(
      [local(0, sectionNorth, 40, s), local(120, sectionNorth, 40, s)],
      "#0F6FFF",
    );
    v.data.add(cutLine);
    const aTag = label("A", "#0F6FFF", 1.2),
      bTag = label("A′", "#0F6FFF", 1.2);
    aTag.position.copy(local(-4, sectionNorth, 40, s));
    bTag.position.copy(local(124, sectionNorth, 40, s));
    v.data.add(aTag, bTag);
    const outline = [
      local(35, 25, 37, s),
      local(85, 25, 37, s),
      local(85, 75, 37, s),
      local(35, 75, 37, s),
      local(35, 25, 37, s),
    ];
    v.data.add(line(outline, "#1A4D75"));
    const eLabel = label("E · 120 m", "#334155", 1),
      nLabel = label("N · 100 m", "#334155", 1);
    eLabel.position.set(0, 0.5, 63);
    nLabel.position.set(72, 0.5, 0);
    v.data.add(eLabel, nLabel);
    const north = label("N ↑", "#1D4E75", 1.1);
    north.position.set(-78, 0.5, -56);
    v.data.add(north);
    // Dashed outline marks the observed convex hull, keeping extrapolation explicit.
    const bound = convexHull(holes.map((h) => [h.easting, h.northing]));
    const hullPoints = [...bound, bound[0]].map((p) =>
      local(p[0], p[1], 39, s),
    );
    const hullLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(hullPoints),
      new THREE.LineDashedMaterial({
        color: "#728C9D",
        dashSize: 2,
        gapSize: 1.4,
        transparent: true,
        opacity: 0.65,
      }),
    );
    hullLine.computeLineDistances();
    v.data.add(hullLine);
    v.render();
  }, [
    props.grid,
    props.holes,
    props.layers,
    props.depth,
    props.showHoles,
    props.showVariance,
    props.verticalScale,
    props.sectionNorth,
    props.selected,
  ]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.controls.target.set(0, 15, 0);
    v.camera.position.set(
      ...((props.planView ? [0, 250, 0.01] : [155, 130, 165]) as [
        number,
        number,
        number,
      ]),
    );
    v.controls.update();
    v.render();
  }, [props.resetKey, props.planView]);
  return (
    <div
      ref={host}
      className="ground-scene"
      role={error ? "group" : "img"}
      aria-label="크리깅 지층 추정면, 시추공, 굴착영역 3D"
    >
      {error && (
        <div className="ground-scene-fallback" role="alert">
          <strong>표·단면으로 계속 확인할 수 있습니다.</strong>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
