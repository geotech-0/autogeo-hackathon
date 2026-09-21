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
import {
  navigateGprDraft,
  committedGprDraft,
  recoverGprDraft,
  gprDraftConflict,
} from "./draft-navigation.mjs";
import "../field/real-field.css";
import "./maintenance.css";
type Event = { stage: string; date: string; author: string; note: string };
type Model = Omit<typeof EMPTY_GPR, "attachments" | "history"> & {
  attachments: AttachmentMeta[];
  history: Event[];
};
type Draft = {
  recordId: string | null;
  pendingRecordId?: string;
  sourceRevision?: number;
  model: Model;
  event: { date: string; author: string; note: string };
  editing: boolean;
  pendingDrafts?: Record<
    string,
    {
      model: Model;
      event: Draft["event"];
      editing: boolean;
      pendingRecordId?: string;
      sourceRevision?: number;
    }
  >;
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
      load(r, true);
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
  const firstInput = useRef<HTMLInputElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.ready && draft.editing) firstInput.current?.focus();
  }, [state.ready, draft.editing, draft.recordId]);
  useEffect(() => {
    if (errors.length) errorSummary.current?.focus();
  }, [errors]);
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
  const staleEditing = gprDraftConflict(draft, selected);
  useEffect(() => {
    if (!state.ready) return;
    setDraft((d) =>
      recoverGprDraft(
        d,
        props.records.find(
          (r) =>
            r.id === (d.recordId || d.pendingRecordId) &&
            r.payload.kind === "real_gpr",
        ),
      ),
    );
  }, [
    state.ready,
    props.records,
    draft.recordId,
    draft.pendingRecordId,
    draft.editing,
    setDraft,
  ]);
  const stageLabels = REAL_STAGE_LABELS as Record<string, string>;
  const displayedStatus = (item: Model) =>
    `${item.archived ? "보관 · " : ""}${item.closed ? "마감" : stageLabels[item.lifecycle]}`;
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
  function load(r: ProjectRecord, forceSaved = false) {
    setDraft((d) => navigateGprDraft(d, r, { forceSaved }));
    setErrors([]);
  }

  async function persist(next: Model) {
    if (staleEditing)
      throw new Error(
        "현재 초안의 기준과 저장본이 다릅니다. 필요한 입력을 복사하고 최신 저장본을 불러와 다시 확인해 주세요.",
      );
    const errs = validateRealGpr(next);
    if (errs.length) {
      setErrors(errs);
      throw new Error(errs[0]);
    }
    const recordId =
      draft.recordId || draft.pendingRecordId || crypto.randomUUID();
    if (!draft.recordId) setDraft((d) => ({ ...d, pendingRecordId: recordId }));
    const saved = await props.onSave({
      id: recordId,
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
    setDraft((d) =>
      (d.recordId || d.pendingRecordId) === recordId
        ? committedGprDraft(d, saved.id, next, saved.revision)
        : d,
    );
    setErrors([]);
    return saved;
  }
  async function save() {
    setSaving(true);
    setErrors([]);
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
      const message = e instanceof Error ? e.message : "저장 실패";
      setErrors((previous) => (previous.length ? previous : [message]));
      props.notify(message, "error");
    } finally {
      setSaving(false);
    }
  }
  async function advance() {
    setSaving(true);
    setErrors([]);
    try {
      const next = advanceRealGpr(model, draft.event);
      await persist(next);
      setDraft((d) => ({ ...d, event: { ...d.event, note: "" } }));
      props.notify("수행 이력을 보존했습니다.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "저장 실패";
      setErrors((previous) => (previous.length ? previous : [message]));
      props.notify(message, "error");
    } finally {
      setSaving(false);
    }
  }
  async function archive() {
    setSaving(true);
    setErrors([]);
    try {
      await persist({ ...model, archived: !model.archived });
      props.notify(
        model.archived
          ? "기록을 복원했습니다."
          : "기록을 보관함으로 옮겼습니다.",
        "success",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "저장 실패";
      setErrors((previous) => (previous.length ? previous : [message]));
      props.notify(message, "error");
    } finally {
      setSaving(false);
    }
  }
  async function close() {
    setSaving(true);
    setErrors([]);
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
      const message = e instanceof Error ? e.message : "저장 실패";
      setErrors((previous) => (previous.length ? previous : [message]));
      props.notify(message, "error");
    } finally {
      setSaving(false);
    }
  }
  async function attach(file?: File) {
    if (!file) return;
    setSaving(true);
    setErrors([]);
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
            setDraft((d) => navigateGprDraft(d, null));
            setErrors([]);
          }}
          disabled={
            !state.ready || saving || (!draft.recordId && draft.editing)
          }
        >
          <Plus size={17} />{" "}
          {draft.editing && !draft.recordId
            ? "조사 작성 중"
            : draft.pendingDrafts?.__new
              ? "새 조사 이어쓰기"
              : "조사 등록"}
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
      {errors.length > 0 && (
        <div
          ref={errorSummary}
          className="rm-error-summary"
          tabIndex={-1}
          role="alert"
          aria-label="입력 확인"
        >
          <strong>입력 내용을 확인해 주세요</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
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
                disabled={!state.ready || saving}
                aria-pressed={r.id === draft.recordId}
              >
                <strong>{r.title}</strong>
                <small>
                  {(r.payload.model as Model).line} ·{" "}
                  {displayedStatus(r.payload.model as Model)} · r{r.revision}
                </small>
              </button>
            ))
          )}
        </aside>
        <section className="rm-main" aria-label="조사 상세 및 수행 이력">
          {(draft.editing || draft.recordId) && (
            <section className="rf-card">
              <div className="rf-heading">
                <h2>{draft.recordId ? "조사 상세" : "새 조사 등록"}</h2>
                {selected && (
                  <span className="badge badge-neutral">
                    {staleEditing && draft.sourceRevision === undefined
                      ? "개정 미확인"
                      : `r${staleEditing ? draft.sourceRevision : selected.revision}`}
                    {staleEditing ? " 편집 중" : ""} · {displayedStatus(model)}
                  </span>
                )}
              </div>
              {draft.editing && (
                <p className="rf-note">
                  입력 중인 내용은 초안으로 보관됩니다. 원본 첨부 후 조사 정보를
                  저장하세요.
                </p>
              )}
              {staleEditing && selected && (
                <div className="rf-warning" role="alert">
                  편집 기준과 최신 저장본 r{selected.revision}의 개정 또는 수행
                  이력이 다릅니다. 현재 입력은 보존되어 있으며 이전 개정으로
                  덮어쓸 수 없습니다. 필요한 입력을 복사한 뒤 다시 불러오세요.
                  <button
                    className="btn btn-secondary"
                    disabled={saving}
                    onClick={() => load(selected, true)}
                  >
                    현재 입력 대신 최신 저장본 불러오기
                  </button>
                </div>
              )}
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
                    ].map(([key, label]) => (
                      <label className="rf-label" key={key}>
                        {label}
                        <input
                          ref={key === "title" ? firstInput : undefined}
                          type={key === "surveyDate" ? "date" : "text"}
                          value={String(model[key as keyof Model])}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <details
                    className="rf-details rm-optional-fields"
                    open={
                      errors.some((e) => /좌표|측선 위치/.test(e)) || undefined
                    }
                  >
                    <summary>장비·심도·지도 좌표 (선택)</summary>
                    <p className="rf-note">
                      위치 설명만으로 등록할 수 있습니다. 좌표는 아래 지도에서
                      선택하거나 E·N을 함께 입력하세요.
                    </p>
                    <div className="rf-grid2">
                      {[
                        ["equipment", "장비·주파수"],
                        ["depth", "해석 심도·단위"],
                        ["easting", "측선 대표 E (m)"],
                        ["northing", "측선 대표 N (m)"],
                      ].map(([key, label]) => (
                        <label className="rf-label" key={key}>
                          {label}
                          <input
                            value={String(model[key as keyof Model])}
                            onChange={(e) => update(key, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
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
                    disabled={saving || draft.editing}
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
                  className={`badge badge-${model.archived ? "neutral" : model.closed ? "success" : "warning"}`}
                >
                  {model.archived ? "보관 · " : ""}
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

              {draft.editing && (
                <p className="rf-note">
                  조사 정보를 수정 중입니다. 위에서 조사 정보를 저장한 다음 수행
                  이력을 기록하세요.
                </p>
              )}
              <fieldset
                disabled={saving || draft.editing || !state.ready}
                className="rm-fieldset"
              >
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
              </fieldset>
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
            open={draft.editing || undefined}
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
        </section>
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
