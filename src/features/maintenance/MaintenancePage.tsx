import { siteDate } from "../../utils/site-date.mjs";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Radar,
  Plus,
  Save,
  Upload,
  ArrowRight,
  Archive,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import type { FeatureProps, ProjectRecord } from "../../contracts";
import { useDraft } from "../../storage/useDraft";
import {
  saveAttachment,
  getAttachmentUrl,
  type AttachmentMeta,
} from "../../storage/attachments";
import RealSiteMap from "../ground/RealSiteMap";
import { useRequestedRecord } from "../field/useRequestedRecord";
import {
  EMPTY_GPR,
  REAL_STAGES,
  REAL_STAGE_LABELS,
  validateRealGpr,
  advanceRealGpr,
  isDate,
} from "./real-model.mjs";
import "../field/real-field.css";
import "./maintenance.css";
type Event = { stage: string; date: string; author: string; note: string };
type Model = Omit<typeof EMPTY_GPR, "attachments" | "history"> & {
  attachments: AttachmentMeta[];
  history: Event[];
};
type Draft = {
  recordId: string | null;
  model: Model;
  event: { date: string; author: string; note: string };
  editing: boolean;
};
const PdfDocument = lazy(() => import("../../components/PdfDocument"));
const initial: Draft = {
  recordId: null,
  model: structuredClone(EMPTY_GPR),
  event: { date: siteDate(), author: "", note: "" },
  editing: false,
};
export default function MaintenancePage(props: FeatureProps) {
  const [draft, setDraft, state] = useDraft<Draft>(
    "real-maintenance-v1",
    initial,
  );
  useRequestedRecord(
    props.requestedRecordId,
    props.records,
    state.ready,
    (r) => {
      if (r.payload.kind !== "real_gpr") return;
      setDraft((d) => ({
        ...d,
        recordId: r.id,
        model: structuredClone(r.payload.model as Model),
        editing: false,
        event: { ...d.event, note: "" },
      }));
    },
  );
  const [saving, setSaving] = useState(false),
    [errors, setErrors] = useState<string[]>([]),
    [showArchived, setShowArchived] = useState(false),
    [viewer, setViewer] = useState<{
      url: string;
      name: string;
      mime: string;
    } | null>(null),
    [viewerText, setViewerText] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!viewer) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setViewer(null);
      }
      if (event.key === "Tab") {
        const list = focusable();
        const first = list[0],
          last = list.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = previousOverflow;
      priorFocus.current?.focus();
    };
  }, [viewer]);
  const groundRecord = [...props.records]
    .filter((r) => r.payload.kind === "real-ground-model")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const groundTransform = groundRecord?.payload.registration as
    | { east: number; north: number; rotation: number; scale: number }
    | undefined;
  const model = draft.model;
  const records = props.records.filter(
    (r) =>
      r.payload.kind === "real_gpr" &&
      (showArchived || !(r.payload.model as Model)?.archived),
  );
  const selected = props.records.find((r) => r.id === draft.recordId);
  const stageLabels = REAL_STAGE_LABELS as Record<string, string>;
  const attachments = model.attachments;
  useEffect(() => {
    let active = true;
    setViewerText("");
    if (
      viewer &&
      !viewer.mime.startsWith("image/") &&
      viewer.mime !== "application/pdf"
    )
      fetch(viewer.url)
        .then((r) => r.text())
        .then((t) => {
          if (active) setViewerText(t);
        })
        .catch(() => {
          if (active)
            setViewerText("미리보기 실패. 원본 다운로드를 이용해 주세요.");
        });
    return () => {
      active = false;
      if (viewer) URL.revokeObjectURL(viewer.url);
    };
  }, [viewer]);
  const update = (key: string, value: string) =>
    setDraft((d) => ({ ...d, model: { ...d.model, [key]: value } }));
  const annotations = records
    .map((r) => ({
      id: r.id,
      easting: Number((r.payload.model as Model).easting),
      northing: Number((r.payload.model as Model).northing),
      label: (r.payload.model as Model).line,
    }))
    .filter((p) => p.easting && p.northing);
  function load(r: ProjectRecord) {
    setDraft((d) => ({
      ...d,
      recordId: r.id,
      model: structuredClone(r.payload.model as Model),
      editing: false,
      event: { ...d.event, note: "" },
    }));
    setErrors([]);
  }
  async function persist(next: Model) {
    const errs = validateRealGpr(next);
    if (errs.length) {
      setErrors(errs);
      throw new Error(errs[0]);
    }
    const saved = await props.onSave({
      id: draft.recordId || undefined,
      stage: "maintenance",
      asset_id: next.asset,
      source_id: next.attachments[0]?.id || "user-gpr",
      origin: "imported_analysis",
      status: next.archived
        ? "draft"
        : next.closed
          ? "closed"
          : ["survey", "confirmation"].includes(next.lifecycle)
            ? "pending"
            : "action",
      title: next.title,
      summary: `${next.line} · ${stageLabels[next.lifecycle]} · ${next.findings}`,
      payload: {
        kind: "real_gpr",
        registration: groundTransform || null,
        registrationSource: groundRecord
          ? { id: groundRecord.id, revision: groundRecord.revision }
          : null,
        model: next,
        attachment_ids: next.attachments.map((a) => a.id),
        sourceStatus: "user_provided_interpretation",
        coordinate: next.easting
          ? {
              easting: Number(next.easting),
              northing: Number(next.northing),
              crs: "EPSG:5186",
            }
          : null,
      },
      assumptions: [
        "제공 현장자료에 GPR 결과는 없으며 이 기록은 사용자가 첨부·등록한 해석 결과입니다.",
        "반사 이상만으로 손상·공동을 확정하지 않습니다. 현장 확인과 재점검 결과를 구분합니다.",
        ...(next.easting
          ? []
          : ["좌표 미등록: 위치 설명과 첨부 원문을 확인합니다."]),
      ],
    });
    setDraft((d) => ({
      ...d,
      recordId: saved.id,
      model: next,
      editing: false,
    }));
    setErrors([]);
    return saved;
  }
  async function save() {
    setSaving(true);
    try {
      const next = {
        ...model,
        history: model.history.length
          ? model.history
          : [
              {
                stage: "survey",
                date: model.surveyDate,
                author: model.interpreter,
                note: "첨부 원본과 해석결과를 등록했습니다.",
              },
            ],
      };
      await persist(next);
      props.notify("유지관리 조사 기록을 저장했습니다.", "success");
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function advance() {
    setSaving(true);
    try {
      const next = advanceRealGpr(model, draft.event);
      await persist(next);
      setDraft((d) => ({ ...d, event: { ...d.event, note: "" } }));
      props.notify("수행 이력을 보존했습니다.", "success");
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function archive() {
    setSaving(true);
    try {
      await persist({ ...model, archived: !model.archived });
      props.notify(
        model.archived
          ? "기록을 복원했습니다."
          : "기록을 보관함으로 옮겼습니다.",
        "success",
      );
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function close() {
    setSaving(true);
    try {
      if (
        model.lifecycle !== "reinspection" ||
        !draft.event.note.trim() ||
        !draft.event.author.trim() ||
        !isDate(draft.event.date)
      )
        throw new Error(
          "재점검 이후 마감일·담당자·최종 확인 내용을 입력해 주세요.",
        );
      if (draft.event.date < (model.history.at(-1)?.date || model.surveyDate))
        throw new Error("마감일은 최근 수행일보다 빠를 수 없습니다.");
      await persist({
        ...model,
        closed: !model.closed,
        history: [
          ...model.history,
          { stage: model.closed ? "reopened" : "closed", ...draft.event },
        ],
      });
      props.notify(
        model.closed
          ? "기록을 다시 열었습니다."
          : "재점검 결과와 마감 근거를 저장했습니다.",
        "success",
      );
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function attach(file?: File) {
    if (!file) return;
    setSaving(true);
    try {
      const a = await saveAttachment(file, "gpr-user-original");
      setDraft((d) => ({
        ...d,
        model: { ...d.model, attachments: [...d.model.attachments, a] },
      }));
      props.notify(
        "원본을 브라우저에 보관했습니다. 조사 기록을 저장해 연결하세요.",
        "info",
      );
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "첨부 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function open(a: AttachmentMeta) {
    priorFocus.current = document.activeElement as HTMLElement;
    try {
      setViewer({
        url: await getAttachmentUrl(a.id),
        name: a.name,
        mime: a.mime,
      });
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "열기 실패", "error");
    }
  }
  return (
    <div className="rf-page">
      <header className="rf-page-heading">
        <div>
          <span className="rf-eyebrow">이천자이더리체</span>
          <h1>유지관리 · 조사</h1>
          <p>조사 원본을 등록하고 확인·조치·재점검을 이어갑니다.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setDraft({ ...initial, editing: true });
            setErrors([]);
          }}
          disabled={!state.ready}
        >
          <Plus size={17} /> 조사 등록
        </button>
      </header>
      <div className="rf-warning">
        <b>
          <Radar size={17} /> 제공 자료에 GPR 조사 결과가 없습니다.
        </b>
        조사 원문을 첨부해 등록하고, 현장 확인과 조치 결과를 이어 기록하세요.
      </div>
      {state.error && (
        <div className="rf-warning">
          {state.error}
          <button onClick={state.retry}>저장된 입력 다시 불러오기</button>현재
          입력은 저장된 값으로 바뀝니다.
        </div>
      )}
      {errors.map((e) => (
        <p className="rf-error" key={e}>
          {e}
        </p>
      ))}
      <div className="rm-layout">
        <aside className="rf-card">
          <div className="rf-heading">
            <h2>조사 이력</h2>
            <span>{records.length}건</span>
          </div>
          <label className="rf-note">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{" "}
            보관한 기록 포함
          </label>
          {!records.length ? (
            <div className="rf-empty">
              등록된 조사 기록이 없습니다.
              <br />
              원본을 준비한 뒤 조사 등록을 시작하세요.
            </div>
          ) : (
            records.map((r) => (
              <button
                key={r.id}
                className={`rm-record ${r.id === draft.recordId ? "active" : ""}`}
                onClick={() => load(r)}
              >
                <strong>{r.title}</strong>
                <small>
                  {(r.payload.model as Model).line} ·{" "}
                  {stageLabels[(r.payload.model as Model).lifecycle]} · r
                  {r.revision}
                </small>
              </button>
            ))
          )}
        </aside>
        <main className="rm-main">
          {(draft.editing || draft.recordId) && (
            <section className="rf-card">
              <div className="rf-heading">
                <h2>{draft.recordId ? "조사 상세" : "새 조사 등록"}</h2>
                {selected && (
                  <span className="badge badge-neutral">
                    r{selected.revision} · {stageLabels[model.lifecycle]}
                  </span>
                )}
              </div>
              <div className="rm-steps">
                {REAL_STAGES.map((s, i) => (
                  <span
                    className={
                      REAL_STAGES.indexOf(model.lifecycle) >= i ? "active" : ""
                    }
                    key={s}
                  >
                    {i + 1}. {stageLabels[s]}
                  </span>
                ))}
              </div>
              {!draft.editing && (
                <div className="rm-findings">
                  <p>
                    <strong>
                      {model.asset} · {model.line}
                    </strong>
                    <span>{model.location}</span>
                  </p>
                  <p>{model.findings}</p>
                  <p>
                    <b>후속 계획</b> {model.followUp}
                  </p>
                </div>
              )}
              <details
                className="rf-details rm-registration-details"
                open={draft.editing}
              >
                <summary>
                  {draft.editing ? "조사 정보 입력" : "등록 정보 확인"}
                </summary>
                <fieldset
                  disabled={!draft.editing || saving || !state.ready}
                  className="rm-fieldset"
                >
                  <div className="rf-grid2">
                    {[
                      ["title", "조사 제목"],
                      ["asset", "유지관리 대상 자산"],
                      ["line", "측선 번호"],
                      ["surveyDate", "조사일"],
                      ["interpreter", "해석 담당자"],
                      ["location", "위치 설명"],
                      ["equipment", "장비·주파수 (선택)"],
                      ["depth", "해석 심도·단위 (선택)"],
                      ["easting", "측선 대표 E (m, 선택)"],
                      ["northing", "측선 대표 N (m, 선택)"],
                    ].map(([key, label]) => (
                      <label className="rf-label" key={key}>
                        {label}
                        <input
                          type={key === "surveyDate" ? "date" : "text"}
                          value={String(model[key as keyof Model])}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="rf-label">
                    해석 결과 · 추정과 확인 사실을 구분
                    <textarea
                      rows={4}
                      value={model.findings}
                      onChange={(e) => update("findings", e.target.value)}
                    />
                  </label>
                  <label className="rf-label">
                    후속 확인·보강 검토 계획
                    <textarea
                      rows={3}
                      value={model.followUp}
                      onChange={(e) => update("followUp", e.target.value)}
                    />
                  </label>
                  <label className="rf-upload">
                    <Upload size={16} /> 원본·해석결과 첨부
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.json"
                      onChange={(e) => attach(e.target.files?.[0])}
                    />
                  </label>
                </fieldset>
              </details>
              <div className="rm-attachments">
                {attachments.map((a) => (
                  <div key={a.id}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => open(a)}
                    >
                      <ExternalLink size={14} />
                      {a.name}
                    </button>
                    <small>{(a.size / 1024).toFixed(1)} KB</small>
                    <details className="rm-attachment-integrity">
                      <summary>원본 검증 정보</summary>
                      <code>SHA-256 {a.sha256}</code>
                    </details>
                    {draft.editing && (
                      <button
                        className="btn btn-ghost"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            model: {
                              ...d.model,
                              attachments: d.model.attachments.filter(
                                (x) => x.id !== a.id,
                              ),
                            },
                          }))
                        }
                      >
                        연결 해제
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="rf-controls">
                {draft.editing ? (
                  <button
                    className="btn btn-primary"
                    onClick={save}
                    disabled={saving || !state.ready}
                  >
                    <Save size={16} /> 조사 정보 저장
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDraft((d) => ({ ...d, editing: true }))}
                  >
                    조사 정보 수정
                  </button>
                )}
                {draft.recordId && (
                  <button
                    className="btn btn-ghost"
                    onClick={archive}
                    disabled={saving}
                  >
                    {model.archived ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Archive size={15} />
                    )}{" "}
                    {model.archived ? "복원" : "보관"}
                  </button>
                )}
              </div>
            </section>
          )}
          {draft.recordId && (
            <section className="rf-card">
              <div className="rf-heading">
                <h2>확인·조치·재점검</h2>
                <span
                  className={`badge badge-${model.closed ? "success" : "warning"}`}
                >
                  {model.closed ? "마감" : "진행 중"}
                </span>
              </div>
              {model.history.length > 0 && (
                <div className="rf-note rm-latest-event">
                  <strong>최근 기록 · {model.history.at(-1)?.date}</strong>
                  <p>{model.history.at(-1)?.note}</p>
                  <small>{model.history.at(-1)?.author}</small>
                </div>
              )}

              <div className="rf-grid2">
                <label className="rf-label">
                  수행일
                  <input
                    type="date"
                    value={draft.event.date}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        event: { ...d.event, date: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="rf-label">
                  수행 담당자
                  <input
                    value={draft.event.author}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        event: { ...d.event, author: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
              <label className="rf-label">
                수행 결과·확인 근거
                <textarea
                  rows={3}
                  value={draft.event.note}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      event: { ...d.event, note: e.target.value },
                    }))
                  }
                />
              </label>
              <div className="rf-controls">
                {model.lifecycle !== "reinspection" ? (
                  <button
                    className="btn btn-primary"
                    disabled={saving || draft.editing}
                    onClick={advance}
                  >
                    {
                      stageLabels[
                        REAL_STAGES[REAL_STAGES.indexOf(model.lifecycle) + 1]
                      ]
                    }{" "}
                    기록 <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={saving || draft.editing}
                    onClick={close}
                  >
                    {model.closed
                      ? "추가 확인을 위해 다시 열기"
                      : "재점검 근거 확인 후 마감"}
                  </button>
                )}
              </div>
              <details className="rf-details">
                <summary>전체 조치 이력 · {model.history.length}건</summary>
                <ol className="rf-history">
                  {model.history.map((h, i) => (
                    <li key={i}>
                      <b>
                        {stageLabels[h.stage] ||
                          (
                            { closed: "마감", reopened: "다시 열기" } as Record<
                              string,
                              string
                            >
                          )[h.stage]}{" "}
                        · {h.date}
                      </b>
                      <p>{h.note}</p>
                      <small>{h.author}</small>
                    </li>
                  ))}
                </ol>
              </details>
              <p className="rf-note">
                담당자·날짜·수행 근거를 남기세요. 재점검 기록 후에만 마감할 수
                있습니다.
              </p>
            </section>
          )}
          <details
            className="rf-card rm-location-details"
            open={!draft.recordId || draft.editing}
          >
            <summary>유지관리 대상 위치 · 원본 정사영상</summary>
            <RealSiteMap
              transform={groundTransform}
              annotations={annotations}
              onMapClick={
                draft.editing
                  ? (p) =>
                      setDraft((d) => ({
                        ...d,
                        model: {
                          ...d.model,
                          easting: p.easting.toFixed(3),
                          northing: p.northing.toFixed(3),
                        },
                      }))
                  : undefined
              }
            />
            <p className="rf-note">
              흙막이와 구분되는 유지관리 자산을 지정하세요. GPR 조사 시점과 영상
              촬영시점은 다를 수 있습니다. 지도 위치는 등록 시 선택할 수 있으며
              미등록 좌표는 지도에 표시하지 않습니다.
            </p>
          </details>
        </main>
      </div>
      {viewer && (
        <div
          ref={dialogRef}
          className="rm-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="첨부 원본 보기"
        >
          <div>
            <header>
              <strong>{viewer.name}</strong>
              <button
                className="btn btn-secondary"
                onClick={() => setViewer(null)}
              >
                닫기
              </button>
            </header>
            {viewer.mime.startsWith("image/") ? (
              <img src={viewer.url} alt={viewer.name} />
            ) : viewer.mime === "application/pdf" ? (
              <Suspense fallback={<p>PDF를 여는 중…</p>}>
                <PdfDocument url={viewer.url} title={viewer.name} />
              </Suspense>
            ) : (
              <pre className="rm-text-preview">
                {viewerText || "문서를 불러오는 중…"}
              </pre>
            )}
            <a href={viewer.url} download={viewer.name}>
              원본 다운로드
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
