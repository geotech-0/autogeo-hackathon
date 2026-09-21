import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RealSiteAssets } from "./RealSiteMap";
import type { RealHole, RealGrid, RealHorizon, Terrain } from "./real-types";
import { LITHOLOGY_COLORS } from "./real-engine.mjs";
type Props = {
  assets: RealSiteAssets;
  grid: RealGrid;
  holes: RealHole[];
  horizons: RealHorizon[];
  selected: string;
  onSelect: (id: string) => void;
  visible: boolean[];
  showHoles: boolean;
  extrapolate: boolean;
  showVariance: boolean;
  verticalScale: number;
  sectionNorth: number;
  mode: "ground" | "dsm" | "pointcloud";
  registration: {
    east: number;
    north: number;
    rotation: number;
    scale: number;
    height: number;
  };
  resetKey: number;
};
const colors = LITHOLOGY_COLORS as Record<string, string>;
function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    if (m.material)
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((a) => {
        (a as THREE.MeshBasicMaterial).map?.dispose();
        a.dispose();
      });
  });
}
function textLabel(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 72;
  const x = c.getContext("2d")!;
  x.font = "700 29px sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.lineWidth = 5;
  x.strokeStyle = "white";
  x.strokeText(text, 192, 36);
  x.fillStyle = color;
  x.fillText(text, 192, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }),
  );
}
function meshOf(positions: number[], color: string, opacity = 0.66) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    }),
  );
}
export default function RealGroundScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      data: THREE.Group;
      pickables: THREE.Object3D[];
      render: () => void;
    } | null>(null),
    onSelect = useRef(props.onSelect);
  onSelect.current = props.onSelect;
  const [error, setError] = useState(""),
    [terrain, setTerrain] = useState<Terrain | null>(null),
    [cloud, setCloud] = useState<Float32Array | null>(null),
    [assetError, setAssetError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(props.assets.dsm.url)
      .then((r) => {
        if (!r.ok) throw Error("DSM을 불러오지 못했습니다.");
        return r.json();
      })
      .then((a) => {
        if (live) setTerrain(a);
      })
      .catch((e) => {
        if (live) setAssetError(e.message);
      });
    if (props.assets.pointcloud)
      fetch(props.assets.pointcloud.url)
        .then((r) => {
          if (!r.ok) throw Error("점군을 불러오지 못했습니다.");
          return r.arrayBuffer();
        })
        .then((a) => {
          if (live) setCloud(new Float32Array(a));
        })
        .catch((e) => {
          if (live) setAssetError(e.message);
        });
    return () => {
      live = false;
    };
  }, [props.assets]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(
        "이 환경에서는 3D를 표시할 수 없습니다. 같은 원자료를 정사영상·단면·시추표에서 확인하세요.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#eef2f5");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "실제 시추공, 보간 지층면, DSM 및 점군 3D. 드래그로 회전하고 시추공을 선택합니다.",
    );
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 6000),
      controls = new OrbitControls(camera, renderer.domElement),
      data = new THREE.Group();
    scene.add(data, new THREE.HemisphereLight("#fff", "#6c7f90", 2.6));
    const sun = new THREE.DirectionalLight("#ffffff", 2.4);
    sun.position.set(-150, 300, 180);
    scene.add(sun);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 40;
    controls.maxDistance = 2200;
    const render = () => {
      const hh = Math.max(renderer.domElement.clientHeight, 1);
      data.traverse((o) => {
        if (o instanceof THREE.Sprite) {
          const span =
            (2 *
              Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
              camera.position.distanceTo(o.position)) /
            camera.zoom;
          const ww = (span * (o.userData.pixels ?? 95)) / hh;
          o.scale.set(ww, (ww * 72) / 384, 1);
        }
      });
      renderer.render(scene, camera);
    };
    const v = {
      renderer,
      scene,
      camera,
      controls,
      data,
      pickables: [] as THREE.Object3D[],
      render,
    };
    viewer.current = v;
    controls.addEventListener("change", render);
    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.zoom = Math.min(1, camera.aspect / 1.2);
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let down = [0, 0];
    const pd = (e: PointerEvent) => {
        down = [e.clientX, e.clientY];
      },
      pu = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        const r = renderer.domElement.getBoundingClientRect(),
          ray = new THREE.Raycaster();
        ray.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            (-(e.clientY - r.top) / r.height) * 2 + 1,
          ),
          camera,
        );
        const hit = ray.intersectObjects(v.pickables)[0];
        if (hit?.object.userData.id) onSelect.current(hit.object.userData.id);
      };
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        "3D 연결이 중단되었습니다. 새로고침하거나 정사영상·단면을 이용하세요.",
      );
    };
    renderer.domElement.addEventListener("pointerdown", pd);
    renderer.domElement.addEventListener("pointerup", pu);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      ro.disconnect();
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
      viewer.current = null;
    };
  }, []);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    let cancelled = false;
    dispose(v.data);
    v.data.clear();
    v.pickables = [];
    v.renderer.setClearColor(
      props.mode === "pointcloud" ? "#15283c" : "#eef2f5",
    );
    const b =
        props.mode === "ground"
          ? props.grid.bounds
          : props.assets.orthophoto.boundsEN,
      centerE = (b[0] + b[2]) / 2,
      centerN = (b[1] + b[3]) / 2,
      centerH = 50,
      s = props.verticalScale,
      span = Math.max(b[2] - b[0], b[3] - b[1]);
    const at = (e: number, n: number, h: number) =>
      new THREE.Vector3(e - centerE, (h - centerH) * s, centerN - n);
    const droneAt = (e: number, n: number, h: number) => {
      const o = props.assets.frame.originENH,
        p = props.registration,
        a = (p.rotation * Math.PI) / 180,
        x = e - o[0],
        y = n - o[1];
      return at(
        o[0] + p.east + p.scale * (Math.cos(a) * x - Math.sin(a) * y),
        o[1] + p.north + p.scale * (Math.sin(a) * x + Math.cos(a) * y),
        h + p.height,
      );
    };
    const pushTri = (
      positions: number[],
      a: THREE.Vector3,
      bb: THREE.Vector3,
      c: THREE.Vector3,
    ) => positions.push(...a.toArray(), ...bb.toArray(), ...c.toArray());
    const base = new THREE.GridHelper(
      span * 1.2,
      12,
      props.mode === "pointcloud" ? "#30475c" : "#b6c5d3",
      props.mode === "pointcloud" ? "#20374b" : "#dce3e9",
    );
    base.position.y = -35 * s;
    v.data.add(base);
    if (props.mode === "ground")
      props.horizons.forEach((h, k) => {
        if (!props.visible[k]) return;
        const positions: number[] = [],
          vertexColors: number[] = [],
          g = props.grid;
        const maxVar = Math.max(
          ...g.points.map((q) => q.values[k]?.variance ?? 0),
          0.01,
        );
        for (let j = 0; j < g.ny - 1; j++)
          for (let i = 0; i < g.nx - 1; i++) {
            const ps = [
              g.points[j * g.nx + i],
              g.points[j * g.nx + i + 1],
              g.points[(j + 1) * g.nx + i + 1],
              g.points[(j + 1) * g.nx + i],
            ];
            if (
              ps.some(
                (p) =>
                  !p.values[k] ||
                  (!props.extrapolate && p.values[k]!.extrapolated),
              )
            )
              continue;
            const q = ps.map((p) => at(p.e, p.n, p.values[k]!.value));
            pushTri(positions, q[0], q[3], q[2]);
            pushTri(positions, q[0], q[2], q[1]);
            if (props.showVariance) {
              const vv =
                  ps.reduce((sum, p) => sum + p.values[k]!.variance, 0) / 4,
                col = new THREE.Color().setHSL(
                  0.57 - (0.5 * vv) / maxVar,
                  0.62,
                  0.62,
                );
              for (let t = 0; t < 6; t++)
                vertexColors.push(col.r, col.g, col.b);
            }
          }
        const m = meshOf(positions, h.color, k === 0 ? 0.25 : 0.68);
        if (props.showVariance) {
          m.geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(vertexColors, 3),
          );
          (m.material as THREE.MeshStandardMaterial).vertexColors = true;
          (m.material as THREE.MeshStandardMaterial).color.set("white");
        }
        v.data.add(m);
      });
    if (props.mode === "dsm" && terrain) {
      const positions: number[] = [],
        uv: number[] = [],
        d = terrain,
        bb = d.boundsEN;
      for (let j = 0; j < d.ny - 1; j++)
        for (let i = 0; i < d.nx - 1; i++) {
          const indices = [
            j * d.nx + i,
            (j + 1) * d.nx + i,
            (j + 1) * d.nx + i + 1,
            j * d.nx + i + 1,
          ];
          if (indices.some((k) => d.heights[k] === null)) continue;
          const points = indices.map((idx) => {
            const xx = idx % d.nx,
              yy = Math.floor(idx / d.nx),
              u = xx / (d.nx - 1),
              t = yy / (d.ny - 1);
            return {
              p: droneAt(
                bb[0] + u * (bb[2] - bb[0]),
                bb[3] - t * (bb[3] - bb[1]),
                d.heights[idx]!,
              ),
              u,
              v: 1 - t,
            };
          });
          for (const k of [0, 1, 2, 0, 2, 3]) {
            positions.push(...points[k].p.toArray());
            uv.push(points[k].u, points[k].v);
          }
        }
      const m = meshOf(positions, "#c7d2bf", 1);
      (m.material as THREE.MeshStandardMaterial).alphaTest = 0.1;
      m.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      v.data.add(m);
      new THREE.TextureLoader().load(
        props.assets.orthophoto.previewUrl,
        (t) => {
          if (cancelled) {
            t.dispose();
            return;
          }
          t.colorSpace = THREE.SRGBColorSpace;
          (m.material as THREE.MeshStandardMaterial).map = t;
          (m.material as THREE.MeshStandardMaterial).color.set("#fff");
          (m.material as THREE.MeshStandardMaterial).needsUpdate = true;
          v.render();
        },
        undefined,
        () => setAssetError("3D 표면의 정사영상 텍스처를 불러오지 못했습니다."),
      );
    }
    if (props.mode === "pointcloud" && cloud && props.assets.pointcloud) {
      const positions: number[] = [],
        rgb: number[] = [],
        o = props.assets.pointcloud.originENH;
      for (let i = 0; i < cloud.length; i += 6) {
        positions.push(
          ...droneAt(
            cloud[i] + o[0],
            cloud[i + 1] + o[1],
            cloud[i + 2] + o[2],
          ).toArray(),
        );
        rgb.push(cloud[i + 3], cloud[i + 4], cloud[i + 5]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      v.data.add(
        new THREE.Points(
          g,
          new THREE.PointsMaterial({
            size: 1.8,
            vertexColors: true,
            sizeAttenuation: true,
          }),
        ),
      );
    }
    if (props.showHoles)
      props.holes.forEach((h) => {
        const selected = h.id === props.selected;
        h.layers.forEach((l) => {
          const g = new THREE.CylinderGeometry(
              selected ? 1.5 : 1.0,
              selected ? 1.5 : 1.0,
              (l.to - l.from) * s,
              10,
            ),
            m = new THREE.Mesh(
              g,
              new THREE.MeshStandardMaterial({
                color: colors[l.name] ?? "#a9a8a4",
                roughness: 0.55,
                emissive: selected ? "#203f60" : "#000",
                emissiveIntensity: 0.25,
              }),
            );
          m.position.copy(
            at(h.easting, h.northing, h.collar - (l.from + l.to) / 2),
          );
          m.userData.id = h.id;
          v.pickables.push(m);
          v.data.add(m);
        });
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(selected ? 2 : 1.25, 12, 8),
          new THREE.MeshStandardMaterial({
            color: selected ? "#0f6fff" : "white",
          }),
        );
        head.position.copy(at(h.easting, h.northing, h.collar + 1));
        head.userData.id = h.id;
        v.data.add(head);
        v.pickables.push(head);
        if (selected || props.holes.length <= 14) {
          const tag = textLabel(
            selected ? `${h.campaign} ${h.label}` : h.label,
            selected ? "#0f56cd" : "#304860",
          );
          tag.position.copy(at(h.easting, h.northing, h.collar + 4));
          tag.userData.pixels = selected ? 130 : 65;
          v.data.add(tag);
        }
      });
    const boundary = props.assets.cad.boundaryEN.map((p) => at(p[0], p[1], 15));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boundary),
      new THREE.LineBasicMaterial({
        color: "#dfb228",
        transparent: true,
        opacity: 0.7,
      }),
    );
    v.data.add(line);
    if (props.mode === "ground") {
      const pts = props.grid.points.filter(
        (p) =>
          Math.abs(p.n - props.sectionNorth) < (b[3] - b[1]) / props.grid.ny,
      );
      if (pts.length) {
        const e0 = b[0],
          e1 = b[2],
          g = new THREE.BufferGeometry().setFromPoints([
            at(e0, props.sectionNorth, 28),
            at(e1, props.sectionNorth, 28),
          ]);
        v.data.add(
          new THREE.Line(
            g,
            new THREE.LineDashedMaterial({
              color: "#db5373",
              dashSize: 3,
              gapSize: 2,
            }),
          ).computeLineDistances(),
        );
      }
    }
    for (const [txt, e, n] of [
      ["E →", b[2], b[1]],
      ["N ↑", b[0], b[3]],
    ] as [string, number, number][]) {
      const tag = textLabel(txt, "#425b70");
      tag.position.copy(at(e, n, 15));
      tag.userData.pixels = 55;
      v.data.add(tag);
    }
    v.render();
    return () => {
      cancelled = true;
    };
  }, [props, terrain, cloud]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const b =
        props.mode === "ground"
          ? props.grid.bounds
          : props.assets.orthophoto.boundsEN,
      centerE = (b[0] + b[2]) / 2,
      centerN = (b[1] + b[3]) / 2;
    const box = new THREE.Box3(
      new THREE.Vector3(
        b[0] - centerE,
        -50 * props.verticalScale,
        centerN - b[3],
      ),
      new THREE.Vector3(
        b[2] - centerE,
        40 * props.verticalScale,
        centerN - b[1],
      ),
    );
    if (props.showHoles)
      for (const h of props.holes) {
        box.expandByPoint(
          new THREE.Vector3(
            h.easting - centerE,
            (h.collar - 50) * props.verticalScale,
            centerN - h.northing,
          ),
        );
        box.expandByPoint(
          new THREE.Vector3(
            h.easting - centerE,
            (h.collar - h.observedBottom - 50) * props.verticalScale,
            centerN - h.northing,
          ),
        );
      }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const halfVertical = THREE.MathUtils.degToRad(
      v.camera.getEffectiveFOV() / 2,
    );
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * v.camera.aspect);
    const distance =
      (sphere.radius * 1.12) / Math.sin(Math.min(halfVertical, halfHorizontal));
    v.camera.position
      .copy(sphere.center)
      .add(
        new THREE.Vector3(0.85, 0.8, 0.9).normalize().multiplyScalar(distance),
      );
    v.controls.target.copy(sphere.center);
    v.controls.maxDistance = Math.max(2200, distance * 3);
    v.controls.update();
    v.camera.updateProjectionMatrix();
    v.render();
  }, [
    props.mode,
    props.resetKey,
    props.grid.bounds[0],
    props.grid.bounds[1],
    props.grid.bounds[2],
    props.grid.bounds[3],
  ]);
  return (
    <div className="real-ground-scene">
      <div ref={host} />
      {error && (
        <div className="real-scene-error" role="alert">
          {error}
        </div>
      )}
      {!error &&
        ((props.mode === "dsm" && !terrain) ||
          (props.mode === "pointcloud" && !cloud)) && (
          <div className="real-scene-error">
            {assetError || "실제 공간 자료를 불러오는 중…"}
          </div>
        )}
      <div className="real-scene-label">
        {props.mode === "ground"
          ? "관측 주상도 + 크리깅 경계면"
          : props.mode === "dsm"
            ? "촬영 시점 DSM + 실제 정사영상"
            : "원본 LAS에서 추출한 공간 대표점"}{" "}
        · 높이 {props.verticalScale}× · CAD 경계는 기준면 투영
      </div>
    </div>
  );
}
