import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
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
import {
  MEMBER_IDS,
  MODULES,
  VERSION,
  comparisonRows,
  computeWorkspace,
  confirmGeometry,
  createWorkspace,
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
  { name: "제원 설정", note: "허용된 항목만 편집" },
  { name: "해석값 채택", note: "수동 최대값·단위" },
  { name: "검토와 저장", note: "결과·근거·비교" },
];
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
            EA-01
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
            Jf · 30°
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
            H = 10.0 m
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

export default function DesignPage({ records, onSave, notify }: FeatureProps) {
  const [state, setState, { ready, error: storageError, retry }] =
    useDraft<Workspace>("design-form-v2", createWorkspace);
  const [member, setMember] = useState<MemberId>("anchor");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
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
  const module = MODULES[member];
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
      setState(restoreWorkspace(record.payload.workspace));
      setLoadedId(record.id);
      setStep(3);
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
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000)
        throw new Error("설계 JSON은 1 MB 이하만 가져올 수 있습니다.");
      setState(importDesign(await file.text()));
      setLoadedId(null);
      setStep(0);
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
        makeReport(state),
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
            aria-label={`${module.title} ${f.label}`}
            inputMode="decimal"
            type="text"
            value={state.members[member].values[f.key]}
            onChange={(e) => change(f.key, e.target.value)}
            aria-invalid={Boolean(error)}
            autoComplete="off"
          />
          <span>{f.unit}</span>
        </div>
        {error && <small role="alert">{error}</small>}
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
            설계 검토 <ChevronRight size={13} /> A-01 굴착 구역
          </div>
          <h1>흙막이 부재 검토</h1>
          <p>
            외부 해석결과를 채택하고, 부재별 검토 근거를 하나의 기록으로
            연결합니다.
          </p>
        </div>
        <div className="design-top-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowSaved((v) => !v)}
          >
            <FolderOpen size={16} />
            저장한 검토안 <span className="design-count">{saved.length}</span>
          </button>
          <button
            className="btn btn-primary"
            disabled={invalid || busy}
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
            ? "합성 A현장 · 시연 데이터"
            : "사용자 채택 해석값"}
        </span>
        <span>H-Pile + 토류판 + 어스앵커</span>
        <span className="design-strip-divider" />
        <span>
          굴착깊이 <b>10.0 m</b>
        </span>
        <span className="design-strip-divider" />
        <span>
          모델 <b>{state.source.modelId}</b> · r{state.source.modelRevision}
        </span>
        <span className="design-strip-end">
          <ShieldCheck size={14} /> 수동 해석값 기반 부재 검토
        </span>
      </div>
      <div className="design-member-tabs" role="tablist" aria-label="검토 부재">
        {MEMBER_IDS.map((id, i) => {
          const Icon = iconMap[id];
          return (
            <button
              role="tab"
              aria-selected={member === id}
              key={id}
              className={member === id ? "is-active" : ""}
              onClick={() => setMember(id)}
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
      <div className="design-workspace">
        <section className="design-main panel">
          <div className="design-stepper" aria-label="검토 단계">
            {steps.map((s, i) => (
              <button
                className={`${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}
                key={s.name}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="design-step-number">
                  {i < step ? <Check size={14} /> : i + 1}
                </span>
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
                <h2>
                  {step === 0
                    ? "검토의 기준을 확인하세요"
                    : step === 1
                      ? `${module.title} 제원을 설정하세요`
                      : step === 2
                        ? "외부 해석결과를 채택하세요"
                        : "계산 결과와 근거를 확인하세요"}
                </h2>
                <p>
                  {step === 0
                    ? "현재 시연은 합성 입력을 사용합니다. 실제 입력을 가져오면 출처와 개정을 함께 남기세요."
                    : step === 1
                      ? "GEOX 입력 화면에서 허용된 제원만 수정합니다. 재료·방법 상수는 읽기 전용입니다."
                      : step === 2
                        ? "같은 모델에서 나온 성분별 최대값을 입력하세요. 지배 시공단계는 서로 다를 수 있습니다."
                        : "계산식과 채택값을 확인한 뒤 네 부재를 함께 저장합니다."}
                </p>
              </div>
              <Badge status={current.status} />
            </div>
            {step === 0 && (
              <>
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
                    <span>자료 구분</span>
                    <select
                      value={state.source.origin}
                      onChange={(e) => patchSource("origin", e.target.value)}
                    >
                      <option value="synthetic">합성 데이터 · 시연</option>
                      <option value="imported_analysis">
                        사용자 채택 외부 해석결과
                      </option>
                    </select>
                  </label>
                  <label className="design-field">
                    <span>해석 프로그램 / 방법</span>
                    <input
                      value={state.source.program}
                      onChange={(e) => patchSource("program", e.target.value)}
                    />
                  </label>
                  <label className="design-field design-span-2">
                    <span>자료명</span>
                    <input
                      value={state.source.label}
                      onChange={(e) => patchSource("label", e.target.value)}
                    />
                  </label>
                  {(
                    [
                      ["id", "자료 ID"],
                      ["revision", "자료 개정"],
                      ["modelId", "해석 모델 ID"],
                      ["modelRevision", "해석 모델 개정"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="design-field" key={key}>
                      <span>{label}</span>
                      <input
                        value={state.source[key]}
                        onChange={(e) => patchSource(key, e.target.value)}
                        aria-label={label}
                      />
                    </label>
                  ))}
                </div>
                <details className="design-details">
                  <summary>
                    해석 출처 상세
                    <ChevronDown size={16} />
                  </summary>
                  <div className="design-fields">
                    {(
                      [
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
                          value={state.source[key]}
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
                      앵커 · 띠장 · H-Pile · 토류판의 채택 방법을 검토합니다.
                      외부 탄소성해석을 실행하거나 굴착 전체 안정성을 판정하지
                      않습니다.
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
                <details className="design-details">
                  <summary>
                    세부 검토계수
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
                {member === "wale" && (
                  <div className="design-method-options">
                    <span>지원 방법</span>
                    <button className="is-selected" disabled>
                      연속보 · 등분포하중
                    </button>
                    <button disabled>단순보 · 준비 중</button>
                    <button disabled>집중하중 · 준비 중</button>
                  </div>
                )}
                {member === "pile" && (
                  <>
                    <label className="design-field design-qu-evidence">
                      <span>직접 채택한 Qu의 근거</span>
                      <input
                        value={state.source.quEvidence}
                        aria-label="극한지지력 Qu 근거"
                        onChange={(e) =>
                          patchSource("quEvidence", e.target.value)
                        }
                      />
                    </label>
                    <div className="design-small-note">
                      Qu는 별도로 검토·채택한 극한지지력입니다. 입력한 Qu/Fs를
                      사용하며, N값 경험식을 혼합하지 않습니다.
                    </div>
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
                      <p>
                        설치각 30°로 수평성분을 계산한 뒤 c/a로 상단 띠장에
                        분담합니다. R′와 Treq를 중복 적용하지 않습니다.
                      </p>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setMember("anchor");
                          setStep(2);
                        }}
                      >
                        앵커 입력 확인
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  module.fields
                    .filter((f) => f.group === "analysis")
                    .map((f) => {
                      const q = state.members[member].quantities[f.key];
                      const normalized = current.quantities?.[f.key];
                      return (
                        <div className="design-analysis-card" key={f.key}>
                          <div className="design-analysis-title">
                            <strong>{f.label}</strong>
                            <span>수동 입력</span>
                          </div>
                          <div className="design-analysis-value">
                            <input
                              aria-label={`${module.title} ${f.label}`}
                              inputMode="decimal"
                              value={state.members[member].values[f.key]}
                              onChange={(e) => change(f.key, e.target.value)}
                              aria-invalid={Boolean(current.errors?.[f.key])}
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
                          {current.errors?.[f.key] && (
                            <p className="design-error" role="alert">
                              {current.errors[f.key]}
                            </p>
                          )}
                          <p className="design-direction">{f.direction}</p>
                          <div className="design-fields">
                            <label className="design-field">
                              <span>지배 시공단계 / 하중 출처</span>
                              <input
                                value={q.stage}
                                aria-label={`${f.label} 지배단계`}
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
                                value={q.location}
                                aria-label={`${f.label} 발생 위치`}
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
                                value={q.evidence || ""}
                                aria-label={`${f.label} 근거`}
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
                    })
                )}
                {current.status === "stale" && (
                  <div className="design-reconfirm">
                    <TriangleAlert size={21} />
                    <div>
                      <strong>변경한 제원과 해석결과가 대응하나요?</strong>
                      <p>
                        해석 모델 개정 또는 해석에 영향을 주는 제원이
                        바뀌었습니다. 필요한 외부 해석을 완료한 뒤 현재 최대값을
                        다시 채택하세요.
                      </p>
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          setState((s) => confirmGeometry(s, member))
                        }
                      >
                        이 모델의 해석결과로 확인
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
                  <div className="notice notice-error">
                    <b>입력을 확인하세요.</b>
                    <ul>
                      {Object.entries(current.errors || {}).map(
                        ([key, value]) => (
                          <li key={key}>
                            {module.fields.find((f) => f.key === key)?.label ||
                              key}
                            : {value}
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
                      사용률은 요구값/채택값으로 정규화합니다. 하한 검토는
                      하한/채택값으로 표시하며, 100% 이하는 해당 항목을
                      만족합니다.
                    </p>
                    <details className="design-details">
                      <summary>
                        <FileText size={16} />
                        계산 과정 {current.steps.length}개{" "}
                        <ChevronDown size={16} />
                      </summary>
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
                {current.status === "stale" && (
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
                        onClick={() => setStep(2)}
                      >
                        해석값 재확인
                      </button>
                    </div>
                  </div>
                )}
                <div className="design-limits">
                  <h4>이 결과를 읽는 방법</h4>
                  <ul>
                    {module.limitations.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
          <div className="design-editor-footer">
            <button
              className="btn btn-ghost"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={15} />
              이전 단계
            </button>
            <span>0{step + 1} / 04</span>
            {step < 3 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
              >
                {steps[step + 1].name}
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={invalid || busy}
                onClick={() => save()}
              >
                <Save size={15} />
                {loadedId ? "현재 개정 저장" : "검토안 저장"}
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
                {passed}
                <small> / {allChecks}</small>
              </strong>
              <span>채택 기준 만족 항목</span>
            </div>
            {MEMBER_IDS.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setMember(id);
                  setStep(3);
                }}
              >
                <span>{MODULES[id].title}</span>
                <Badge status={calculated[id].status} />
                <ChevronRight size={14} />
              </button>
            ))}
            <p>
              {invalid
                ? "필수 입력을 완료하면 기록할 수 있습니다."
                : stale
                  ? "제원 변경 부재의 해석결과 재확인이 필요합니다."
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
          <span className="design-section-kicker">REVIEW RECORD</span>
          <h3>입력부터 검토 근거까지, 한 번에</h3>
          <p>값·단위·지배단계·모델 개정과 연결 관계를 기록합니다.</p>
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
      {showSaved && (
        <section className="panel design-saved">
          <div className="design-saved-heading">
            <div>
              <h3>저장한 검토안</h3>
              <p>기록을 불러오면 저장 입력으로 다시 계산합니다.</p>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setShowSaved(false)}
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
                    >
                      불러오기
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setCompareId(r.id)}
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
