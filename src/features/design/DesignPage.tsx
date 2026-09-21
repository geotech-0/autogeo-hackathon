import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, SetStateAction } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Gauge,
  GitCompareArrows,
  Layers,
  Link2,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import type { FeatureProps, ProjectRecord } from "../../contracts";
import { useDraft } from "../../storage/useDraft";
import { HAS_PROVIDED_ORIGINALS } from "../../data/source-access";
import {
  MEMBER_IDS,
  MODULES,
  VERSION,
  comparisonRows,
  computeWorkspace,
  confirmGeometry,
  createRealWorkspace,
  getModule,
  getPreset,
  getSection,
  REAL_DESIGN,
  sourceComparison,
  RESULT_LABELS,
  exportDesign,
  importDesign,
  makeDesignDraft,
  restoreWorkspace,
  updateQuantity,
  updateValue,
} from "./model.mjs";
import type { Field, MemberId, Workspace } from "./model.mjs";
import { makeReport } from "./report.mjs";
import "./design.css";

const fmt = (value: number | undefined, places = 2) =>
  value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: places }).format(
        value,
      );
const statusText: Record<string, string> = {
  pass: "채택 기준 만족",
  exceeded: "기준 초과",
  stale: "해석 재확인",
  error: "입력 확인",
};
const iconMap = {
  anchor: Link2,
  wale: Layers,
  pile: Gauge,
  timber: ClipboardCheck,
};
const steps = [
  { name: "자료 확인", note: "출처와 모델 개정" },
  { name: "제원 설정", note: "치수와 검토계수" },
  { name: "해석값 채택", note: "수동 최대값·단위" },
  { name: "검토와 저장", note: "결과·근거·비교" },
];
const sourceFields = {
  id: "자료 ID",
  revision: "자료 개정",
  label: "자료명",
  program: "해석 프로그램 / 방법",
  modelId: "해석 모델 ID",
  modelRevision: "해석 모델 개정",
  evidence: "자료 근거",
} as const;
const inputId = (id: MemberId, key: string) => `design-input-${id}-${key}`;
const fieldRange = (f: Field) => {
  const range =
    f.min !== undefined && f.max !== undefined
      ? `입력 범위: ${f.min}~${f.max} ${f.unit}`
      : f.min !== undefined
        ? `입력 하한: ${f.min} ${f.unit}`
        : f.max !== undefined
          ? `입력 상한: ${f.max} ${f.unit}`
          : "유한한 숫자를 입력하세요.";
  return `${range}${f.key === "strandCount" ? " · 정수" : ""}`;
};
const resultMetric: Record<
  MemberId,
  { key: string; label: string; unit: string }[]
> = {
  anchor: [
    { key: "designForceKn", label: "소요 설계축력 Treq", unit: "kN/개" },
    { key: "jackingForceKn", label: "초기긴장력 Jf", unit: "kN/개" },
    { key: "requiredAnchorageLengthM", label: "필요 정착장", unit: "m" },
  ],
  wale: [
    { key: "supportReactionKn", label: "분담 반력", unit: "kN" },
    { key: "momentKnm", label: "최대 모멘트", unit: "kN·m" },
    { key: "shearKn", label: "최대 전단력", unit: "kN" },
  ],
  pile: [
    { key: "momentKnm", label: "1본 모멘트", unit: "kN·m" },
    { key: "displacementLimitMm", label: "허용 수평변위", unit: "mm" },
    { key: "allowableBearingKn", label: "허용지지력 Qa", unit: "kN" },
  ],
  timber: [
    { key: "spanMm", label: "설계지간", unit: "mm" },
    { key: "lineLoadKnm", label: "환산 선하중", unit: "kN/m" },
    { key: "requiredBothMm", label: "휨·전단 필요두께", unit: "mm" },
  ],
};
function Badge({ status }: { status: string }) {
  return (
    <span className={`design-status design-status-${status}`}>
      {status === "pass" ? (
        <Check size={12} />
      ) : status === "error" || status === "exceeded" ? (
        <TriangleAlert size={12} />
      ) : (
        <RotateCcw size={12} />
      )}{" "}
      {statusText[status] || status}
    </span>
  );
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function MemberDiagram({ id, state }: { id: MemberId; state: Workspace }) {
  const v = state.members[id].values;
  return (
    <svg
      className="design-diagram"
      viewBox="0 0 320 188"
      role="img"
      aria-label={`${MODULES[id].title} 개념도, 치수 비례 아님`}
    >
      <defs>
        <pattern
          id={`dots-${id}`}
          width="11"
          height="11"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="3" cy="3" r="1" fill="#D5DCE7" />
        </pattern>
        <marker
          id={`arr-${id}`}
          markerWidth="5"
          markerHeight="5"
          refX="2.5"
          refY="2.5"
          orient="auto-start-reverse"
        >
          <path d="M0 0L5 2.5L0 5" fill="#728299" />
        </marker>
      </defs>
      <rect width="320" height="188" rx="12" fill="#F6F8FC" />
      {id === "anchor" ? (
        <>
          <path d="M92 27H306V172H92" fill={`url(#dots-${id})`} />
          <path d="M88 30V159" stroke="#6A7C93" strokeWidth="8" />
          <path d="M77 59L269 152" stroke="#0F6FFF" strokeWidth="5" />
          <path
            d="M205 121L273 154"
            stroke="#0F6FFF"
            strokeWidth="15"
            strokeLinecap="round"
            opacity=".3"
          />
          <path d="M83 38H136" stroke="#9DACBC" strokeDasharray="4 3" />
          <text x="33" y="44">
            {getModule(state, id).asset}
          </text>
          <text x="128" y="90">
            Lf {v.adoptedFreeLengthM} m
          </text>
          <text x="207" y="116">
            La {v.adoptedAnchorageLengthM} m
          </text>
          <text x="109" y="154">
            {v.strandCount}본 · Ø12.7
          </text>
          <text x="22" y="178" className="design-diagram-note">
            축방향 R′ × 간격 → Treq → Jf
          </text>
        </>
      ) : id === "wale" ? (
        <>
          <path d="M29 63H291M29 132H291" stroke="#75849A" strokeWidth="10" />
          <path d="M77 57V138M243 57V138" stroke="#0F6FFF" strokeWidth="7" />
          <path d="M172 30L213 88" stroke="#0F6FFF" strokeWidth="4" />
          <path
            d="M77 164H243"
            stroke="#728299"
            markerStart={`url(#arr-${id})`}
            markerEnd={`url(#arr-${id})`}
          />
          <text x="118" y="182">
            L {v.spanMm} mm
          </text>
          <text x="29" y="33">
            2H / 상단 분담
          </text>
          <text x="198" y="41">
            Jf · {getModule(state, "wale").fixed.angleDeg}°
          </text>
          <text x="111" y="103">
            c / a = {fmt(Number(v.leverCMm) / Number(v.leverAMm), 3)}
          </text>
        </>
      ) : id === "pile" ? (
        <>
          <path d="M170 24V161" stroke="#53647B" strokeWidth="12" />
          <path
            d="M165 24H195V161H165"
            fill="none"
            stroke="#A4B2C5"
            strokeWidth="3"
          />
          <path
            d="M35 35H159M35 78H159M35 121H159"
            stroke="#0F6FFF"
            strokeWidth="2"
            markerEnd={`url(#arr-${id})`}
          />
          <path
            d="M195 26Q245 92 195 156"
            fill="none"
            stroke="#0F6FFF"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <text x="29" y="166">
            M′, V′ × s
          </text>
          <text x="216" y="86">
            δ {v.displacementMm}
          </text>
          <text x="216" y="105">
            {state.members.pile.quantities.displacementMm.unit}
          </text>
          <text x="108" y="183">
            H = {getModule(state, "pile").fixed.excavationDepthM} m
          </text>
        </>
      ) : (
        <>
          <path d="M43 58H277V126H43Z" fill="#D5E5FA" stroke="#80A7D3" />
          <path
            d="M45 41V144M62 41V144M258 41V144M275 41V144"
            stroke="#62778F"
            strokeWidth="5"
          />
          <path
            d="M62 157H258"
            stroke="#728299"
            markerStart={`url(#arr-${id})`}
            markerEnd={`url(#arr-${id})`}
          />
          <text x="108" y="178">
            s {v.spacingMm} mm
          </text>
          <text x="94" y="87">
            H {v.heightMm} mm
          </text>
          <text x="94" y="108">
            t {v.thicknessMm} mm
          </text>
          <text x="86" y="30">
            면압 p → 선하중 pH
          </text>
        </>
      )}
    </svg>
  );
}

export default function DesignPage({
  records,
  onSave,
  notify,
  requestedRecordId,
}: FeatureProps) {
  type DraftLibrary = {
    activePresetId: string;
    workspaces: Record<string, Workspace>;
  };
  const [library, setLibrary, { ready, error: storageError, retry }] =
    useDraft<DraftLibrary>("design-real-library-v1", () => ({
      activePresetId: "b-left-1",
      workspaces: { "b-left-1": createRealWorkspace() },
    }));
  const state =
    library.workspaces[library.activePresetId] ||
    createRealWorkspace(library.activePresetId);
  const setState = (action: SetStateAction<Workspace>) =>
    setLibrary((lib) => {
      const previous =
        lib.workspaces[lib.activePresetId] ||
        createRealWorkspace(lib.activePresetId);
      const next = typeof action === "function" ? action(previous) : action;
      const key = next.presetId || lib.activePresetId;
      return {
        activePresetId: key,
        workspaces: { ...lib.workspaces, [key]: next },
      };
    });
  const preset = getPreset(state)!;
  const section = getSection(state)!;
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const selectPreset = (id: string) => {
    setLibrary((lib) => ({
      activePresetId: id,
      workspaces: {
        ...lib.workspaces,
        [id]: lib.workspaces[id] || createRealWorkspace(id),
      },
    }));
    setLoadedId(null);
    setCompareId("");
    setResetPending(false);
    setStep(0);
  };
  const [member, setMember] = useState<MemberId>("anchor");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const savedHeadingRef = useRef<HTMLHeadingElement>(null);
  const savedToggleRef = useRef<HTMLButtonElement>(null);
  const memberTabRefs = useRef<
    Partial<Record<MemberId, HTMLButtonElement | null>>
  >({});
  const [focusRequest, setFocusRequest] = useState<{
    area: "editor" | "saved";
    field?: string;
  } | null>(null);
  const restoredRequestId = useRef<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const goToStep = (next: number, id: MemberId = member, field?: string) => {
    setMember(id);
    setStep(next);
    setFocusRequest({ area: "editor", field });
  };
  useEffect(() => {
    if (!focusRequest) return;
    const target =
      focusRequest.area === "saved"
        ? savedHeadingRef.current
        : (focusRequest.field
            ? document.getElementById(focusRequest.field)
            : null) || editorHeadingRef.current;
    // A collapsed disclosure must reveal an invalid field before it receives focus.
    let ancestor = target?.closest?.("details");
    while (ancestor) {
      ancestor.open = true;
      ancestor = ancestor.parentElement?.closest("details");
    }
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [focusRequest]);
  useEffect(() => {
    if (!reportOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = reportRef.current;
    const first = modal?.querySelector<HTMLButtonElement>("button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReportOpen(false);
        return;
      }
      if (e.key === "Tab" && modal) {
        const controls = [
          ...modal.querySelectorAll<HTMLElement>(
            'button:not(:disabled),[tabindex="0"]',
          ),
        ];
        const start = controls[0],
          end = controls.at(-1);
        if (e.shiftKey && document.activeElement === start) {
          e.preventDefault();
          end?.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          start?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [reportOpen]);
  const calculated = useMemo(() => computeWorkspace(state), [state]);
  const current = calculated[member];
  const module = getModule(state, member);
  const invalidMembers = MEMBER_IDS.filter((id) => !calculated[id].ok);
  const firstMissingSource = (
    Object.keys(sourceFields) as (keyof typeof sourceFields)[]
  ).find((key) => !state.source[key].trim());
  const errorLabel = (id: MemberId, key: string) =>
    key === "_source"
      ? "자료 출처"
      : key === "anchorForceKn"
        ? "연결된 앵커 입력"
        : getModule(state, id).fields.find((f) => f.key === key)?.label ||
          "계산 조건";
  const fixError = (
    id: MemberId,
    key = Object.keys(calculated[id].errors || {})[0],
  ): void => {
    if (key === "anchorForceKn") {
      fixError("anchor");
      return;
    }
    if (key === "_source") {
      goToStep(
        0,
        id,
        firstMissingSource ? `design-source-${firstMissingSource}` : undefined,
      );
      return;
    }
    const field = getModule(state, id).fields.find((f) => f.key === key);
    const q = state.members[id].quantities[key];
    const missingMetadata =
      field?.group === "analysis" &&
      calculated[id].errors?.[key] ===
        "지배단계·위치·채택값 근거를 함께 입력하세요."
        ? (["stage", "location", "evidence"] as const).find(
            (name) => !q[name]?.trim(),
          )
        : undefined;
    goToStep(
      field?.group === "analysis" ? 2 : 1,
      id,
      id === "pile" &&
        key === "ultimateBearingKn" &&
        !state.source.quEvidence.trim()
        ? "design-qu-evidence"
        : missingMetadata
          ? `${inputId(id, key)}-${missingMetadata}`
          : field
            ? inputId(id, key)
            : undefined,
    );
  };
  const saved = records
    .filter((r) => r.stage === "design" && r.payload.kind === "design-review")
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const invalid = MEMBER_IDS.some((id) => !calculated[id].ok);
  const stale = MEMBER_IDS.some((id) => calculated[id].status === "stale");
  const exceeded = MEMBER_IDS.some(
    (id) => calculated[id].status === "exceeded",
  );
  const overall = invalid
    ? "error"
    : stale
      ? "stale"
      : exceeded
        ? "exceeded"
        : "pass";
  const allChecks = MEMBER_IDS.reduce(
    (n, id) => n + (calculated[id].checks?.length || 0),
    0,
  );
  const passed = MEMBER_IDS.reduce(
    (n, id) => n + (calculated[id].checks?.filter((c) => c.pass).length || 0),
    0,
  );
  const patchSource = (key: keyof Workspace["source"], value: string) =>
    setState((s) => ({ ...s, source: { ...s.source, [key]: value } }));
  const change = (key: string, value: string) =>
    setState((s) => updateValue(s, member, key, value));
  const save = async (asNew = false) => {
    setBusy(true);
    try {
      const draft = makeDesignDraft(state);
      if (loadedId) {
        const previous = records.find((r) => r.id === loadedId);
        if (previous) {
          if (!asNew) {
            draft.id = loadedId;
          } else {
            draft.payload.based_on = {
              analysis_id: previous.analysis_id,
              revision: previous.revision,
            };
            draft.dependencies = [
              {
                analysis_id: previous.analysis_id,
                revision: previous.revision,
              },
            ];
          }
        }
      }
      const record = await onSave(draft);
      setLoadedId(record.id);
      notify(
        `${record.title} · 개정 ${record.revision} 저장했습니다.`,
        "success",
      );
      setShowSaved(true);
      setFocusRequest({ area: "saved" });
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "기록을 저장할 수 없습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  const load = (record: ProjectRecord) => {
    try {
      const restored = restoreWorkspace(record.payload.workspace);
      if (!restored.presetId)
        throw new Error("이 화면은 이천자이더리체 원문 검토안만 불러옵니다.");
      setState(restored);
      setLoadedId(record.id);
      goToStep(3);
      notify(
        "저장한 입력을 불러와 현재 방법으로 다시 계산했습니다.",
        "success",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "기록을 읽을 수 없습니다.",
        "error",
      );
    }
  };
  useEffect(() => {
    if (!requestedRecordId) {
      restoredRequestId.current = null;
      return;
    }
    if (!ready || restoredRequestId.current === requestedRecordId) return;
    const record = records.find(
      (r) =>
        r.id === requestedRecordId &&
        r.stage === "design" &&
        r.payload.kind === "design-review",
    );
    if (!record) return;
    // Restore once per navigation request. Later record refreshes must not replace edits.
    restoredRequestId.current = requestedRecordId;
    try {
      const restored = restoreWorkspace(record.payload.workspace);
      if (!restored.presetId)
        throw new Error("이 화면은 이천자이더리체 원문 검토안만 불러옵니다.");
      const key = restored.presetId;
      setLibrary((lib) => ({
        activePresetId: key,
        workspaces: { ...lib.workspaces, [key]: restored },
      }));
      setLoadedId(record.id);
      setStep(3);
      setFocusRequest({ area: "editor" });
      notify(
        `선택한 검토안 · 개정 ${record.revision}을 불러왔습니다.`,
        "success",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "기록을 읽을 수 없습니다.",
        "error",
      );
    }
  }, [ready, requestedRecordId, records, setLibrary, notify]);
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000)
        throw new Error("설계 JSON은 1 MB 이하만 가져올 수 있습니다.");
      const restored = importDesign(await file.text());
      if (!restored.presetId)
        throw new Error("이천자이더리체 원문 단면이 지정된 JSON을 가져오세요.");
      setState(restored);
      setLoadedId(null);
      setCompareId("");
      setResetPending(false);
      setStep(0);
      setFocusRequest({ area: "editor" });
      notify(
        "설계 입력을 가져왔습니다. 출처와 해석 모델을 확인하세요.",
        "success",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "가져오기에 실패했습니다.",
        "error",
      );
    }
    event.target.value = "";
  };
  const fileName = state.label.replace(/[^a-zA-Z0-9가-힣_-]/g, "_") || "design";
  const exportReport = () => {
    try {
      download(
        `${fileName}_부재검토.html`,
        makeReport(
          state,
          new Date().toISOString(),
          window.location.origin,
          HAS_PROVIDED_ORIGINALS,
        ),
        "text/html;charset=utf-8",
      );
      notify(
        "입력·근거·단위·개정을 포함한 보고서를 내려받았습니다.",
        "success",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "보고서를 만들 수 없습니다.",
        "error",
      );
    }
  };
  let comparison: ReturnType<typeof comparisonRows> | null = null;
  const comparisonRecord = saved.find((r) => r.id === compareId);
  if (comparisonRecord) {
    try {
      comparison = comparisonRows(
        restoreWorkspace(comparisonRecord.payload.workspace),
        state,
      );
    } catch {
      /* incompatible records remain visible but cannot be compared */
    }
  }
  const fieldControl = (f: Field) => {
    const error = current.errors?.[f.key];
    return (
      <label
        className={`design-field ${error ? "design-field-error" : ""}`}
        key={f.key}
      >
        <span>
          {f.label}
          {f.affectsAnalysis && (
            <span
              className="design-field-dot"
              title="변경 후 해석결과 대응 확인 필요"
            />
          )}
        </span>
        <div className="design-input-unit">
          <input
            id={inputId(member, f.key)}
            aria-label={`${module.title} ${f.label}`}
            inputMode={f.key === "strandCount" ? "numeric" : "decimal"}
            type="text"
            value={state.members[member].values[f.key]}
            onChange={(e) => change(f.key, e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={`${inputId(member, f.key)}-hint${error ? ` ${inputId(member, f.key)}-error` : ""}`}
            autoComplete="off"
          />
          <span>{f.unit}</span>
        </div>
        <small
          className="design-input-hint"
          id={`${inputId(member, f.key)}-hint`}
        >
          {fieldRange(f)}
          {f.affectsAnalysis ? " · 변경 시 해석 재확인" : ""}
        </small>
        {(state.members[member].origins?.[f.key] !== "imported_analysis" ||
          Number(state.members[member].values[f.key]) !==
            preset.inputs[member][f.key]) && (
          <small className="design-value-origin">
            {state.members[member].origins?.[f.key] === "imported_analysis"
              ? "원문 초기값"
              : "사용자 수정값"}
            {Number(state.members[member].values[f.key]) !==
            preset.inputs[member][f.key]
              ? ` · 초기 ${preset.inputs[member][f.key]} ${f.unit}`
              : ""}
          </small>
        )}
        {error && (
          <small id={`${inputId(member, f.key)}-error`} role="alert">
            {error}
          </small>
        )}
      </label>
    );
  };
  if (!ready)
    return (
      <div className="design-loading">
        저장된 설계 입력을 불러오는 중입니다.
      </div>
    );
  return (
    <div className="design-page">
      <div className="design-topline">
        <div>
          <div className="design-breadcrumb">
            설계 검토 <ChevronRight size={13} /> 이천자이더리체{" "}
            <ChevronRight size={13} /> {section.label}
          </div>
          <h1>흙막이 부재 검토</h1>
          <p>단면과 부재를 선택하고, 입력부터 판정·저장까지 검토하세요.</p>
        </div>
        <div className="design-top-actions">
          <button
            ref={savedToggleRef}
            className="btn btn-secondary"
            onClick={() => {
              setShowSaved((v) => !v);
              if (!showSaved) setFocusRequest({ area: "saved" });
            }}
            aria-expanded={showSaved}
            aria-controls="design-saved-records"
          >
            <FolderOpen size={16} />
            저장한 검토안 <span className="design-count">{saved.length}</span>
          </button>
          <button
            className="btn btn-primary"
            disabled={invalid || busy}
            aria-describedby="design-save-guidance"
            onClick={() => save()}
          >
            <Save size={16} />
            {busy ? "저장 중…" : loadedId ? "개정 저장" : "검토안 저장"}
          </button>
        </div>
      </div>
      {storageError && (
        <div className="notice notice-error" role="alert">
          자동 임시저장에 문제가 있습니다. JSON 내보내기로 현재 입력을
          보관하세요. {storageError}
          <p>다시 불러오면 현재 화면의 변경 내용이 저장된 입력으로 바뀝니다.</p>
          <button className="btn btn-secondary" onClick={retry}>
            저장된 입력 다시 불러오기
          </button>
        </div>
      )}
      <div className="design-project-strip">
        <span className="design-source-pill">
          {state.source.origin === "synthetic"
            ? "합성 자료"
            : "2023.06 원문 기반"}
        </span>
        <span>H-Pile + 토류판 + 어스앵커</span>
        <span className="design-strip-divider" />
        <span>
          변위 검토 깊이 <b>{section.depth} m</b>
        </span>
        <span className="design-strip-divider" />
        <span>
          모델 <b>{state.source.modelId}</b> · r{state.source.modelRevision}
        </span>
        <span className="design-strip-end">
          <ShieldCheck size={14} /> 수동 해석값 기반 부재 검토
        </span>
      </div>
      <section className="panel design-case-selector">
        <div className="design-case-heading">
          <div>
            <h2>검토 위치</h2>
            <p>① 위치 선택 → ② 부재별 입력 확인 → ③ 네 부재를 함께 저장</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setCatalogOpen((v) => !v)}
            aria-expanded={catalogOpen}
            aria-controls="design-source-catalog"
          >
            <FolderOpen size={16} />
            전체 원문 검토 목록
          </button>
        </div>
        <div className="design-case-controls">
          <label className="design-field">
            <span>흙막이 단면</span>
            <select
              aria-label="흙막이 단면"
              value={preset.sectionId}
              onChange={(e) => selectPreset(`${e.target.value}-1`)}
            >
              {REAL_DESIGN.sections
                .filter((s) => s.supported)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.method}
                  </option>
                ))}
            </select>
          </label>
          <label className="design-field">
            <span>앵커 · 연결 띠장</span>
            <select
              aria-label="앵커 단"
              value={state.presetId}
              onChange={(e) => selectPreset(e.target.value)}
            >
              {REAL_DESIGN.presets
                .filter((p) => p.sectionId === preset.sectionId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.level}단 · GL -{[1.01, 4.11, 7.21][p.level - 1]} m
                  </option>
                ))}
            </select>
          </label>
          <div className="design-case-links">
            <a
              href={`${REAL_DESIGN.source.url}#page=${section.sectionPage}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={15} />
              계산서 단면 p{section.sectionPage}
            </a>
            <a
              href={`${REAL_DESIGN.source.drawingUrl}#page=${section.drawingPage}`}
              target="_blank"
              rel="noreferrer"
            >
              <Layers size={15} />
              원본 도면 p{section.drawingPage}
            </a>
            <button
              className="btn btn-ghost"
              onClick={() => setSourceOpen((v) => !v)}
              aria-expanded={sourceOpen}
              aria-controls="design-source-drawing"
            >
              단면 그림 {sourceOpen ? "접기" : "보기"}
            </button>
          </div>
        </div>
        {sourceOpen && (
          <div className="design-source-drawing" id="design-source-drawing">
            <img
              src={`/data/design/section-${section.id}.png`}
              alt={`${section.label} 원문 표준단면과 지층·사용부재 표`}
            />
            <p>
              계산서 PDF p{section.sectionPage} · 원문 그림 · 확대는 위의 계산서
              링크를 이용하세요.
            </p>
          </div>
        )}
        {section.issue && (
          <div className="design-source-issue" role="status">
            <TriangleAlert size={18} />
            <div>
              <b>D-D′ 원문 깊이 확인 필요</b>
              <p>{section.issue}</p>
              <a
                href={`${REAL_DESIGN.source.url}#page=172`}
                target="_blank"
                rel="noreferrer"
              >
                단계표 p172 ↗
              </a>{" "}
              ·{" "}
              <a
                href={`${REAL_DESIGN.source.url}#page=168`}
                target="_blank"
                rel="noreferrer"
              >
                변위 검토 p168 ↗
              </a>
            </div>
          </div>
        )}
        {catalogOpen && (
          <div className="design-source-catalog" id="design-source-catalog">
            <div className="design-catalog-summary">
              <b>6개 단면 중 3개 흙막이 단면을 자동 재계산</b>
              <p>
                앵커 7개 단 + 띠장 7개 단 + H-Pile 3개 단면 + 토류판 3개 단면.
                H-Pile·토류판은 선택 단면의 원문값으로 시작합니다. 사면·전체
                안정·기초·배수 결과는 원문 검토 자료입니다.
              </p>
            </div>
            {REAL_DESIGN.sections.map((s) => (
              <article key={s.id}>
                <div>
                  <b>{s.label}</b>
                  <span
                    className={
                      s.supported
                        ? "design-catalog-auto"
                        : "design-catalog-reference"
                    }
                  >
                    {s.supported ? "4부재 자동 재계산" : "원문 결과 열람"}
                  </span>
                </div>
                <p>{s.description}</p>
                {s.summary && (
                  <p className="design-original-result">{s.summary}</p>
                )}
                <a
                  href={`${REAL_DESIGN.source.url}#page=${s.pages[0]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  계산서 p{s.pages.join("~")} ↗
                </a>
                {s.supported && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      selectPreset(`${s.id}-1`);
                      setCatalogOpen(false);
                    }}
                  >
                    이 단면 검토 <ArrowRight size={13} />
                  </button>
                )}
              </article>
            ))}
            {REAL_DESIGN.additionalReviews.map((r) => (
              <article key={r.label}>
                <div>
                  <b>{r.label}</b>
                  <span className="design-catalog-reference">
                    원문 결과 열람
                  </span>
                </div>
                <p>{r.description}</p>
                {r.summary && (
                  <p className="design-original-result">{r.summary}</p>
                )}
                <a
                  href={`${REAL_DESIGN.source.url}#page=${r.pages[0]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  결과 근거 p{r.pages.join("~")} ↗
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="design-member-tabs" role="tablist" aria-label="검토 부재">
        {MEMBER_IDS.map((id, i) => {
          const Icon = iconMap[id];
          return (
            <button
              role="tab"
              id={`design-member-${id}`}
              aria-selected={member === id}
              aria-controls="design-member-panel"
              tabIndex={member === id ? 0 : -1}
              ref={(node) => {
                memberTabRefs.current[id] = node;
              }}
              key={id}
              className={member === id ? "is-active" : ""}
              onClick={() => setMember(id)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? MEMBER_IDS.length - 1
                      : direction
                        ? (i + direction + MEMBER_IDS.length) %
                          MEMBER_IDS.length
                        : -1;
                if (nextIndex < 0) return;
                event.preventDefault();
                const next = MEMBER_IDS[nextIndex];
                setMember(next);
                memberTabRefs.current[next]?.focus();
              }}
            >
              <span className="design-member-icon">
                <Icon size={21} />
              </span>
              <span>
                <small>0{i + 1}</small>
                <strong>{MODULES[id].title}</strong>
                <em>{MODULES[id].subtitle}</em>
              </span>
              <Badge status={calculated[id].status} />
            </button>
          );
        })}
      </div>
      <div
        className={`design-review-state ${invalid ? "has-errors" : ""}`}
        id="design-save-guidance"
      >
        <div>
          <strong>
            {invalid
              ? "입력을 확인하면 저장할 수 있습니다."
              : loadedId
                ? "현재 검토안에 새 개정을 저장합니다."
                : "선택한 위치의 네 부재를 함께 저장합니다."}
          </strong>
          <p>
            {invalid
              ? "아래 부재를 선택하면 확인이 필요한 입력으로 이동합니다."
              : stale
                ? "해석 재확인 상태를 유지해 저장합니다. 기준 만족 여부와 별도로 확인이 필요합니다."
                : exceeded
                  ? "기준 초과 항목을 포함한 검토 기록으로 저장합니다."
                  : "입력은 이 브라우저에 임시 보관됩니다. 검토안 저장을 눌러 이력에 남기세요."}
          </p>
        </div>
        {invalid && (
          <div className="design-error-shortcuts">
            {invalidMembers.map((id) => (
              <button
                className="btn btn-secondary"
                key={id}
                onClick={() => fixError(id)}
              >
                {MODULES[id].title} 입력 확인 <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="design-workspace">
        <section
          className="design-main panel"
          id="design-member-panel"
          role="tabpanel"
          aria-labelledby={`design-member-${member}`}
        >
          <div className="design-stepper" aria-label="검토 단계">
            {steps.map((s, i) => (
              <button
                className={`${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}
                key={s.name}
                onClick={() => goToStep(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="design-step-number">{i + 1}</span>
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.note}</small>
                </span>
                {i < 3 && <ChevronRight size={16} />}
              </button>
            ))}
          </div>
          <div className="design-editor">
            <div className="design-editor-heading">
              <div>
                <span className="design-section-kicker">
                  STEP 0{step + 1} / {module.asset}
                </span>
                <h2 ref={editorHeadingRef} tabIndex={-1}>
                  {step === 0
                    ? "검토의 기준을 확인하세요"
                    : step === 1
                      ? `${module.title} 제원을 설정하세요`
                      : step === 2
                        ? member === "wale"
                          ? "연결된 앵커 하중을 확인하세요"
                          : "외부 해석결과를 채택하세요"
                        : "계산 결과와 근거를 확인하세요"}
                </h2>
                <p>
                  {step === 0
                    ? "계산서에서 옮긴 초기값입니다. 원문 페이지를 확인하고 변경 자료의 출처와 개정을 남기세요."
                    : step === 1
                      ? "부재 제원을 입력하세요. 재료와 계산방법은 선택한 단면을 따릅니다."
                      : step === 2
                        ? member === "wale"
                          ? "앵커에서 계산한 초기긴장력 Jf가 띠장으로 연결됩니다. 하중을 바꾸려면 앵커 입력을 확인하세요."
                          : "같은 모델에서 나온 성분별 최대값을 입력하세요. 지배 시공단계는 서로 다를 수 있습니다."
                        : "계산식과 채택값을 확인한 뒤 네 부재를 함께 저장합니다."}
                </p>
              </div>
              <Badge status={current.status} />
            </div>
            {step === 0 && (
              <>
                <div className="design-evidence-bar">
                  <FileText size={18} />
                  <div>
                    <strong>
                      {preset.label} · {module.title} 원문 입력
                    </strong>
                    <p>
                      계산서 p{preset.pages[member].join("~")} · 개정{" "}
                      {preset.sourceRevision}
                    </p>
                  </div>
                  <a
                    href={`${REAL_DESIGN.source.url}#page=${preset.pages[member][0]}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    원문 확인 ↗
                  </a>
                </div>

                <div className="design-fields">
                  <label className="design-field design-span-2">
                    <span>검토안 이름</span>
                    <input
                      value={state.label}
                      onChange={(e) =>
                        setState((s) => ({ ...s, label: e.target.value }))
                      }
                      maxLength={120}
                      aria-label="검토안 이름"
                    />
                  </label>
                  <label className="design-field">
                    <span>해석 프로그램 / 방법</span>
                    <input
                      id="design-source-program"
                      value={state.source.program}
                      aria-invalid={!state.source.program.trim()}
                      aria-describedby={
                        !state.source.program.trim()
                          ? "design-source-error"
                          : undefined
                      }
                      onChange={(e) => patchSource("program", e.target.value)}
                    />
                  </label>
                  <label className="design-field">
                    <span>해석 모델 개정</span>
                    <input
                      id="design-source-modelRevision"
                      value={state.source.modelRevision}
                      aria-invalid={!state.source.modelRevision.trim()}
                      aria-describedby={
                        !state.source.modelRevision.trim()
                          ? "design-source-error"
                          : undefined
                      }
                      onChange={(e) =>
                        patchSource("modelRevision", e.target.value)
                      }
                      aria-label="해석 모델 개정"
                    />
                  </label>
                  <label className="design-field design-span-2">
                    <span>자료명</span>
                    <input
                      id="design-source-label"
                      value={state.source.label}
                      aria-invalid={!state.source.label.trim()}
                      aria-describedby={
                        !state.source.label.trim()
                          ? "design-source-error"
                          : undefined
                      }
                      onChange={(e) => patchSource("label", e.target.value)}
                    />
                  </label>
                </div>
                {current.errors?._source && (
                  <p
                    className="design-error design-source-error"
                    id="design-source-error"
                    role="alert"
                  >
                    {current.errors._source} 아래 출처·모델 상세도 확인하세요.
                  </p>
                )}
                <details
                  className="design-details"
                  open={Boolean(current.errors?._source) || undefined}
                >
                  <summary>
                    출처·모델 상세
                    <ChevronDown size={16} />
                  </summary>
                  <p className="design-disclosure-note">
                    {preset.verification}
                  </p>
                  <div className="design-fields">
                    <label className="design-field">
                      <span>자료 구분</span>
                      <select
                        value={state.source.origin}
                        onChange={(e) => patchSource("origin", e.target.value)}
                      >
                        <option value="imported_analysis">
                          원문 / 외부 해석결과 채택
                        </option>
                      </select>
                    </label>

                    {(
                      [
                        ["id", "자료 ID"],
                        ["revision", "자료 개정"],
                        ["modelId", "해석 모델 ID"],
                        ["programVersion", "프로그램 / 방법 버전"],
                        ["runDate", "해석 실행일"],
                        ["combination", "하중조합 / 포락방법"],
                        ["enteredBy", "입력자"],
                        ["evidence", "자료 근거 · 파일ID / 페이지 / 표"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        className={`design-field ${key === "evidence" ? "design-span-2" : ""}`}
                        key={key}
                      >
                        <span>{label}</span>
                        <input
                          id={`design-source-${key}`}
                          value={state.source[key]}
                          aria-invalid={
                            key in sourceFields && !state.source[key].trim()
                          }
                          aria-describedby={
                            key in sourceFields && !state.source[key].trim()
                              ? "design-source-error"
                              : undefined
                          }
                          onChange={(e) => patchSource(key, e.target.value)}
                          aria-label={label}
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <div className="design-scope-box">
                  <ShieldCheck size={21} />
                  <div>
                    <strong>이번 검토의 범위</strong>
                    <p>
                      4개 부재를 검토합니다. 외부 탄소성해석과 굴착 전체 안정성
                      판정은 포함하지 않습니다.
                    </p>
                  </div>
                </div>
                <div className="design-adopted">
                  <span>현재 채택 방법</span>
                  <b>{module.scope}</b>
                </div>
                <details className="design-details">
                  <summary>
                    <LockKeyhole size={15} />
                    지원 범위와 고정 조건
                    <ChevronDown size={16} />
                  </summary>
                  <div className="design-fixed-rows">
                    {module.fixedRows.map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
            {step === 1 && (
              <>
                <div className="design-fields">
                  {module.fields
                    .filter((f) => f.group === "geometry")
                    .map(fieldControl)}
                </div>
                <p className="design-field-hint">
                  <span className="design-field-dot" />
                  표시 제원을 변경하면 채택 해석결과의 대응 여부를 다시
                  확인합니다.
                </p>
                <details
                  className="design-details"
                  open={
                    module.fields.some(
                      (f) => f.group === "advanced" && current.errors?.[f.key],
                    ) || undefined
                  }
                >
                  <summary>
                    세부 검토계수
                    {module.fields.some(
                      (f) => f.group === "advanced" && current.errors?.[f.key],
                    ) && (
                      <span className="design-disclosure-error" role="alert">
                        입력 확인 필요
                      </span>
                    )}
                    <ChevronDown size={16} />
                  </summary>
                  <div className="design-fields">
                    {module.fields
                      .filter((f) => f.group === "advanced")
                      .map(fieldControl)}
                  </div>
                </details>
                <details className="design-details">
                  <summary>
                    <LockKeyhole size={15} />
                    재료·단면·방법 상수 <span>읽기 전용</span>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="design-fixed-rows">
                    {module.fixedRows.map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </details>
                {member === "pile" && (
                  <>
                    <label className="design-field design-qu-evidence">
                      <span>직접 채택한 Qu의 근거</span>
                      <input
                        id="design-qu-evidence"
                        value={state.source.quEvidence}
                        aria-label="극한지지력 Qu 근거"
                        aria-invalid={!state.source.quEvidence.trim()}
                        aria-describedby={
                          !state.source.quEvidence.trim()
                            ? "design-qu-evidence-error"
                            : undefined
                        }
                        onChange={(e) =>
                          patchSource("quEvidence", e.target.value)
                        }
                      />
                      {!state.source.quEvidence.trim() && (
                        <small
                          id="design-qu-evidence-error"
                          className="design-error"
                          role="alert"
                        >
                          채택한 극한지지력의 자료명·페이지 등 근거를
                          입력하세요.
                        </small>
                      )}
                    </label>
                    <div className="design-small-note">
                      Qu는 별도로 검토·채택한 극한지지력입니다. 입력한 Qu/Fs를
                      사용하며, N값 경험식을 혼합하지 않습니다.
                    </div>
                    {state.members.pile.values.displacementLimitPercent.trim() &&
                      Number.isFinite(
                        Number(
                          state.members.pile.values.displacementLimitPercent,
                        ),
                      ) &&
                      Number(
                        state.members.pile.values.displacementLimitPercent,
                      ) !== 0.3 && (
                        <p className="design-criterion-note" role="status">
                          허용변위율을 초기 0.3%에서 변경했습니다. 세부
                          검토계수와 자료 근거에 변경 기준을 확인해 남기세요.
                        </p>
                      )}
                  </>
                )}
              </>
            )}
            {step === 2 && (
              <>
                {member === "wale" ? (
                  <div className="design-link-card">
                    <span className="design-link-icon">
                      <Link2 size={24} />
                    </span>
                    <div>
                      <span className="design-section-kicker">
                        앵커 → 띠장 자동 연결
                      </span>
                      <h3>손실을 포함한 초기긴장력 Jf</h3>
                      <p>
                        앵커 입력 개정 {state.members.anchor.revision} ·{" "}
                        {state.source.modelId} r{state.source.modelRevision}
                      </p>
                      <strong>
                        {fmt(calculated.anchor.results?.jackingForceKn, 3)}{" "}
                        <small>kN/개</small>
                      </strong>
                      <details className="design-details design-inline-details">
                        <summary>
                          하중 전달 방법 <ChevronDown size={16} />
                        </summary>
                        <p>
                          설치각 {module.fixed.angleDeg}°로 수평성분을 계산한 뒤
                          c/a로 상단 띠장에 분담합니다. R′와 Treq를 중복
                          적용하지 않습니다.
                        </p>
                      </details>
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          calculated.anchor.ok
                            ? goToStep(2, "anchor")
                            : fixError("anchor")
                        }
                      >
                        앵커 입력 확인
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="design-disclosure-note">
                      원자료의 숫자와 단위를 함께 입력하세요. 단위를 바꿔도 입력
                      숫자는 자동 변환되지 않습니다.
                    </p>
                    {module.fields
                      .filter((f) => f.group === "analysis")
                      .map((f) => {
                        const q = state.members[member].quantities[f.key];
                        const normalized = current.quantities?.[f.key];
                        const error = current.errors?.[f.key];
                        const missingMetadata =
                          !q.stage.trim() ||
                          !q.location.trim() ||
                          !q.evidence?.trim();
                        const metadataOnlyError =
                          error ===
                          "지배단계·위치·채택값 근거를 함께 입력하세요.";
                        return (
                          <div className="design-analysis-card" key={f.key}>
                            <div className="design-analysis-title">
                              <strong>{f.label}</strong>
                              <span>
                                {q.origin === "imported_analysis"
                                  ? "원문 채택값"
                                  : "사용자 수동 입력"}
                              </span>
                            </div>
                            <div className="design-analysis-value">
                              <input
                                id={inputId(member, f.key)}
                                aria-label={`${module.title} ${f.label}`}
                                inputMode="decimal"
                                value={state.members[member].values[f.key]}
                                onChange={(e) => change(f.key, e.target.value)}
                                aria-invalid={
                                  Boolean(error) && !metadataOnlyError
                                }
                                aria-describedby={`${inputId(member, f.key)}-direction${error ? ` ${inputId(member, f.key)}-error` : ""}`}
                                autoComplete="off"
                              />
                              <select
                                aria-label={`${f.label} 단위`}
                                value={q.unit}
                                onChange={(e) =>
                                  setState((s) =>
                                    updateQuantity(s, member, f.key, {
                                      unit: e.target.value,
                                    }),
                                  )
                                }
                              >
                                {f.units?.map((unit) => (
                                  <option key={unit}>{unit}</option>
                                ))}
                              </select>
                            </div>
                            {error && (
                              <p
                                className="design-error"
                                id={`${inputId(member, f.key)}-error`}
                                role="alert"
                              >
                                {error}
                              </p>
                            )}
                            <p
                              className="design-direction"
                              id={`${inputId(member, f.key)}-direction`}
                            >
                              {f.direction}
                            </p>
                            {q.origin === "manual_record" && (
                              <p className="design-source-hint">
                                수동 입력값입니다. 아래 지배단계·위치·근거를
                                이번에 채택한 해석결과에 맞게 확인하세요.
                              </p>
                            )}
                            <details
                              className="design-details design-analysis-evidence"
                              open={missingMetadata || undefined}
                            >
                              <summary>
                                채택 근거 · 단계·위치{" "}
                                {missingMetadata && (
                                  <span className="design-disclosure-error">
                                    입력 필요
                                  </span>
                                )}
                                <ChevronDown size={16} />
                              </summary>
                              <div className="design-fields">
                                <label className="design-field">
                                  <span>지배 시공단계 / 하중 출처</span>
                                  <input
                                    id={`${inputId(member, f.key)}-stage`}
                                    value={q.stage}
                                    aria-label={`${f.label} 지배단계`}
                                    aria-invalid={!q.stage.trim()}
                                    aria-describedby={
                                      metadataOnlyError
                                        ? `${inputId(member, f.key)}-error`
                                        : undefined
                                    }
                                    onChange={(e) =>
                                      setState((s) =>
                                        updateQuantity(s, member, f.key, {
                                          stage: e.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                                <label className="design-field">
                                  <span>부재 / 구간 / 발생 위치</span>
                                  <input
                                    id={`${inputId(member, f.key)}-location`}
                                    value={q.location}
                                    aria-label={`${f.label} 발생 위치`}
                                    aria-invalid={!q.location.trim()}
                                    aria-describedby={
                                      metadataOnlyError
                                        ? `${inputId(member, f.key)}-error`
                                        : undefined
                                    }
                                    onChange={(e) =>
                                      setState((s) =>
                                        updateQuantity(s, member, f.key, {
                                          location: e.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                                <label className="design-field design-span-2">
                                  <span>채택값 근거 · 표 / 행 / 페이지</span>
                                  <input
                                    id={`${inputId(member, f.key)}-evidence`}
                                    value={q.evidence || ""}
                                    aria-label={`${f.label} 근거`}
                                    aria-invalid={!q.evidence?.trim()}
                                    aria-describedby={
                                      metadataOnlyError
                                        ? `${inputId(member, f.key)}-error`
                                        : undefined
                                    }
                                    onChange={(e) =>
                                      setState((s) =>
                                        updateQuantity(s, member, f.key, {
                                          evidence: e.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                              </div>
                            </details>
                            {normalized && (
                              <div className="design-conversion">
                                <span>
                                  {fmt(normalized.rawValue, 4)}{" "}
                                  {normalized.rawUnit}
                                </span>
                                <ArrowRight size={14} />
                                <strong>
                                  {fmt(normalized.value, 4)} {normalized.unit}
                                </strong>
                                <small>{normalized.conversion}</small>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </>
                )}
                {current.status === "stale" && !section.issue && (
                  <div className="design-reconfirm">
                    <TriangleAlert size={21} />
                    <div>
                      <strong>
                        {member === "wale" &&
                        calculated.anchor.status === "stale"
                          ? "연결된 앵커의 해석결과를 먼저 확인하세요."
                          : "변경한 제원과 해석결과가 대응하나요?"}
                      </strong>
                      <p>
                        {member === "wale" &&
                        calculated.anchor.status === "stale"
                          ? "띠장은 앵커의 초기긴장력 Jf를 사용합니다. 앵커에서 변경 모델과 해석값의 대응을 확인한 뒤 띠장을 검토하세요."
                          : "해석 모델 개정 또는 해석에 영향을 주는 제원이 바뀌었습니다. 필요한 외부 해석을 완료한 뒤 현재 최대값을 다시 채택하세요."}
                      </p>
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          member === "wale" &&
                          calculated.anchor.status === "stale"
                            ? goToStep(2, "anchor")
                            : setState((s) => confirmGeometry(s, member))
                        }
                      >
                        {member === "wale" &&
                        calculated.anchor.status === "stale"
                          ? "앵커 해석값 재확인"
                          : "이 모델의 해석결과로 확인"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <div className="design-result-metrics">
                  {resultMetric[member].map((m) => (
                    <div key={m.key}>
                      <span>{m.label}</span>
                      <strong>
                        {fmt(current.results?.[m.key], 3)}{" "}
                        <small>{m.unit}</small>
                      </strong>
                    </div>
                  ))}
                </div>
                {!current.ok ? (
                  <div
                    className="notice notice-error design-result-errors"
                    role="alert"
                  >
                    <b>입력을 확인하세요.</b>
                    <ul>
                      {Object.entries(current.errors || {}).map(
                        ([key, value]) => (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => fixError(member, key)}
                            >
                              {errorLabel(member, key)} <ArrowRight size={13} />
                            </button>
                            <span>{value}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : (
                  <>
                    <div className="design-check-list">
                      {current.checks.map((c) => (
                        <div className="design-check" key={c.key}>
                          <div>
                            <span
                              className={`design-check-icon ${c.pass ? "is-pass" : "is-fail"}`}
                            >
                              {c.pass ? <Check size={15} /> : <X size={15} />}
                            </span>
                            <strong>{c.label}</strong>
                            <span
                              className={
                                c.pass
                                  ? "design-check-pass"
                                  : "design-check-fail"
                              }
                            >
                              {c.pass ? "만족" : "초과"}
                            </span>
                          </div>
                          <div className="design-check-values">
                            <span>
                              {fmt(c.value, 3)} <small>{c.unit}</small>
                            </span>
                            <span>{c.relation === ">=" ? "≥" : "≤"}</span>
                            <span>
                              {fmt(c.limit, 3)} <small>{c.unit}</small>
                            </span>
                            <b>
                              {c.utilization === null
                                ? "범위 초과"
                                : `${fmt(c.utilization * 100, 1)}%`}
                            </b>
                          </div>
                          <div className="design-util-track">
                            <i
                              className={c.pass ? "" : "is-exceeded"}
                              style={{
                                width: `${Math.min((c.utilization ?? 1.5) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="design-small-note">
                      사용률 100% 이하는 해당 검토 항목을 만족합니다.
                    </p>
                    <details className="design-details design-original-comparison">
                      <summary>
                        <FileText size={16} />
                        원문 표시값과 현재 계산 비교
                        <ChevronDown size={16} />
                      </summary>
                      <p>
                        {member === "wale"
                          ? "원문은 표시된 Jf를 사용하고, 현재 검토는 앵커 재계산 Jf를 반올림 없이 연결합니다."
                          : member === "pile"
                            ? "Qu는 원문 표시값 2,118.24 kN을 직접 사용합니다."
                            : "원문 표시 정밀도를 보존하며 중간값을 임의로 보정하지 않습니다."}{" "}
                        입력을 바꾸면 차이는 설계 변경과 반올림을 함께
                        포함합니다.
                      </p>
                      <div className="design-comparison-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>결과</th>
                              <th>원문 표시값</th>
                              <th>현재 계산</th>
                              <th>차이</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sourceComparison(state, member)
                              .filter((row) =>
                                [
                                  "designForceKn",
                                  "jackingForceKn",
                                  "requiredFreeLengthM",
                                  "frictionLengthM",
                                  "bondLengthM",
                                  "elongationMm",
                                  "supportReactionKn",
                                  "lineLoadKnm",
                                  "momentKnm",
                                  "shearKn",
                                  "interaction",
                                  "displacementLimitMm",
                                  "allowableBearingKn",
                                  "spanMm",
                                  "stressMpa",
                                  "averageShearMpa",
                                  "requiredThicknessMm",
                                ].includes(row.key),
                              )
                              .map((row) => (
                                <tr key={row.key}>
                                  <td>
                                    {current.steps.find(
                                      (s) => s.key === row.key,
                                    )?.title ||
                                      resultMetric[member].find(
                                        (s) => s.key === row.key,
                                      )?.label ||
                                      RESULT_LABELS[row.key] ||
                                      row.key}
                                  </td>
                                  <td>
                                    {fmt(row.printed, 4)} {row.unit}
                                  </td>
                                  <td>{fmt(row.current, 4)}</td>
                                  <td>{fmt(row.difference, 5)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <a
                        href={`${REAL_DESIGN.source.url}#page=${preset.pages[member][0]}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        원문 계산 p{preset.pages[member].join("~")} 확인 ↗
                      </a>
                    </details>
                    <details className="design-details">
                      <summary>
                        <FileText size={16} />
                        계산 과정 {current.steps.length}개{" "}
                        <ChevronDown size={16} />
                      </summary>
                      <p className="design-disclosure-note">
                        사용률은 요구값/채택값이며, 하한 검토는 하한/채택값으로
                        표시합니다.
                      </p>
                      <div className="design-calculation-steps">
                        {current.steps.map((s, i) => (
                          <div key={s.key}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <section>
                              <h4>{s.title}</h4>
                              <code>{s.formula}</code>
                              <p>
                                {s.substitution.replace(
                                  /\d+\.\d{5,}/g,
                                  (value) => fmt(Number(value), 4),
                                )}
                              </p>
                              <strong>
                                {fmt(s.value, 4)} {s.unit}
                              </strong>
                            </section>
                          </div>
                        ))}
                      </div>
                    </details>
                  </>
                )}
                {current.status === "stale" && !section.issue && (
                  <div className="design-reconfirm">
                    <TriangleAlert size={20} />
                    <div>
                      <b>현재 계산은 제원 변경에 따른 잠정 결과입니다.</b>
                      <p>
                        해석값 채택 단계에서 변경 모델과 입력값의 대응을
                        확인하세요.
                      </p>
                      <button
                        className="btn btn-secondary"
                        onClick={() => goToStep(2)}
                      >
                        해석값 재확인
                      </button>
                    </div>
                  </div>
                )}
                <details className="design-details design-limits">
                  <summary>
                    검토 적용 범위 <ChevronDown size={16} />
                  </summary>
                  <ul>
                    {module.limitations.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
          <div className="design-editor-footer">
            <button
              className="btn btn-ghost"
              disabled={step === 0}
              onClick={() => goToStep(step - 1)}
            >
              <ArrowLeft size={15} />
              이전 단계
            </button>
            <span>0{step + 1} / 04</span>
            {step < 3 ? (
              <button
                className="btn btn-primary"
                onClick={() => goToStep(step + 1)}
              >
                {steps[step + 1].name}
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={invalid || busy}
                aria-describedby="design-save-guidance"
                onClick={() => save()}
              >
                <Save size={15} />
                {busy ? "저장 중…" : loadedId ? "새 개정 저장" : "검토안 저장"}
              </button>
            )}
          </div>
        </section>
        <aside className="design-aside">
          <section className="panel design-member-preview">
            <div className="design-preview-heading">
              <span>{module.asset}</span>
              <Badge status={current.status} />
            </div>
            <h3>{module.title}</h3>
            <p>{module.material}</p>
            <MemberDiagram id={member} state={state} />
            <p className="design-diagram-caption">개념도 · 치수 비례 아님</p>
            <div className="design-side-metrics">
              {resultMetric[member].slice(0, 2).map((m) => (
                <div key={m.key}>
                  <span>{m.label}</span>
                  <strong>
                    {fmt(current.results?.[m.key], 2)} <small>{m.unit}</small>
                  </strong>
                </div>
              ))}
            </div>
          </section>
          <section className="panel design-summary">
            <div className="design-summary-title">
              <CheckCheck size={18} />
              <h3>전체 부재 검토</h3>
            </div>
            <div className="design-summary-score">
              <strong>
                {invalid ? invalidMembers.length : passed}
                <small>{invalid ? "개 부재" : ` / ${allChecks}`}</small>
              </strong>
              <span>{invalid ? "입력 확인 필요" : "채택 기준 만족 항목"}</span>
            </div>
            {MEMBER_IDS.map((id) => (
              <button key={id} onClick={() => goToStep(3, id)}>
                <span>{MODULES[id].title}</span>
                <Badge status={calculated[id].status} />
                <ChevronRight size={14} />
              </button>
            ))}
            <p>
              {invalid
                ? "필수 입력을 완료하면 기록할 수 있습니다."
                : stale
                  ? "입력 조건 또는 원문 불일치에 대한 해석 재확인이 필요합니다."
                  : exceeded
                    ? "기준 초과 항목을 확인하고 검토 이력을 남기세요."
                    : "네 부재의 입력과 계산 근거를 함께 저장할 수 있습니다."}
            </p>
          </section>
          <section className="design-link-note">
            <Link2 size={17} />
            <div>
              <b>하중의 연결을 보존합니다</b>
              <p>
                앵커 R′ → Treq → Jf → 띠장
                <br />
                앵커를 바꾸면 띠장을 즉시 다시 계산합니다.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <section className="panel design-deliverables">
        <div>
          <h3>보고서와 입력 파일</h3>
          <p>검토 결과를 보고서로 받거나 입력 파일을 보관하세요.</p>
        </div>
        <div className="design-deliverable-actions">
          <button
            className="btn btn-secondary"
            onClick={() => uploadRef.current?.click()}
          >
            <Upload size={16} />
            JSON 가져오기
          </button>
          <button
            className="btn btn-secondary"
            onClick={() =>
              download(
                `${fileName}.json`,
                exportDesign(state),
                "application/json",
              )
            }
          >
            <ArrowDownToLine size={16} />
            입력 내보내기
          </button>
          <button
            className="btn btn-secondary"
            disabled={invalid}
            onClick={() => setReportOpen(true)}
          >
            <FileText size={16} />
            보고서 미리보기
          </button>
        </div>
        <input
          ref={uploadRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={importFile}
        />
      </section>
      <details className="panel design-reset-options">
        <summary>
          <RotateCcw size={16} /> 초기값 복원 <ChevronDown size={16} />
        </summary>
        <div className="design-deliverables">
          <div>
            <h3>원문 초기값으로 돌아가기</h3>
            <p>
              선택한 {preset.label}의 현재 입력만 복원합니다. 저장한 검토 기록은
              그대로 남습니다.
            </p>
          </div>
          {resetPending ? (
            <div className="design-deliverable-actions">
              <span>현재 입력을 원문 값으로 바꿉니다.</span>
              <button
                className="btn btn-secondary"
                onClick={() => setResetPending(false)}
              >
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setState(createRealWorkspace(preset.id));
                  setLoadedId(null);
                  setResetPending(false);
                  setStep(0);
                  notify(
                    "선택한 단면·단의 원문 초기값을 복원했습니다.",
                    "success",
                  );
                }}
              >
                원문 값 복원
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={() => setResetPending(true)}
            >
              <RotateCcw size={15} />
              초기값 복원
            </button>
          )}
        </div>
      </details>
      {showSaved && (
        <section className="panel design-saved" id="design-saved-records">
          <div className="design-saved-heading">
            <div>
              <h3 ref={savedHeadingRef} tabIndex={-1}>
                저장한 검토안
              </h3>
              <p>
                불러오면 해당 위치의 입력을 저장한 값으로 바꾸고 다시
                계산합니다. 변경 내용을 남기려면 먼저 검토안을 저장하세요.
              </p>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setShowSaved(false);
                savedToggleRef.current?.focus();
              }}
              aria-label="저장한 검토안 접기"
            >
              <X size={18} />
            </button>
          </div>
          {saved.length ? (
            <>
              <div className="design-record-list">
                {saved.map((r) => (
                  <div
                    key={r.id}
                    className={loadedId === r.id ? "is-loaded" : ""}
                  >
                    <span className="design-record-icon">
                      <FileText size={19} />
                    </span>
                    <div>
                      <strong>{r.title}</strong>
                      <p>
                        r{r.revision} ·{" "}
                        {new Date(r.updated_at).toLocaleString("ko-KR")} ·{" "}
                        {r.summary}
                      </p>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => load(r)}
                      aria-label={`${r.title} 개정 ${r.revision} 불러오기`}
                    >
                      불러오기
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setCompareId(r.id)}
                      aria-label={`${r.title} 개정 ${r.revision}과 현재 입력 비교`}
                    >
                      <GitCompareArrows size={15} />
                      비교
                    </button>
                  </div>
                ))}
              </div>
              {loadedId && (
                <div className="design-save-new">
                  <p>현재 기록을 바탕으로 별도 대안을 만들 수 있습니다.</p>
                  <button
                    className="btn btn-secondary"
                    disabled={invalid || busy}
                    onClick={() => save(true)}
                  >
                    새 검토안으로 저장
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="design-empty">
              <FolderOpen size={26} />
              <p>아직 저장한 검토안이 없습니다.</p>
            </div>
          )}
          {comparison && (
            <div className="design-comparison">
              <h4>{comparisonRecord?.title} → 현재 입력 비교</h4>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>부재</th>
                      <th>저장안 최대 사용률</th>
                      <th>현재 최대 사용률</th>
                      <th>변경한 입력</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>
                          {row.before === null
                            ? "—"
                            : `${fmt(row.before * 100, 1)}%`}
                          <small>{statusText[row.beforeStatus]}</small>
                        </td>
                        <td>
                          {row.after === null
                            ? "—"
                            : `${fmt(row.after * 100, 1)}%`}
                          <small>{statusText[row.afterStatus]}</small>
                        </td>
                        <td>
                          {row.changed.join(", ") || "직접 입력 변경 없음"}
                          {row.id === "wale" &&
                          row.before !== row.after &&
                          row.changed.length === 0
                            ? " · 앵커 연결하중 변경"
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
      {reportOpen && (
        <div
          className="design-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReportOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="설계 검토 보고서 미리보기"
        >
          <div className="design-modal" ref={reportRef}>
            <div className="design-modal-header">
              <div>
                <span className="design-section-kicker">
                  AUTOGEO / DESIGN REVIEW
                </span>
                <h2>{state.label}</h2>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setReportOpen(false)}
                aria-label="보고서 닫기"
              >
                <X size={22} />
              </button>
            </div>
            <div className="design-modal-body">
              <div className="design-report-meta">
                <Badge status={overall} />
                <span>
                  {state.source.origin === "synthetic"
                    ? "합성 시연 데이터"
                    : "사용자 채택 해석 데이터"}
                </span>
                <span>
                  {state.source.modelId} r{state.source.modelRevision}
                </span>
              </div>
              <p className="design-report-summary">
                4개 부재 · {allChecks}개 검토 항목 · 입력과 근거를 보존한 계산
                보고서
              </p>
              {MEMBER_IDS.map((id) => (
                <section key={id}>
                  <h3>
                    {MODULES[id].title}
                    <Badge status={calculated[id].status} />
                  </h3>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>항목</th>
                        <th>계산값</th>
                        <th>허용/채택값</th>
                        <th>판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculated[id].checks?.map((c) => (
                        <tr key={c.key}>
                          <td>{c.label}</td>
                          <td>
                            {fmt(c.value, 3)} {c.unit}
                          </td>
                          <td>
                            {c.relation} {fmt(c.limit, 3)} {c.unit}
                          </td>
                          <td>{c.pass ? "만족" : "초과"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              <p className="design-small-note">
                내려받는 보고서에는 입력 항목, 고정 조건, 단위 환산, 전체
                계산식, 해석 출처·개정과 적용 한계가 포함됩니다. HTML 파일을
                브라우저에서 열어 인쇄 또는 PDF로 저장할 수 있습니다.
              </p>
            </div>
            <div className="design-modal-footer">
              <span>{VERSION}</span>
              <button className="btn btn-primary" onClick={exportReport}>
                <ArrowDownToLine size={16} />
                전체 보고서 내려받기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
