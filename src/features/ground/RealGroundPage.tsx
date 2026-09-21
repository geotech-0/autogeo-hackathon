import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Layers3,
  FileText,
  Save,
  Download,
  RotateCcw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import type { FeatureProps } from "../../contracts";
import { useDraft } from "../../storage/useDraft";
import source from "../../data/real-ground/boreholes.json";
import {
  HAS_PROVIDED_ORIGINALS,
  PROVIDED_SOURCE_NOTICE,
} from "../../data/source-access";
import RealSiteMap, { CAMPAIGN_COLORS, useSiteAssets } from "./RealSiteMap";
import RealGroundScene from "./RealGroundScene";
import {
  VOLUME_LAYERS,
  ROCK_VOLUME_LAYER,
  buildLayerVolumes,
} from "./volume-geometry.mjs";
import { sliceClosedMesh } from "./mesh-slicer.mjs";
import SliceControls from "./SliceControls";
import RegistrationControls from "./RegistrationControls";
import ModelSliceSection from "./ModelSliceSection";
import type {
  CameraView,
  GroundVolume,
  SliceState,
  SliceAxis,
} from "./model-view";
import type {
  RealHole,
  RealPoint,
  RealHorizon,
  Prediction,
} from "./real-types";
import {
  createRealModel,
  realGrid,
  realSection,
  realLOO,
  REAL_GROUND_VERSION,
  LITHOLOGY_COLORS,
  restoreRealGround,
} from "./real-engine.mjs";
import { registrationMatrix, inverse } from "./engine.mjs";
import "./ground.css";
import "./real-ground.css";
const holes = source.holes as RealHole[],
  colors = LITHOLOGY_COLORS as Record<string, string>,
  campaigns = source.campaigns;
const f = (n: number, d = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("ko-KR", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      })
    : "—";
const download = (name: string, obj: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};
type GroundView = {
  recordId?: string;
  tab: "map" | "model" | "sources" | "quality";
  selected: string;
  modelCampaign: string;
  shownCampaigns: string[];
  sectionNorth: number;
  mode: "ground" | "dsm" | "pointcloud";
  visible: boolean[];
  representation: "solid" | "surfaces";
  solidVisible: boolean[];
  meshOpacity: number;
  cutaway: boolean;
  slice: SliceState;
  baseElevation: number | null;
  cameraView: CameraView;
  showHoles: boolean;
  showCAD: boolean;
  showCADLinework: boolean;
  showGCP: boolean;
  extrapolate: boolean;
  showVariance: boolean;
  verticalScale: number;
  parameters: { model: string; range: string; sill: string; nugget: string };
  registration: {
    east: number;
    north: number;
    rotation: number;
    scale: number;
    height: number;
  };
};
const defaultSlice = (hs: RealHole[], north?: number): SliceState => ({
  enabled: false,
  axis: "y",
  keep: "above",
  mode: "cut",
  showPlane: true,
  positions: {
    x:
      (Math.min(...hs.map((h) => h.easting)) +
        Math.max(...hs.map((h) => h.easting))) /
      2,
    y:
      north ??
      (Math.min(...hs.map((h) => h.northing)) +
        Math.max(...hs.map((h) => h.northing))) /
        2,
    z:
      (Math.min(...hs.map((h) => h.collar - h.observedBottom)) +
        Math.max(...hs.map((h) => h.collar))) /
      2,
  },
});
const initial = (): GroundView => ({
  tab: "map",
  selected: "2022-08:NBH-6",
  modelCampaign: "2022-08",
  shownCampaigns: campaigns.map((c) => c.id),
  sectionNorth: 521622.7,
  mode: "ground",
  visible: [true, true, true],
  representation: "solid",
  solidVisible: [true, true, true],
  meshOpacity: 1,
  cutaway: false,
  slice: defaultSlice(
    holes.filter((h) => h.campaign === "2022-08"),
    521622.7,
  ),
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
});
function Section({
  points,
  horizons,
  north,
  holes: selectedHoles,
  selected,
  onSelect,
  extrapolate,
  filled,
  solidVisible,
  boundaryVisible,
}: {
  points: RealPoint[];
  horizons: RealHorizon[];
  north: number;
  holes: RealHole[];
  selected: string;
  onSelect: (id: string) => void;
  extrapolate: boolean;
  filled: boolean;
  solidVisible: boolean[];
  boundaryVisible: boolean[];
}) {
  const ref = useRef<SVGSVGElement>(null),
    [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setWidth(Math.max(200, Math.min(1100, el.getBoundingClientRect().width)));
    measure();
    const o = new ResizeObserver(measure);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  if (!points.length) return null;
  const compact = width < 500,
    height = 300,
    left = 46,
    right = 22,
    top = 25,
    bottom = 44,
    e0 = points[0].e,
    e1 = points.at(-1)!.e,
    allH = points.flatMap((p) => p.values.flatMap((v) => (v ? [v.value] : []))),
    near = selectedHoles.filter((h) => Math.abs(h.northing - north) <= 12),
    z0 =
      Math.floor(
        Math.min(...allH, ...near.map((h) => h.collar - h.observedBottom)) / 5,
      ) *
        5 -
      5,
    z1 = Math.ceil(Math.max(...allH, ...near.map((h) => h.collar)) / 5) * 5 + 5,
    x = (e: number) => left + ((e - e0) / (e1 - e0)) * (width - left - right),
    y = (h: number) =>
      height - bottom - ((h - z0) / (z1 - z0)) * (height - top - bottom);
  return (
    <svg
      ref={ref}
      className="real-section"
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`실제 주상도 기반 동서 단면, 북쪽 좌표 ${north}m. 가로축 동쪽 좌표, 세로축 표고 m.`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, i) => z0 + ((z1 - z0) * i) / 4).map(
        (z) => (
          <g key={z}>
            <line
              x1={left}
              x2={width - right}
              y1={y(z)}
              y2={y(z)}
              stroke="#e6ecf1"
            />
            <text x={left - 7} y={y(z) + 4} textAnchor="end">
              {f(z, 0)}
            </text>
          </g>
        ),
      )}
      {filled &&
        VOLUME_LAYERS.map(
          (layer, layerIndex) =>
            solidVisible[layerIndex] && (
              <g key={layer.id} aria-label={`${layer.name} 채운 단면`}>
                {points.slice(1).map((p, i) => {
                  const a = points[i],
                    av = a.values[layer.topIndex],
                    ab = a.values[layer.bottomIndex],
                    bv = p.values[layer.topIndex],
                    bb = p.values[layer.bottomIndex];
                  if (
                    !av ||
                    !ab ||
                    !bv ||
                    !bb ||
                    av.value <= ab.value ||
                    bv.value <= bb.value
                  )
                    return null;
                  const outside = [av, ab, bv, bb].some((v) => v.extrapolated);
                  if (outside && !extrapolate) return null;
                  return (
                    <polygon
                      key={i}
                      points={`${x(a.e)},${y(av.value)} ${x(p.e)},${y(bv.value)} ${x(p.e)},${y(bb.value)} ${x(a.e)},${y(ab.value)}`}
                      fill={layer.color}
                      fillOpacity={outside ? 0.22 : 0.6}
                    />
                  );
                })}
              </g>
            ),
        )}
      {horizons.map(
        (h, k) =>
          boundaryVisible[k] && (
            <g key={h.id}>
              {points.slice(1).map((p, i) => {
                const a = points[i],
                  v = p.values[k],
                  av = a.values[k];
                if (!v || !av) return null;
                return (
                  <line
                    key={i}
                    x1={x(a.e)}
                    y1={y(av.value)}
                    x2={x(p.e)}
                    y2={y(v.value)}
                    stroke={h.color}
                    strokeWidth={2.5}
                    strokeDasharray={
                      v.extrapolated || av.extrapolated ? "4 3" : undefined
                    }
                  />
                );
              })}
            </g>
          ),
      )}
      {near.map((h) => (
        <g
          key={h.id}
          role="button"
          tabIndex={0}
          aria-label={`${h.campaign} ${h.label} 단면 주상도 선택`}
          onClick={() => onSelect(h.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSelect(h.id);
          }}
          style={{ cursor: "pointer" }}
        >
          {h.layers.map((l, i) => (
            <rect
              key={i}
              x={x(h.easting) - 4}
              y={y(h.collar - l.from)}
              width={8}
              height={Math.max(0.5, y(h.collar - l.to) - y(h.collar - l.from))}
              fill={colors[l.name] ?? "#aaa"}
              stroke={h.id === selected ? "#0f6fff" : "#fff"}
              strokeWidth={h.id === selected ? 1.5 : 0.5}
            />
          ))}
          <text
            x={x(h.easting)}
            y={y(h.collar) - 7}
            textAnchor="middle"
            className="real-section-hole"
          >
            {h.label}
          </text>
          <path
            d={`M${x(h.easting) - 4} ${y(h.collar - h.observedBottom) + 2}l4 5 4-5`}
            fill="none"
            stroke="#52677a"
          />
        </g>
      ))}
      {Array.from(
        { length: compact ? 3 : 5 },
        (_, i) => e0 + ((e1 - e0) * i) / (compact ? 2 : 4),
      ).map((e) => (
        <text key={e} x={x(e)} y={height - 22} textAnchor="middle">
          {f(e, 0)}
        </text>
      ))}
      <text x={left} y={15}>
        표고 EL. (m)
      </text>
      <text x={width - right} y={height - 4} textAnchor="end">
        동쪽 E (m)
      </text>
    </svg>
  );
}
export default function RealGroundPage({
  records,
  onSave,
  notify,
  requestedRecordId,
}: FeatureProps) {
  const appliedRequest = useRef<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null),
    modelToolbar = useRef<HTMLDivElement>(null),
    originalHeading = useRef<HTMLHeadingElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    target: "detail" | "model" | "original";
  } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const target = {
      detail: detailHeading,
      model: modelToolbar,
      original: originalHeading,
    }[focusRequest.target].current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
      block: "start",
      inline: "nearest",
      behavior: "auto",
    });
  }, [focusRequest]);
  const [v, setV, { ready, error: draftError }] = useDraft<GroundView>(
      "real-ground-view-v2",
      initial,
    ),
    { assets, error: assetError } = useSiteAssets(),
    [reset, setReset] = useState(0),
    [search, setSearch] = useState(""),
    [selectedRecord, setSelectedRecord] = useState(""),
    [busy, setBusy] = useState(false),
    [slicerInputsValid, setSlicerInputsValid] = useState(true),
    [registrationInputsValid, setRegistrationInputsValid] = useState(true),
    [viewReset, setViewReset] = useState(0),
    [logIndex, setLogIndex] = useState(0);
  const set = <K extends keyof GroundView>(key: K, value: GroundView[K]) =>
    setV({ ...v, [key]: value });
  // Existing autosaved drafts predate volume controls; keep their data and add defaults.
  const representation = v.representation ?? "solid",
    solidVisible = v.solidVisible ?? [true, true, true],
    meshOpacity = v.meshOpacity ?? 1,
    cameraView = v.cameraView ?? "perspective";
  const selected = holes.find((h) => h.id === v.selected) ?? holes[0];
  const shown = holes.filter((h) => v.shownCampaigns.includes(h.campaign)),
    modelHoles = holes.filter(
      (h) => v.modelCampaign === "all" || h.campaign === v.modelCampaign,
    ),
    parameters = {
      model: v.parameters.model,
      range: Number(v.parameters.range),
      sill: Number(v.parameters.sill),
      nugget: Number(v.parameters.nugget),
    };
  const analysis = useMemo(() => {
    try {
      if (Object.values(v.parameters).some((x) => x === ""))
        throw Error("크리깅 입력값을 채워 주세요.");
      const model = createRealModel(modelHoles, parameters),
        grid = realGrid(model, 65, 65),
        loo = realLOO(model);
      return { model, grid, loo, error: "" };
    } catch (e) {
      return {
        model: null,
        grid: null,
        section: [],
        loo: [],
        error: (e as Error).message,
      };
    }
  }, [
    v.modelCampaign,
    v.parameters.model,
    v.parameters.range,
    v.parameters.sill,
    v.parameters.nugget,
  ]);
  const sectionPoints = useMemo(
    () => (analysis.model ? realSection(analysis.model, v.sectionNorth) : []),
    [analysis.model, v.sectionNorth],
  );
  const heights =
    analysis.grid?.points.flatMap((p) =>
      p.values.filter(Boolean).map((q: Prediction | null) => q!.value),
    ) ?? modelHoles.map((h) => h.collar);
  const rockHeights =
    analysis.grid?.points.flatMap((p) =>
      p.values[2] ? [p.values[2].value] : [],
    ) ?? [];
  const maxBase =
    Math.floor(
      (Math.min(
        ...rockHeights,
        ...modelHoles.map((h) => h.collar - h.observedBottom),
      ) -
        1) *
        10,
    ) / 10;
  const automaticBase = Math.min(
    maxBase - 1,
    Math.floor(
      Math.min(...modelHoles.map((h) => h.collar - h.observedBottom)) / 5,
    ) *
      5 -
      5,
  );
  const baseElevation = v.baseElevation ?? automaticBase;
  const topElevation = Math.ceil(Math.max(...heights) + 2);
  const bounds = analysis.grid?.bounds ?? [239800, 521500, 240050, 521700];
  const limits: Record<SliceAxis, [number, number]> = {
    x: [bounds[0], bounds[2]],
    y: [bounds[1], bounds[3]],
    z: [baseElevation, topElevation],
  };
  const rawSlice = v.slice ?? {
    ...defaultSlice(modelHoles, v.sectionNorth),
    enabled: v.cutaway ?? false,
  };
  const slice: SliceState = rawSlice;
  const sliceValue = slice.positions[slice.axis];
  const coordinateError =
    sliceValue < limits[slice.axis][0] || sliceValue > limits[slice.axis][1]
      ? `${slice.axis.toUpperCase()} 절단 좌표 ${sliceValue} m가 현재 모델 범위 밖입니다. 좌표를 그대로 보존했으므로 값을 입력하거나 ‘중앙으로’를 선택하세요.`
      : "";
  const setSlice = (next: SliceState) =>
    setV({
      ...v,
      slice: next,
      cutaway: false,
      sectionNorth: next.axis === "y" ? next.positions.y : v.sectionNorth,
      representation: "solid",
      cameraView:
        !next.enabled && cameraView === "section" ? "perspective" : cameraView,
    });
  const volumes = useMemo(() => {
    if (!analysis.grid || !analysis.model)
      return { layers: [] as GroundVolume[], error: "" };
    try {
      if (baseElevation > maxBase || baseElevation < -500)
        throw Error(
          `암반 표시 하한을 ${maxBase.toFixed(1)} m 이하로 설정하세요.`,
        );
      const result = buildLayerVolumes(analysis.grid, {
        extrapolate: v.extrapolate,
        hulls: analysis.model.horizons.map((h) => h.model?.hull ?? null),
        baseElevation,
      });
      return { layers: result.layers as GroundVolume[], error: "" };
    } catch (e) {
      return { layers: [] as GroundVolume[], error: (e as Error).message };
    }
  }, [analysis.grid, analysis.model, v.extrapolate, baseElevation, maxBase]);
  const slices = useMemo(() => {
    try {
      return {
        layers: volumes.layers.map((layer) => ({
          ...layer,
          ...sliceClosedMesh(layer, {
            axis: slice.axis,
            value: slice.positions[slice.axis],
            keep: slice.keep,
          }),
        })) as GroundVolume[],
        error: "",
      };
    } catch (e) {
      return {
        layers: [] as GroundVolume[],
        error: `절단면을 생성하지 못했습니다: ${(e as Error).message}`,
      };
    }
  }, [volumes.layers, slice.axis, slice.positions[slice.axis], slice.keep]);
  const geometryError = volumes.error || slices.error || coordinateError;
  const saved = records
    .filter((r) => r.payload.kind === "real-ground-model")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  useEffect(() => setLogIndex(0), [selected.id]);
  const pick = (id: string) => {
    const h = holes.find((h) => h.id === id);
    if (h) {
      const inModel = modelHoles.some((modelHole) => modelHole.id === id);
      setV({
        ...v,
        selected: id,
        ...(inModel
          ? {
              sectionNorth: h.northing,
              slice: {
                ...slice,
                positions: { ...slice.positions, x: h.easting, y: h.northing },
              },
            }
          : {}),
      });
    }
  };
  const openSelectedModel = () => {
    const sameCampaign = v.modelCampaign === selected.campaign;
    const nextSlice = sameCampaign
      ? slice
      : defaultSlice(holes.filter((h) => h.campaign === selected.campaign));
    setV({
      ...v,
      tab: "model",
      mode: "ground",
      representation: "solid",
      modelCampaign: selected.campaign,
      sectionNorth: selected.northing,
      slice: {
        ...nextSlice,
        positions: {
          ...nextSlice.positions,
          x: selected.easting,
          y: selected.northing,
        },
      },
      baseElevation: sameCampaign ? v.baseElevation : null,
      cameraView: sameCampaign ? cameraView : "perspective",
    });
    setViewReset((n) => n + 1);
    setReset((n) => n + 1);
    setFocusRequest({ target: "model" });
  };
  const openSelectedObservations = () => {
    setSearch("");
    set("tab", "sources");
    setFocusRequest({ target: "detail" });
  };
  const openHoleDetail = (id: string) => {
    pick(id);
    setFocusRequest({ target: "detail" });
  };
  const getPayload = () => ({
    kind: "real-ground-model",
    schemaVersion: 2,
    sourceRevision: "source-32-holes-r1",
    frame: source.frame,
    holeIds: holes.map((h) => h.id),
    holes,
    sourceCampaigns: campaigns.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      sourceSha256: c.sourceSha256,
    })),
    parameters,
    view: {
      ...v,
      representation,
      solidVisible,
      meshOpacity,
      cutaway: false,
      slice,
      baseElevation: v.baseElevation ?? null,
      cameraView,
      recordId: undefined,
    },
    registration: {
      ...v.registration,
      masterOriginENH: source.frame.originENH,
      localMatrix: registrationMatrix(v.registration),
      inverseLocalMatrix: inverse(registrationMatrix(v.registration)),
      cad: assets?.cad,
      independentDroneChecks: [],
      verticalCorrectionApplied: v.registration.height !== 0,
    },
    assets: {
      orthophotoId: assets?.orthophoto.id,
      DSM: assets?.dsm,
      pointcloud: assets?.pointcloud,
      geoid: assets?.geoid,
    },
    quality: {
      conflicts: holes
        .filter((h) => h.qc.length)
        .map((h) => ({ id: h.id, messages: h.qc })),
      loo: analysis.loo,
      limitations: source.limitations,
    },
    visualization: {
      baseElevation,
      rockBottomObserved: false,
      boundary: v.extrapolate
        ? "grid-domain-extrapolation"
        : "observed-hull-clipped",
      sliceCoordinateFrame: "X=E,Y=N,Z=EL(m)",
    },
    methodVersion: REAL_GROUND_VERSION,
  });
  async function save() {
    if (
      !analysis.model ||
      !assets ||
      geometryError ||
      !slicerInputsValid ||
      !registrationInputsValid
    )
      return;
    setBusy(true);
    try {
      const r = await onSave({
        id: v.recordId,
        site_id: "icheon-xi-deriche",
        zone_id: "IC-EXC",
        asset_id: "icheon-ground-investigations",
        source_id: "icheon-ground-32-r1",
        source_revision: "1",
        stage: "tender",
        analysis_id: "real-ground-" + (v.recordId ?? Date.now()),
        method_version: REAL_GROUND_VERSION,
        origin: "calculated",
        title: `실제 지반 · ${v.modelCampaign === "all" ? "전체 차수" : v.modelCampaign} · ${modelHoles.length}공 모델`,
        status: "pending",
        summary: `전체 32공·96구간 연결 / ${modelHoles.length}공 보간 / 실제 정사영상·DSM·점군 / NH-4 총심도 원문 충돌 1건`,
        assumptions: [
          ...source.limitations,
          `암반 하부는 모델 표시 하한 EL. ${baseElevation} m까지 연장한 가정이며 관측된 암반 바닥이 아닙니다.`,
        ],
        payload: getPayload(),
      });
      setV({ ...v, recordId: r.id });
      setSelectedRecord(r.id);
      notify("실제 지반 모델과 보기·정합 상태를 저장했습니다.", "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  function load() {
    const r = saved.find((r) => r.id === selectedRecord);
    if (!r) return;
    try {
      const restored = restoreRealGround(
        r.payload,
        holes.map((h) => h.id),
        holes,
      );
      setV({ ...initial(), ...restored, recordId: r.id });
      setViewReset((n) => n + 1);
      setReset((n) => n + 1);
      notify("저장한 실제 지반 검토를 불러왔습니다.", "success");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  useEffect(() => {
    if (
      !ready ||
      !requestedRecordId ||
      appliedRequest.current === requestedRecordId
    )
      return;
    const r = records.find(
      (r) =>
        r.id === requestedRecordId && r.payload.kind === "real-ground-model",
    );
    if (!r) return;
    appliedRequest.current = requestedRecordId;
    try {
      const restored = restoreRealGround(
        r.payload,
        holes.map((h) => h.id),
        holes,
      );
      setV({ ...initial(), ...restored, recordId: r.id });
      setViewReset((n) => n + 1);
      setReset((n) => n + 1);
      setSelectedRecord(r.id);
      notify("통합 이력의 실제 지반 검토를 불러왔습니다.", "success");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }, [requestedRecordId, ready, records]);
  const filtered = holes.filter((h) =>
    `${h.campaign} ${h.label}`.toLowerCase().includes(search.toLowerCase()),
  );
  const HoleCard = () => (
    <aside className="real-hole-card">
      <div className="real-card-eyebrow">
        <span style={{ background: CAMPAIGN_COLORS[selected.campaign] }} />
        {selected.campaign} 조사자료
      </div>
      <h2
        id="real-ground-hole-detail"
        ref={detailHeading}
        tabIndex={-1}
        className="real-focus-target"
        aria-label={`${selected.campaign} ${selected.label} 관측 자료`}
      >
        {selected.label}
      </h2>
      <p className="real-muted">{selected.id} · 원문 좌표 보존</p>
      <div className="real-hole-numbers">
        <div>
          <small>공구 표고</small>
          <strong>
            {f(selected.collar)} <em>m</em>
          </strong>
        </div>
        <div>
          <small>기재 총심도</small>
          <strong>
            {f(selected.declaredTotalDepth, 1)} <em>m</em>
          </strong>
        </div>
      </div>
      <div className="real-coordinates">
        E {f(selected.easting)} m
        <br />N {f(selected.northing)} m
      </div>
      {v.tab === "map" && !v.shownCampaigns.includes(selected.campaign) && (
        <p className="real-muted">
          선택 공의 조사차수는 지도에서 숨겨져 있습니다.{" "}
          <button
            className="real-inline-link"
            onClick={() =>
              set("shownCampaigns", [...v.shownCampaigns, selected.campaign])
            }
          >
            이 차수 표시
          </button>
        </p>
      )}
      {selected.qc.map((q) => (
        <div className="real-warning" key={q}>
          <AlertTriangle size={16} />
          <span>{q}</span>
        </div>
      ))}
      <div className="real-log-rows">
        {selected.layers.map((l, i) => (
          <div key={i}>
            <span
              className="real-layer-swatch"
              style={{ background: colors[l.name] }}
            />
            <strong>{l.name}</strong>
            <span>
              {f(l.from, 1)}–{f(l.to, 1)} m
            </span>
          </div>
        ))}
      </div>
      <p className="real-muted">
        마지막 {f(selected.observedBottom, 1)} m는 관찰 종료심도입니다. 해당
        지층의 바닥 경계는 미확인입니다.
      </p>
      <button className="btn btn-primary" onClick={openSelectedModel}>
        <Layers3 size={16} /> 선택 공의 3D·단면 보기
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => {
          set("tab", "sources");
          setFocusRequest({ target: "original" });
        }}
      >
        <FileText size={16} />{" "}
        {HAS_PROVIDED_ORIGINALS ? "실제 주상도 보기" : "지층 자료·출처 보기"}
      </button>
      <a
        className="real-link"
        href={`/documents/${selected.sourceId}.pdf#page=${selected.coordinatePage}`}
        target="_blank"
        rel="noreferrer"
      >
        좌표표 원문 · PDF {selected.coordinatePage}쪽 <ExternalLink size={13} />
      </a>
    </aside>
  );
  if (!ready)
    return (
      <div className="real-map-loading">저장한 현장 보기를 불러오는 중…</div>
    );
  return (
    <div className="ground-page real-ground-page">
      <header className="ground-page-heading">
        <div>
          <h1>지반 모델</h1>
          <p>이천자이더리체 · 4개 조사차수 · 32공 · 96개 지층 구간</p>
        </div>
        <button
          className="btn btn-primary"
          disabled={
            busy ||
            !!analysis.error ||
            !!geometryError ||
            !assets ||
            !slicerInputsValid ||
            !registrationInputsValid
          }
          onClick={save}
        >
          <Save size={16} />
          {busy ? "저장 중…" : v.recordId ? "개정 저장" : "검토 저장"}
        </button>
      </header>
      {(draftError || assetError) && (
        <div className="real-warning" role="alert">
          {draftError || assetError}
        </div>
      )}
      {(!slicerInputsValid || !registrationInputsValid) && (
        <div className="real-warning" role="status">
          입력한 값을 적용하거나 취소하면 검토를 저장할 수 있습니다. 범위를
          벗어난 값은 입력란에서 수정하세요.
        </div>
      )}
      {(analysis.error || geometryError) && v.tab !== "model" && (
        <div className="real-warning" role="alert">
          <span>
            모델 설정을 확인해야 저장할 수 있습니다.{" "}
            {analysis.error || geometryError}
          </span>
          <button
            className="real-inline-link"
            onClick={() => set("tab", "model")}
          >
            모델 설정 확인
          </button>
        </div>
      )}
      <nav className="ground-tabs" aria-label="실제 지반 보기">
        {(
          [
            ["map", "현장 지도", Map],
            ["model", "3D·단면", Layers3],
            ["sources", "조사자료", FileText],
            ["quality", "정합·검수", SlidersHorizontal],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={v.tab === id ? "active" : ""}
            aria-pressed={v.tab === id}
            onClick={() => set("tab", id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      {v.tab === "map" && (
        <>
          <div className="real-toolbar">
            <div className="real-campaign-pills">
              {campaigns.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={v.shownCampaigns.includes(c.id)}
                    onChange={(e) =>
                      set(
                        "shownCampaigns",
                        e.target.checked
                          ? [...v.shownCampaigns, c.id]
                          : v.shownCampaigns.filter((x) => x !== c.id),
                      )
                    }
                  />
                  <i style={{ background: CAMPAIGN_COLORS[c.id] }} />
                  {c.id} · {c.holeCount}공
                </label>
              ))}
            </div>
            <div className="real-options">
              <label>
                <input
                  type="checkbox"
                  checked={v.showCAD}
                  onChange={(e) => set("showCAD", e.target.checked)}
                />{" "}
                도면 경계
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!v.showCADLinework}
                  onChange={(e) => set("showCADLinework", e.target.checked)}
                />{" "}
                흙막이 도면선
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={v.showGCP}
                  onChange={(e) => set("showGCP", e.target.checked)}
                />{" "}
                GCP 13점
              </label>
            </div>
          </div>
          {shown.length === 0 && (
            <div className="real-info-line" role="status">
              모든 시추공을 숨겼습니다. 정사영상과 도면은 계속 볼 수 있습니다.
              <button
                className="real-inline-link"
                onClick={() =>
                  set(
                    "shownCampaigns",
                    campaigns.map((c) => c.id),
                  )
                }
              >
                모든 차수 표시
              </button>
            </div>
          )}
          <div className="real-map-layout">
            <RealSiteMap
              assets={assets ?? undefined}
              holes={shown}
              selected={selected.id}
              onSelect={pick}
              showCAD={v.showCAD}
              showCADLinework={v.showCADLinework}
              showGCP={v.showGCP}
              sectionNorth={v.sectionNorth}
              transform={v.registration}
            />
            <HoleCard />
          </div>
          <div className="real-info-line">
            <AlertTriangle size={16} /> 좌표 정합은 개략 대응입니다.
            촬영일·수직기준은 미확인입니다.
            <button
              className="real-inline-link"
              onClick={() => set("tab", "quality")}
            >
              정합 근거 보기
            </button>
          </div>
        </>
      )}
      {v.tab === "model" && (
        <>
          <div
            id="real-ground-model-toolbar"
            ref={modelToolbar}
            tabIndex={-1}
            role="group"
            aria-label="3D·단면 모델 조작"
            className="real-toolbar real-model-toolbar real-focus-target"
          >
            <label className="real-select-label">
              조사차수
              <select
                aria-label="모델 조사차수"
                value={v.modelCampaign}
                onChange={(e) => {
                  const next = holes.filter(
                      (h) =>
                        e.target.value === "all" ||
                        h.campaign === e.target.value,
                    ),
                    north =
                      next.reduce((s, h) => s + h.northing, 0) / next.length;
                  setV({
                    ...v,
                    modelCampaign: e.target.value,
                    sectionNorth: north,
                    slice: {
                      ...defaultSlice(next, north),
                      enabled: slice.enabled,
                      axis: slice.axis,
                      mode: slice.mode,
                      keep: slice.keep,
                    },
                    baseElevation: null,
                    selected: next.some((h) => h.id === v.selected)
                      ? v.selected
                      : next[0].id,
                  });
                }}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.holeCount}공
                  </option>
                ))}
                <option value="all">전체 32공 비교 · 조사 시점 혼재</option>
              </select>
            </label>
            <div className="real-mode-buttons">
              {(
                [
                  ["ground", "지층 모델"],
                  ["dsm", "DSM + 영상"],
                  ["pointcloud", "실제 점군"],
                ] as const
              ).map(([id, l]) => (
                <button
                  key={id}
                  className={v.mode === id ? "active" : ""}
                  aria-pressed={v.mode === id}
                  onClick={() => set("mode", id)}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              aria-label="현재 모델에 시점 맞추기"
              title="현재 모델에 시점 맞추기"
              onClick={() => setReset(reset + 1)}
            >
              <RotateCcw size={14} /> <span>시점 맞춤</span>
            </button>
          </div>
          <div className="real-model-selection">
            <label>
              시추공
              <select
                aria-label="모델 시추공"
                value={
                  modelHoles.some((h) => h.id === selected.id)
                    ? selected.id
                    : ""
                }
                onChange={(e) => pick(e.target.value)}
              >
                <option value="" disabled>
                  현재 모델의 시추공 선택
                </option>
                {modelHoles.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.campaign} · {h.label}
                  </option>
                ))}
              </select>
            </label>
            {modelHoles.some((h) => h.id === selected.id) ? (
              <button
                className="real-inline-link"
                onClick={openSelectedObservations}
              >
                선택 공의 관측 자료
              </button>
            ) : (
              <button className="real-inline-link" onClick={openSelectedModel}>
                {selected.campaign} {selected.label}의 모델로 이동
              </button>
            )}
          </div>
          {v.modelCampaign === "all" && (
            <div className="real-warning">
              <AlertTriangle size={16} />
              조사 시점이 다른 자료의 비교 모델입니다. 현재 지표면이나 시공
              변화량으로 해석하지 마세요.
            </div>
          )}
          <details className="real-disclosure real-display-options">
            <summary>
              표시 설정{" "}
              <span>
                {v.mode === "ground"
                  ? representation === "solid"
                    ? "채운 지층"
                    : "경계면"
                  : "높이 배율·주상도"}
              </span>
            </summary>
            {v.mode === "ground" && (
              <div className="real-volume-toolbar">
                <div className="real-mode-buttons" aria-label="지층 표현 방식">
                  {(
                    [
                      ["solid", "채운 지층"],
                      ["surfaces", "경계면"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className={representation === id ? "active" : ""}
                      aria-pressed={representation === id}
                      onClick={() => set("representation", id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {representation === "solid" && (
                  <>
                    <label className="real-opacity-control">
                      불투명도 {Math.round(meshOpacity * 100)}%
                      <input
                        aria-label="지층 메쉬 불투명도"
                        type="range"
                        min={0.4}
                        max={1}
                        step={0.05}
                        value={meshOpacity}
                        onChange={(e) =>
                          set("meshOpacity", Number(e.target.value))
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            )}
            <div className="real-model-controls">
              {v.mode === "ground" && (
                <div className="real-campaign-pills">
                  {(representation === "solid"
                    ? [...VOLUME_LAYERS, ROCK_VOLUME_LAYER]
                    : (analysis.model?.horizons ?? [])
                  ).map((h, i) => (
                    <label key={h.id}>
                      <input
                        type="checkbox"
                        checked={
                          (representation === "solid"
                            ? solidVisible
                            : v.visible)[i]
                        }
                        onChange={(e) =>
                          set(
                            representation === "solid"
                              ? "solidVisible"
                              : "visible",
                            (representation === "solid"
                              ? solidVisible
                              : v.visible
                            ).map((x, j) => (i === j ? e.target.checked : x)),
                          )
                        }
                      />
                      <i style={{ background: h.color }} />
                      {h.name}
                    </label>
                  ))}
                </div>
              )}
              <div className="real-options">
                <label>
                  <input
                    type="checkbox"
                    checked={v.showHoles}
                    onChange={(e) => set("showHoles", e.target.checked)}
                  />{" "}
                  관측 주상도
                </label>
                {v.mode === "ground" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={v.extrapolate}
                        onChange={(e) => set("extrapolate", e.target.checked)}
                      />{" "}
                      외삽 영역 표시
                    </label>
                    {representation === "surfaces" && (
                      <label>
                        <input
                          type="checkbox"
                          checked={v.showVariance}
                          onChange={(e) =>
                            set("showVariance", e.target.checked)
                          }
                        />{" "}
                        보간 분산
                      </label>
                    )}
                  </>
                )}
                <label>
                  높이 배율{" "}
                  <select
                    value={v.verticalScale}
                    onChange={(e) =>
                      set("verticalScale", Number(e.target.value))
                    }
                  >
                    <option value={1}>1×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                  </select>
                </label>
              </div>
            </div>
          </details>
          <div
            className={
              v.mode === "ground" && representation === "solid"
                ? "real-viewer-workspace"
                : ""
            }
          >
            <div className="real-model-visual">
              {analysis.error ||
              (v.mode === "ground" &&
                representation === "solid" &&
                geometryError) ? (
                <div className="real-warning" role="alert">
                  {analysis.error || geometryError}
                </div>
              ) : (
                analysis.grid &&
                assets && (
                  <RealGroundScene
                    assets={assets}
                    grid={analysis.grid}
                    holes={modelHoles}
                    horizons={analysis.model!.horizons}
                    selected={selected.id}
                    onSelect={pick}
                    visible={v.visible}
                    representation={representation}
                    solidVisible={solidVisible}
                    meshOpacity={meshOpacity}
                    volumes={volumes.layers}
                    slicedVolumes={slices.layers}
                    slice={slice}
                    cameraView={cameraView}
                    baseElevation={baseElevation}
                    showHoles={v.showHoles}
                    extrapolate={v.extrapolate}
                    showVariance={v.showVariance}
                    verticalScale={v.verticalScale}
                    sectionNorth={v.sectionNorth}
                    mode={v.mode}
                    registration={v.registration}
                    resetKey={reset}
                  />
                )
              )}
            </div>
            {v.mode === "ground" && representation === "solid" && (
              <SliceControls
                key={`${v.modelCampaign}:${viewReset}`}
                slice={slice}
                limits={limits}
                onChange={setSlice}
                cameraView={cameraView}
                onCamera={(view) => {
                  set("cameraView", view);
                  setReset(reset + 1);
                }}
                baseElevation={baseElevation}
                maxBase={maxBase}
                onBase={(value) => set("baseElevation", value)}
                onValidityChange={setSlicerInputsValid}
              />
            )}
          </div>
          {v.mode === "ground" && (
            <div className="real-layer-legend" aria-label="지층 범례">
              {(representation === "solid"
                ? [...VOLUME_LAYERS, ROCK_VOLUME_LAYER]
                : (analysis.model?.horizons ?? [])
              ).map(
                (h, i) =>
                  (representation === "solid" ? solidVisible : v.visible)[
                    i
                  ] && (
                    <span key={h.id}>
                      <i style={{ background: h.color }} />
                      {h.name}
                    </span>
                  ),
              )}
            </div>
          )}
          <div className="real-view-caption">
            <span>드래그로 회전 · 휠 또는 두 손가락으로 확대</span>
            <span>
              {v.mode === "ground"
                ? `관측자료 보간 · 암반 하부는 표시 하한 EL. ${f(baseElevation, 1)} m까지의 가정`
                : "촬영일·수직기준 미확인 · 높이 차이를 침하량으로 해석하지 마세요."}
            </span>
          </div>
          <details className="real-disclosure real-model-notes">
            <summary>모델 해석과 자료 한계</summary>
            <p className="real-muted real-under-view">
              채운 지층은 관측 경계 사이의 보간 영역입니다. 표층 복합층은 공구
              표고부터 풍화토 상단까지, 풍화토는 암반 출현면까지 표시합니다.
              암반은 모델 표시 하한 EL. {f(baseElevation, 1)} m까지 연장한
              가정입니다. 외곽은 시추공 분포에 따른 모델 범위이며 실제 수직 지층
              경계를 뜻하지 않습니다. DSM·점군 높이와 과거 공구 표고의 차이는
              침하량이 아닙니다.
            </p>
          </details>
          <details
            className="real-disclosure real-section-details"
            open={slice.enabled && v.mode === "ground"}
          >
            <summary>
              평면·단면도{" "}
              <span>
                {slice.enabled && v.mode === "ground"
                  ? "현재 절단면"
                  : "참고 단면"}
              </span>
            </summary>
            {representation === "solid" && !geometryError ? (
              <ModelSliceSection
                layers={slices.layers}
                slice={slice}
                visible={solidVisible}
                bounds={bounds}
                baseElevation={baseElevation}
                topElevation={topElevation}
                holes={modelHoles}
                linked={v.mode === "ground" && slice.enabled}
              />
            ) : (
              <>
                <section className="real-panel">
                  <div className="real-panel-heading">
                    <div>
                      <h2>동서 지층 단면</h2>
                      <p>
                        {representation === "solid"
                          ? "색 영역: 경계 사이 지층 · "
                          : ""}
                        실선: 내부 보간 · 점선: 외삽 · 막대: 단면 ±12m 내 관측공
                      </p>
                    </div>
                    <label>
                      N {f(v.sectionNorth, 1)} m
                      <input
                        aria-label="실제 지층 단면 북쪽 좌표"
                        type="range"
                        min={Math.min(...modelHoles.map((h) => h.northing))}
                        max={Math.max(...modelHoles.map((h) => h.northing))}
                        step={0.5}
                        value={v.sectionNorth}
                        onChange={(e) =>
                          set("sectionNorth", Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                  <Section
                    points={sectionPoints}
                    horizons={analysis.model?.horizons ?? []}
                    north={v.sectionNorth}
                    holes={modelHoles}
                    selected={selected.id}
                    onSelect={pick}
                    extrapolate={v.extrapolate}
                    filled={representation === "solid"}
                    solidVisible={solidVisible}
                    boundaryVisible={
                      representation === "solid"
                        ? [
                            solidVisible[0],
                            solidVisible[0] || solidVisible[1],
                            solidVisible[2],
                          ]
                        : v.visible
                    }
                  />
                </section>
              </>
            )}
          </details>
          <details className="real-disclosure" open={!!analysis.error}>
            <summary>
              보간 설정·검증 <span>베리오그램 · 교차검증</span>
            </summary>
            <div className="real-model-bottom">
              <section className="real-panel">
                <h3>베리오그램 설정</h3>
                <div className="real-input-grid">
                  <label>
                    모델
                    <select
                      value={v.parameters.model}
                      onChange={(e) =>
                        set("parameters", {
                          ...v.parameters,
                          model: e.target.value,
                        })
                      }
                    >
                      <option value="spherical">구형</option>
                      <option value="exponential">지수형</option>
                      <option value="gaussian">가우시안</option>
                    </select>
                  </label>
                  {(
                    [
                      ["range", "범위 (m)"],
                      ["sill", "부분 문턱값 (m²)"],
                      ["nugget", "너깃 (m²)"],
                    ] as const
                  ).map(([id, label]) => (
                    <label key={id}>
                      {label}
                      <input
                        type="number"
                        min={id === "nugget" ? 0 : 0.001}
                        value={v.parameters[id]}
                        onChange={(e) =>
                          set("parameters", {
                            ...v.parameters,
                            [id]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="real-muted">
                  설정값은 해석자가 선택한 보간 가정입니다. 원문 설계 지반정수와
                  별개입니다.
                </p>
              </section>
              <section className="real-panel">
                <h3>공 하나씩 제외한 교차검증</h3>
                {analysis.loo.map(
                  (row: { id: string; name: string; rmse: number | null }) => (
                    <div className="real-qc-row" key={row.id}>
                      <span>{row.name}</span>
                      <strong>
                        {row.rmse === null ? "관측공 부족" : `${f(row.rmse)} m`}
                      </strong>
                    </div>
                  ),
                )}
                <p className="real-muted">
                  RMSE는 동일 차수 내 예측 일관성 지표입니다. 측량 정확도나 설계
                  적합 판정이 아닙니다.
                </p>
              </section>
            </div>
          </details>
        </>
      )}
      {v.tab === "sources" && (
        <>
          <div className="real-source-campaigns">
            {campaigns.map((c) => (
              <article key={c.id}>
                <div
                  className="real-card-eyebrow"
                  style={{ color: CAMPAIGN_COLORS[c.id] }}
                >
                  {c.label}
                </div>
                <strong>
                  {c.holeCount}공 · {c.pageCount}쪽
                </strong>
                <p>
                  {"surveyPeriod" in c
                    ? String(c.surveyPeriod)
                    : "원문 조사기간 참조"}
                </p>
                <a
                  className="real-link"
                  href={c.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  보고서 원문 <ExternalLink size={13} />
                </a>
              </article>
            ))}
          </div>
          <div className="real-source-layout">
            <section className="real-panel real-hole-list">
              <label className="real-search">
                <Search size={16} />
                <input
                  type="search"
                  aria-label="시추공 검색"
                  placeholder="공번 또는 조사차수 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="real-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>조사차수 / 공번</th>
                      <th>표고 EL.m</th>
                      <th>총심도 m</th>
                      <th>구간 / 검수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filtered.length && (
                      <tr>
                        <td colSpan={4} className="real-empty-search">
                          일치하는 시추공이 없습니다. 공번이나 조사차수를
                          확인하세요.
                        </td>
                      </tr>
                    )}
                    {filtered.map((h) => (
                      <tr
                        key={h.id}
                        className={selected.id === h.id ? "selected" : ""}
                        onClick={() => openHoleDetail(h.id)}
                      >
                        <td>
                          <button
                            aria-label={`${h.campaign} ${h.label} 관측 자료 보기`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openHoleDetail(h.id);
                            }}
                          >
                            <small>{h.campaign}</small>
                            <strong>{h.label}</strong>
                          </button>
                        </td>
                        <td>{f(h.collar)}</td>
                        <td>{f(h.declaredTotalDepth, 1)}</td>
                        <td>
                          {h.layers.length}개{" "}
                          {h.qc.length ? (
                            <span className="real-qc-alert">원문 충돌</span>
                          ) : (
                            <span className="real-qc-good">전사 검수</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <HoleCard />
          </div>
          <section
            id="real-ground-original"
            className="real-panel real-original"
          >
            <div className="real-panel-heading">
              <div>
                <h2
                  id="real-ground-original-heading"
                  ref={originalHeading}
                  tabIndex={-1}
                  className="real-focus-target"
                >
                  {selected.campaign} · {selected.label} 원문 주상도
                </h2>
                <p>
                  {HAS_PROVIDED_ORIGINALS
                    ? "원본 PDF의 해당 페이지입니다. 요약표 전사와 원문을 함께 확인하세요."
                    : "원문 페이지 번호와 전사한 지층 자료를 함께 확인하세요."}
                </p>
              </div>
              <div className="real-original-pages">
                {selected.logPages.map((p, i) => (
                  <button
                    key={p}
                    className={i === logIndex ? "active" : ""}
                    onClick={() => setLogIndex(i)}
                  >
                    PDF {p}쪽
                  </button>
                ))}
                <a
                  className="real-link"
                  href={`/documents/${selected.sourceId}.pdf#page=${selected.logPages[logIndex] ?? selected.layerPage}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF 열기 <ExternalLink size={13} />
                </a>
              </div>
            </div>
            {HAS_PROVIDED_ORIGINALS ? (
              selected.logImages?.[logIndex] && (
                <img
                  src={selected.logImages[logIndex]}
                  alt={`${selected.campaign} ${selected.label} 원본 주상도 PDF ${selected.logPages[logIndex]}쪽`}
                />
              )
            ) : (
              <div className="real-warning" role="note">
                <FileText size={20} aria-hidden="true" />
                <div>
                  <strong>
                    원문 주상도는 현장 원자료본에서 열람할 수 있습니다.
                  </strong>
                  <p>{PROVIDED_SOURCE_NOTICE}</p>
                  <p>
                    {selected.campaign} · {selected.label} · PDF{" "}
                    {selected.logPages[logIndex] ?? selected.layerPage}쪽
                  </p>
                </div>
              </div>
            )}
            <div className="real-original-links">
              <a
                href={`/documents/${selected.sourceId}.pdf#page=${selected.coordinatePage}`}
                target="_blank"
                rel="noreferrer"
              >
                좌표·표고 근거: PDF {selected.coordinatePage}쪽
              </a>
              <a
                href={`/documents/${selected.sourceId}.pdf#page=${selected.layerPage}`}
                target="_blank"
                rel="noreferrer"
              >
                지층 구간 근거: PDF {selected.layerPage}쪽
              </a>
            </div>
          </section>
        </>
      )}
      {v.tab === "quality" && (
        <>
          <div className="real-model-bottom">
            <section className="real-panel">
              <h2>좌표와 정합</h2>
              <dl className="real-definition">
                <dt>기준 원점 ENH</dt>
                <dd>239800 / 521450 / 0 m</dd>
                <dt>원문 시추 좌표</dt>
                <dd>E = 원문 Y, N = 원문 X · 원문 값 유지</dd>
                <dt>드론 좌표계</dt>
                <dd>EPSG:5186 (GeoTIFF·GCP 파일)</dd>
                <dt>시추 좌표계</dt>
                <dd>원문 표기 미확인 · 현장 위치 기반 개략 대응</dd>
                <dt>영상 독립 검사점</dt>
                <dd>대응점 미확보 · RMSE 산출 안 함</dd>
                <dt>높이 보정</dt>
                <dd>기본 0 m · KNGeoid18 미적용</dd>
              </dl>
              <p className="real-muted">
                주상도 좌표·표고가 기준입니다. GCP의 지상 좌표만으로 영상의 독립
                정합 정확도를 산출하지 않습니다.
              </p>
            </section>
            <section className="real-panel">
              <h2>CAD 정합 근거</h2>
              <dl className="real-definition">
                <dt>도면 축척</dt>
                <dd>{assets ? f(assets.cad.scale, 6) : "…"} (mm → m)</dd>
                <dt>회전각</dt>
                <dd>{assets ? f(assets.cad.rotationDegrees, 6) : "…"}°</dd>
                <dt>적합에 사용한 점</dt>
                <dd>3점</dd>
                <dt>적합 제외 경계점</dt>
                <dd>
                  43점 · RMSE{" "}
                  {assets ? assets.cad.heldOutRMSE.toExponential(2) : "…"} m
                </dd>
                <dt>별도 CAD 좌표 검사</dt>
                <dd>
                  4점 · RMSE{" "}
                  {assets ? assets.cad.CADControlRMSE.toExponential(2) : "…"} m
                </dd>
              </dl>
              <p className="real-muted">
                동일 CAD의 도면·좌표 간 내부 일관성 검사입니다. 현장 측량 정확도
                또는 독립 영상 정합 정확도를 의미하지 않습니다.
              </p>
            </section>
          </div>
          <section className="real-panel">
            <h2>원자료 검수 상태</h2>
            <div className="real-qc-summary">
              <CheckCircle2 size={20} />
              <span>
                4개 보고서 · 32공 좌표·표고 및 96구간 전사 · 원본 주상도 페이지
                연결
              </span>
            </div>
            {holes
              .filter((h) => h.qc.length)
              .map((h) => (
                <div className="real-warning" key={h.id}>
                  <AlertTriangle size={18} />
                  <span>
                    <strong>{h.id}</strong> — {h.qc.join(" ")}
                  </span>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      pick(h.id);
                      setV({ ...v, selected: h.id, tab: "sources" });
                    }}
                  >
                    원문 확인
                  </button>
                </div>
              ))}
            <p className="real-muted">
              단위·구간 연속성·중복 ID·시추 종료와 지층 경계를 분리하여
              검사합니다. 불일치를 자동 수정하지 않습니다.
            </p>
          </section>
          <section className="real-panel">
            <h2>드론 추가 맞춤</h2>
            <p className="real-muted">
              기본은 원본 지리좌표를 그대로 사용합니다. 현장 원점 주변의 추가
              이동·회전·축척만 설정하며, 시추 좌표는 바뀌지 않습니다. 수직
              차이의 원인을 확인하지 않은 상태에서 높이를 맞추지 마세요.
            </p>
            <RegistrationControls
              key={viewReset}
              value={v.registration}
              onChange={(value) => set("registration", value)}
              onReset={() => set("registration", initial().registration)}
              onValidityChange={setRegistrationInputsValid}
            />
            <p className="real-muted">
              추가 맞춤값은 검토 저장에 포함됩니다. 독립 검사점이 없어 정확도
              판정은 보류합니다.
            </p>
          </section>
        </>
      )}
      <section className="real-save-bar">
        <div>
          <strong>저장한 검토</strong>
          <p>
            조사차수·절단 위치·선택 시점·정합값을 보관합니다. 자유 회전한 각도는
            저장하지 않습니다.
          </p>
        </div>
        <div className="real-save-actions">
          <select
            aria-label="저장된 실제 지반 검토"
            value={selectedRecord}
            onChange={(e) => setSelectedRecord(e.target.value)}
          >
            <option value="">저장된 지반 검토 ({saved.length}건)</option>
            {saved.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · r{r.revision}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            disabled={!selectedRecord}
            onClick={load}
          >
            불러오기
          </button>
          <button
            className="btn btn-secondary"
            disabled={
              !!analysis.error ||
              !!geometryError ||
              !slicerInputsValid ||
              !registrationInputsValid ||
              !assets
            }
            onClick={() =>
              download("이천자이더리체_실제지반검토.json", getPayload())
            }
          >
            <Download size={15} /> JSON 내보내기
          </button>
        </div>
      </section>
    </div>
  );
}
