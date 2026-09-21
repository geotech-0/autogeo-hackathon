import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Save, AlertTriangle, Upload } from "lucide-react";
import type {
  FeatureProps,
  RecordStatus,
  ProjectRecord,
} from "../../contracts";
import { STATUS_LABELS, SITE } from "../../contracts";
import data from "../../data/real-field/monitoring.json";
import {
  evaluateSensor,
  monitoringMetric,
  monitoringProvenance,
} from "./real-engine.mjs";
import { useDraft } from "../../storage/useDraft";
import RealChart from "./RealChart";
import { useRequestedRecord } from "./useRequestedRecord";
import { siteDate } from "../../utils/site-date.mjs";
import {
  ADDITIONAL_DIRECTIONS,
  ADDITIONAL_MONITORING_METHOD,
  emptyAdditionalCriterion,
  evaluateAdditionalMonitoring,
  restoreAdditionalImport,
  additionalReviewPayload,
  additionalIssuePayload,
} from "./additional-monitoring.mjs";
type Reading = {
  date: string;
  value: number;
  delta: number;
  rate?: number | null;
  depth?: number;
  source: { report: string; page: number; url: string };
  calculatedRate?: number;
  raw?: string;
};
type Sensor = {
  id: string;
  kind: string;
  label: string;
  unit: string;
  location: string | null;
  criteria: number[];
  criteriaConfirmed: boolean;
  criterionSource: string;
  qc: string[];
  sources: { url: string; page: number; report: string }[];
  rows: Reading[];
  profiles: {
    date: string;
    source: { url: string };
    readings: { depth: number; value: number }[];
  }[];
};
const sensors = data.sensors as unknown as Sensor[];
const f = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
const emptyAdditionalDraft = () => ({
  importRecordId: "",
  importPendingRecordId: "",
  importIssueId: "",
  importPendingIssueId: "",
  importCsv: "date,value\n",
  importSource: "",
  importLocation: "",
  importCriterion: emptyAdditionalCriterion(),
  manualDate: "",
  manualValue: "",
});
type AdditionalDraft = ReturnType<typeof emptyAdditionalDraft>;
const additionalSnapshot = (draft: Partial<AdditionalDraft>): AdditionalDraft =>
  Object.fromEntries(
    Object.entries(emptyAdditionalDraft()).map(([key, fallback]) => [
      key,
      draft[key as keyof AdditionalDraft] ?? fallback,
    ]),
  ) as AdditionalDraft;
export default function RealMonitoring(props: FeatureProps) {
  const saveLifecycle = useRef(0);
  useEffect(() => {
    saveLifecycle.current += 1;
    return () => {
      saveLifecycle.current += 1;
    };
  }, []);
  const [draft, setDraft, state] = useDraft("real-monitoring-v1", {
    recordId: "",
    pendingRecordId: "",
    sensor: "F-2",
    month: "all",
    metric: "delta",
    ...emptyAdditionalDraft(),
    additionalBySensor: {} as Record<string, AdditionalDraft>,
    note: "",
    author: "",
  });
  useRequestedRecord(
    props.requestedRecordId,
    props.records,
    state.ready,
    (r) => {
      if (
        r.payload.kind !== "real_monitoring_review" &&
        r.payload.kind !== "monitoring_import"
      )
        return;
      const sensorId = String(r.payload.sensorId || r.asset_id || "F-2");
      if (!sensors.some((s) => s.id === sensorId)) {
        props.notify("이 기록의 계측기를 찾을 수 없습니다.", "error");
        return;
      }
      setDraft((d) => ({
        ...d,
        additionalBySensor: {
          ...d.additionalBySensor,
          [d.sensor]: additionalSnapshot(d),
        },
        ...emptyAdditionalDraft(),
        recordId: r.payload.kind === "real_monitoring_review" ? r.id : "",
        pendingRecordId: "",
        sensor: sensorId,
        month: String(r.payload.period || "all"),
        metric: "delta",
        ...(r.payload.kind === "monitoring_import"
          ? {
              ...restoreAdditionalImport(r.payload),
              importRecordId: r.id,
              importIssueId:
                props.records.find(
                  (item) =>
                    item.payload.kind === "real_field_issue" &&
                    item.payload.monitoringReviewId === r.id,
                )?.id || "",
            }
          : {}),
      }));
      if (r.payload.kind === "monitoring_import") setAdditionalOpen(true);
    },
  );
  const [selectedRow, setSelectedRow] = useState<number | null>(null),
    [saving, setSaving] = useState(false),
    [showAll, setShowAll] = useState(false),
    [additionalOpen, setAdditionalOpen] = useState(false);
  const sensor = sensors.find((s) => s.id === draft.sensor) || sensors[0];
  const rows = useMemo(
    () =>
      sensor.rows.filter(
        (r) => draft.month === "all" || r.date.startsWith(draft.month),
      ),
    [sensor, draft.month],
  );
  const result = evaluateSensor(sensor, rows);
  const provenance = monitoringProvenance(rows, draft.month, data.reports);
  const last = rows.at(-1);
  const metricUnit =
    draft.metric === "rate"
      ? "m/day"
      : draft.metric === "raw"
        ? sensor.kind === "SE"
          ? "m"
          : sensor.kind === "F"
            ? "m³"
            : sensor.unit
        : sensor.unit;
  const selected = selectedRow === null ? last : rows[selectedRow] || last;
  const importCriterion = draft.importCriterion ?? emptyAdditionalCriterion();
  const csv = evaluateAdditionalMonitoring(draft.importCsv, importCriterion);
  const hasSavedImport = Boolean(
    draft.importRecordId ||
      props.records.some(
        (r) =>
          r.id === draft.importPendingRecordId &&
          r.payload.kind === "monitoring_import",
      ),
  );
  const linkedIssue = props.records.find(
    (r) =>
      r.payload.kind === "real_field_issue" &&
      (r.id === (draft.importIssueId || draft.importPendingIssueId) ||
        ((draft.importRecordId || draft.importPendingRecordId) &&
          r.payload.monitoringReviewId ===
            (draft.importRecordId || draft.importPendingRecordId))),
  );
  const recent = props.records.filter(
    (r) => r.payload.kind === "monitoring_import" && r.asset_id === sensor.id,
  );
  const change = (key: string, value: string) => {
    setDraft((d) => {
      if (key === "sensor" && value !== d.sensor) {
        const additionalBySensor = {
          ...d.additionalBySensor,
          [d.sensor]: additionalSnapshot(d),
        };
        return {
          ...d,
          ...additionalSnapshot(additionalBySensor[value] || {}),
          sensor: value,
          recordId: "",
          pendingRecordId: "",
          metric: "delta",
          additionalBySensor,
        };
      }
      return {
        ...d,
        [key]: value,
        ...(["importCsv", "importSource"].includes(key)
          ? {
              importCriterion: {
                ...emptyAdditionalCriterion(),
                ...d.importCriterion,
                confirmed: false,
              },
            }
          : {}),
      };
    });
    if (["sensor", "month"].includes(key)) {
      setSelectedRow(null);
      setShowAll(false);
    }
  };
  const changeCriterion = (key: string, value: string | boolean) =>
    setDraft((d) => ({
      ...d,
      importCriterion: {
        ...emptyAdditionalCriterion(),
        ...d.importCriterion,
        [key]: value,
        confirmed: key === "confirmed" ? value === true : false,
      },
    }));
  const loadImport = (r: ProjectRecord) => {
    setDraft((d) => ({
      ...d,
      ...restoreAdditionalImport(r.payload),
      importRecordId: r.id,
      importPendingRecordId: "",
      importPendingIssueId: "",
      importIssueId:
        props.records.find(
          (item) =>
            item.payload.kind === "real_field_issue" &&
            item.payload.monitoringReviewId === r.id,
        )?.id || "",
    }));
    setAdditionalOpen(true);
  };
  async function save(issue = false) {
    setSaving(true);
    try {
      if (!rows.length)
        throw new Error(
          "선택한 기간에 측정 기록이 없습니다. 측정 기간을 변경해 주세요.",
        );
      if (issue && (!draft.note.trim() || !draft.author.trim()))
        throw new Error("이슈 내용과 담당자를 입력해 주세요.");
      const recordId = issue
        ? undefined
        : draft.recordId || draft.pendingRecordId || crypto.randomUUID();
      if (!issue && !draft.recordId && !draft.pendingRecordId)
        setDraft((d) => ({ ...d, pendingRecordId: recordId! }));
      const saved = await props.onSave({
        id: recordId,
        stage: "construction",
        asset_id: sensor.id,
        source_id: provenance.source_id,
        source_revision: provenance.source_revision,
        origin: "measured",
        status: issue ? "pending" : (result.status as RecordStatus),
        title: `${sensor.id} ${issue ? "계측 검토 이슈" : sensor.label + " 검토"}`,
        summary: issue
          ? draft.note
          : `${rows.length}개 기록 · 최근 ${f(result.latest)} ${sensor.unit} · ${STATUS_LABELS[result.status as RecordStatus]}`,
        assumptions: [
          "보고서 제공기간의 과거 측정값이며 실시간 상태가 아닙니다.",
          ...(sensor.criteriaConfirmed
            ? []
            : ["관리기준 매핑·단위 미확인으로 판정 보류"]),
          ...sensor.qc,
        ],
        payload: {
          kind: issue ? "real_field_issue" : "real_monitoring_review",
          sensorId: sensor.id,
          period: draft.month,
          sourceReports: provenance.sourceReports,
          measurementPeriod: provenance.measurementPeriod,
          sourceRows: rows,
          criteria: sensor.criteria,
          result,
          location: sensor.location,
          coordinate: null,
          criterionSource: sensor.criterionSource,
          ...(issue
            ? {
                lifecycle: "identified",
                history: [
                  {
                    stage: "identified",
                    date: siteDate(),
                    author: draft.author,
                    note: draft.note,
                  },
                ],
              }
            : {}),
        },
      });
      if (!issue)
        setDraft((d) => ({ ...d, recordId: saved.id, pendingRecordId: "" }));
      props.notify(
        issue
          ? "계측 이슈를 조치 이력에 등록했습니다."
          : "검토 기록을 저장했습니다.",
        "success",
      );
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function saveImport(asIssue = false) {
    const lifecycle = saveLifecycle.current;
    const isCurrent = () => saveLifecycle.current === lifecycle;
    setSaving(true);
    let reviewSaved = false;
    try {
      const payload = additionalReviewPayload({
        sensorId: sensor.id,
        source: draft.importSource,
        rawCsv: draft.importCsv,
        criterion: importCriterion,
        location: draft.importLocation || "",
      });
      if (asIssue && payload.evaluation.status !== "exceeded")
        throw new Error(
          "확인된 사용자 기준을 초과한 기록만 이슈로 등록할 수 있습니다.",
        );
      if (asIssue && draft.importIssueId && !linkedIssue)
        throw new Error("연결된 이슈를 불러온 뒤 다시 저장해 주세요.");
      const reviewId =
        draft.importRecordId ||
        draft.importPendingRecordId ||
        crypto.randomUUID();
      const issueId = asIssue
        ? linkedIssue?.id || draft.importPendingIssueId || crypto.randomUUID()
        : undefined;
      setDraft((d) => ({
        ...d,
        ...(!draft.importRecordId ? { importPendingRecordId: reviewId } : {}),
        ...(asIssue && !linkedIssue ? { importPendingIssueId: issueId! } : {}),
      }));
      const review = await props.onSave({
        id: reviewId,
        stage: "construction",
        zone_id: SITE.zone_id,
        asset_id: sensor.id,
        source_id: `manual-${sensor.id}`,
        method_version: ADDITIONAL_MONITORING_METHOD,
        origin: "measured",
        status: payload.evaluation.status as RecordStatus,
        title: `${sensor.id} 추가 계측 ${csv.rows.length}행`,
        summary: payload.criteriaConfirmed
          ? `${payload.evaluation.exceededCount}행 기준 초과 · ${ADDITIONAL_DIRECTIONS[importCriterion.direction as keyof typeof ADDITIONAL_DIRECTIONS]} ${importCriterion.limit} ${importCriterion.unit}`
          : "추가 측정 기록 · 사용자 기준 확인 전",
        payload,
        assumptions: [
          "월간보고서와 분리해 보관한 사용자 추가 계측입니다.",
          payload.criteriaConfirmed
            ? "사용자가 확인한 단위·방향·기준으로 입력값을 직접 비교했습니다."
            : "단위·기준 적용을 확인하기 전에는 판정을 보류합니다.",
        ],
      });
      reviewSaved = true;
      // The reserved IDs remain in the draft. A returning screen can finish
      // the issue link; a departed screen must not overwrite its newer review.
      if (!isCurrent()) return;
      setDraft((d) => ({
        ...d,
        importRecordId: review.id,
        importPendingRecordId: "",
      }));
      if (asIssue) {
        const issuePayload = additionalIssuePayload(
          review,
          linkedIssue?.payload,
          siteDate(),
        );
        const issue = await props.onSave({
          ...(linkedIssue || {}),
          id: issueId,
          stage: "construction",
          zone_id: SITE.zone_id,
          asset_id: sensor.id,
          source_id: `manual-${sensor.id}`,
          source_revision: String(review.revision),
          method_version: ADDITIONAL_MONITORING_METHOD,
          origin: "measured",
          status:
            issuePayload.lifecycle === "identified" ? "exceeded" : "action",
          title: `${sensor.id} 추가계측 기준 초과`,
          summary: `${csv.exceededCount}행 초과 · ${draft.importLocation || SITE.zone_name} · ${draft.importSource}`,
          assumptions: review.assumptions,
          dependencies: review.analysis_id
            ? [{ analysis_id: review.analysis_id, revision: review.revision }]
            : [],
          payload: issuePayload,
        });
        if (!isCurrent()) return;
        setDraft((d) => ({
          ...d,
          importIssueId: issue.id,
          importPendingIssueId: "",
        }));
        props.notify(
          "추가 계측과 초과 이슈를 저장했습니다. 조치·재점검에서 이어 기록하세요.",
          "success",
        );
      } else
        props.notify(
          `추가 계측을 ${payload.evaluation.status === "pending" ? "보류 상태로 " : ""}${hasSavedImport ? "개정 " : ""}저장했습니다.`,
          "success",
        );
    } catch (e) {
      if (!isCurrent()) return;
      props.notify(
        `${asIssue && reviewSaved ? "추가 계측은 저장했습니다. 이슈 연결을 다시 시도해 주세요. " : ""}${e instanceof Error ? e.message : "저장 실패"}`,
        "error",
      );
    } finally {
      if (isCurrent()) setSaving(false);
    }
  }
  return (
    <>
      {state.error && (
        <div className="rf-warning">
          입력을 보존하지 못했습니다. {state.error}
          <button onClick={state.retry}>저장된 입력 다시 불러오기</button>
          <small>현재 화면의 입력은 저장된 값으로 바뀝니다.</small>
        </div>
      )}
      <label className="rf-label rf-mobile-sensor-select">
        계측기 선택
        <select
          value={sensor.id}
          disabled={!state.ready || saving}
          onChange={(e) => change("sensor", e.target.value)}
        >
          {sensors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="rf-monitor-layout">
        <aside className="rf-card rf-sensor-list">
          <div className="rf-heading">
            <h2>계측기 목록</h2>
            <span>27개</span>
          </div>
          {["INC", "W", "L", "SE", "F"].map((kind) => (
            <div className="rf-sensor-group" key={kind}>
              <h3>{sensors.find((s) => s.kind === kind)?.label}</h3>
              {sensors
                .filter((s) => s.kind === kind)
                .map((s) => {
                  const r = evaluateSensor(s);
                  return (
                    <button
                      disabled={!state.ready || saving}
                      aria-pressed={s.id === sensor.id}
                      className={s.id === sensor.id ? "active" : ""}
                      onClick={() => change("sensor", s.id)}
                      key={s.id}
                    >
                      <span>
                        <b>{s.id}</b>
                        <small>{s.location || "단면 미표기"}</small>
                      </span>
                      <span
                        className={
                          r.status === "pending"
                            ? "rf-dot warn"
                            : r.status === "exceeded"
                              ? "rf-dot danger"
                              : "rf-dot"
                        }
                      />
                    </button>
                  );
                })}
            </div>
          ))}
        </aside>
        <section
          className="rf-monitor-main"
          aria-label={`${sensor.id} ${sensor.label} 검토`}
        >
          <section className="rf-card">
            <div className="rf-heading">
              <div>
                <span className="rf-eyebrow">MEASURED · 2024.01—03</span>
                <h2>
                  {sensor.id} <span>{sensor.label}</span>
                </h2>
                <p>
                  {sensor.location || "설치 단면 원문 확인 필요"} · 좌표 미등록
                </p>
              </div>
              <span
                className={`badge badge-${result.status === "pass" ? "success" : result.status === "exceeded" ? "danger" : "warning"}`}
              >
                {STATUS_LABELS[result.status as RecordStatus]}
              </span>
            </div>
            <div className="rf-controls">
              <label className="rf-label">
                측정 기간
                <select
                  value={draft.month}
                  onChange={(e) => change("month", e.target.value)}
                >
                  <option value="all">전체 제공기간</option>
                  {["2023-12", "2024-01", "2024-02", "2024-03"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="rf-label">
                차트 지표
                <select
                  value={draft.metric}
                  onChange={(e) => change("metric", e.target.value)}
                >
                  <option value="delta">
                    {sensor.kind === "F"
                      ? "일간 유량"
                      : sensor.kind === "INC"
                        ? "최대 누적변위 절댓값"
                        : "누적변화 절댓값"}
                  </option>
                  <option value="raw">원시 측정값</option>
                  {sensor.kind === "W" && (
                    <option value="rate">일변화량 절댓값</option>
                  )}
                </select>
              </label>
              {selected && (
                <a
                  className="btn btn-secondary"
                  href={selected.source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} /> 원문 표
                </a>
              )}
              <button
                className="btn btn-primary"
                disabled={saving || !state.ready}
                onClick={() => save()}
              >
                <Save size={15} /> 검토 저장
              </button>
            </div>
            <div className="rf-metrics">
              <div>
                <span>최근 {last?.date || "기록 없음"}</span>
                <strong>
                  {f(result.latest)} <small>{sensor.unit}</small>
                </strong>
              </div>
              <div>
                <span>선택 기간 최대 절댓값</span>
                <strong>
                  {f(result.maximum)} <small>{sensor.unit}</small>
                </strong>
              </div>
              <div>
                <span>
                  {sensor.criteriaConfirmed
                    ? "1차 관리기준 대비 · 최근"
                    : "원문 기준 수치 대비 · 참고"}
                </span>
                <strong>
                  {result.ratio === null ? "—" : f(result.ratio * 100)}
                  <small>%</small>
                </strong>
                {!sensor.criteriaConfirmed && (
                  <small>
                    {sensor.kind === "F" ? "단위 확인 전" : "기준 확인 전"}
                  </small>
                )}
              </div>
            </div>
            <RealChart
              points={rows.map((r) => ({
                x: Date.parse(r.date),
                y:
                  draft.metric === "raw"
                    ? r.value
                    : draft.metric === "rate"
                      ? Math.abs(r.rate ?? NaN)
                      : sensor.kind === "F"
                        ? (monitoringMetric(sensor, r) ?? NaN)
                        : Math.abs(monitoringMetric(sensor, r) ?? NaN),
                label: r.date,
                detail: `${sensor.id} · PDF p${r.source.page}${r.depth ? ` · 심도${r.depth}m` : ""}`,
              }))}
              xLabel="측정 날짜"
              yLabel={metricUnit}
              thresholds={
                draft.metric === "delta"
                  ? sensor.criteria
                  : draft.metric === "rate"
                    ? [0.5, 0.75, 1]
                    : []
              }
              onPoint={setSelectedRow}
            />
            {sensor.kind === "INC" && (
              <p className="rf-note">
                화면 판정은 누적변위 기준입니다. 토사·암반별 속도기준은 적용
                구간 확인이 필요합니다.
              </p>
            )}
            <details className="rf-details rf-explanation">
              <summary>차트 지표와 기준선 읽는 방법</summary>
              <div className="rf-note">
                {sensor.kind === "INC"
                  ? "심도별 변위 중 절댓값 최대값을 날짜별 대표값으로 표시합니다."
                  : sensor.kind === "F"
                    ? "원시표 일간 변화량을 표시합니다. 누적 계기값의 차이를 측정 간격으로 나눠 교차 확인합니다."
                    : "표는 원문의 부호와 단위를 보존하며, 관리기준 비교 차트는 변화량 절댓값을 표시합니다."}{" "}
                기준선은 문서값이며 미확인 항목은 판정을 보류합니다.
              </div>
            </details>
          </section>
          <section className="rf-card">
            <div className="rf-heading">
              <h2>확인할 사항과 조치</h2>
              <a href={sensor.criterionSource} target="_blank" rel="noreferrer">
                현장 관리기준 · p38 ↗
              </a>
            </div>
            {selected && (
              <div className="rf-selected">
                <strong>{selected.date}</strong>
                <span>
                  측정 {f(selected.value)}{" "}
                  {sensor.kind === "SE"
                    ? "m"
                    : sensor.kind === "F"
                      ? "m³"
                      : sensor.unit}
                </span>
                <span>
                  변화 {f(monitoringMetric(sensor, selected))} {sensor.unit}
                </span>
                <a href={selected.source.url} target="_blank" rel="noreferrer">
                  {selected.source.report} · p{selected.source.page} ↗
                </a>
              </div>
            )}
            {sensor.qc.length > 0 && (
              <div className="rf-warning">
                <b>
                  <AlertTriangle size={16} /> 확인할 항목 {sensor.qc.length}건
                </b>
                <ul>
                  {sensor.qc.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="rf-details">
              <summary>이상·자료 불일치를 조치 이력으로 등록</summary>
              <div className="rf-grid2">
                <label className="rf-label">
                  확인 담당자
                  <input
                    value={draft.author}
                    onChange={(e) => change("author", e.target.value)}
                  />
                </label>
                <label className="rf-label">
                  확인 내용
                  <input
                    placeholder="원문·위치·기준 확인이 필요한 내용을 기록"
                    value={draft.note}
                    onChange={(e) => change("note", e.target.value)}
                  />
                </label>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => save(true)}
                disabled={saving || !state.ready}
              >
                이슈 등록 → 조치·재점검
              </button>
            </details>
            <details className="rf-details">
              <summary>원시 측정값과 출처 · {rows.length}개 기록</summary>
              <div className="rf-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>측정일</th>
                      <th>원시값</th>
                      <th>비교 지표 ({sensor.unit})</th>
                      <th>근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAll ? rows : rows.slice(-8)).map((r, i) => (
                      <tr
                        key={r.date}
                        onClick={() =>
                          setSelectedRow(
                            showAll ? i : Math.max(0, rows.length - 8) + i,
                          )
                        }
                      >
                        <td>{r.date}</td>
                        <td>{f(r.value)}</td>
                        <td>
                          {f(monitoringMetric(sensor, r))}
                          {r.calculatedRate !== undefined && (
                            <small>산술 {f(r.calculatedRate)}</small>
                          )}
                        </td>
                        <td>
                          <a
                            href={r.source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.source.report.slice(-2)}월 p{r.source.page} ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "최근 8개만 보기" : `${rows.length}개 전체 행 보기`}
              </button>
            </details>
            {sensor.kind === "INC" && (
              <details>
                <summary>최근 심도별 변위 상세</summary>
                <RealChart
                  points={(sensor.profiles.at(-1)?.readings || []).map((r) => ({
                    x: r.value,
                    y: r.depth,
                    label: `심도 ${r.depth}m`,
                    detail: `변위 ${r.value}mm`,
                  }))}
                  xLabel="수평변위 (mm)"
                  yLabel="심도 (GL−m)"
                  invertY
                />
              </details>
            )}
          </section>
          <section className="rf-card">
            <details
              open={additionalOpen}
              onToggle={(e) => setAdditionalOpen(e.currentTarget.open)}
            >
              <summary>수동 입력·CSV 추가 계측 등록</summary>
              <p className="rf-note">
                {sensor.id}의 추가 측정값을 보고서 기록과 분리해 보관합니다.
                기준을 직접 확인하면 초과 여부를 검토할 수 있습니다.
              </p>
              <div className="rf-grid3">
                <label className="rf-label">
                  측정일
                  <input
                    type="date"
                    value={draft.manualDate}
                    onChange={(e) => change("manualDate", e.target.value)}
                  />
                </label>
                <label className="rf-label">
                  측정값
                  <input
                    type="number"
                    step="any"
                    value={draft.manualValue}
                    onChange={(e) => change("manualValue", e.target.value)}
                  />
                </label>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    change(
                      "importCsv",
                      draft.importCsv.trimEnd() +
                        `\n${draft.manualDate},${draft.manualValue}\n`,
                    )
                  }
                >
                  행 추가
                </button>
              </div>
              <label className="rf-label">
                원본·측정 기록 이름
                <input
                  value={draft.importSource}
                  onChange={(e) => change("importSource", e.target.value)}
                  placeholder="현장 계측 원장 이름"
                />
              </label>
              <label className="rf-upload">
                <Upload size={16} /> CSV 불러오기
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1024 * 1024) {
                      props.notify("1MB 이하 CSV를 선택해 주세요.", "error");
                      return;
                    }
                    change("importCsv", await file.text());
                    change("importSource", file.name);
                  }}
                />
              </label>
              <textarea
                aria-label="추가 계측 CSV"
                value={draft.importCsv}
                onChange={(e) => change("importCsv", e.target.value)}
                rows={5}
              />
              <details className="rf-details">
                <summary>사용자 기준으로 비교하기</summary>
                <p className="rf-note">
                  입력값에 직접 적용할 단위와 기준을 지정하세요. 원문 센서
                  기준은 자동으로 채우지 않습니다.
                </p>
                <div className="rf-grid3">
                  <label className="rf-label">
                    측정 단위
                    <input
                      aria-label="추가 계측 단위"
                      value={importCriterion.unit}
                      onChange={(e) => changeCriterion("unit", e.target.value)}
                      placeholder="예: mm, m³/day"
                      maxLength={40}
                    />
                  </label>
                  <label className="rf-label">
                    평가 방향
                    <select
                      aria-label="추가 계측 평가 방향"
                      value={importCriterion.direction}
                      onChange={(e) =>
                        changeCriterion("direction", e.target.value)
                      }
                    >
                      <option value="">방향 선택</option>
                      {Object.entries(ADDITIONAL_DIRECTIONS).map(
                        ([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="rf-label">
                    기준값
                    <input
                      aria-label="추가 계측 기준값"
                      type="number"
                      step="any"
                      value={importCriterion.limit}
                      onChange={(e) => changeCriterion("limit", e.target.value)}
                    />
                  </label>
                </div>
                <div className="rf-grid2">
                  <label className="rf-label">
                    기준 이름·근거
                    <input
                      aria-label="추가 계측 기준 근거"
                      value={importCriterion.evidence}
                      onChange={(e) =>
                        changeCriterion("evidence", e.target.value)
                      }
                      placeholder="적용 기준·문서·페이지"
                    />
                  </label>
                  <label className="rf-label">
                    기준 확인 담당자
                    <input
                      aria-label="추가 계측 기준 확인자"
                      value={importCriterion.confirmedBy}
                      onChange={(e) =>
                        changeCriterion("confirmedBy", e.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="rf-label">
                  측정 위치 (선택)
                  <input
                    aria-label="추가 계측 위치"
                    value={draft.importLocation || ""}
                    onChange={(e) => change("importLocation", e.target.value)}
                    placeholder="구역 내 측정 위치"
                  />
                </label>
                <label className="rf-label rf-resolution-confirmation">
                  <span>
                    <input
                      type="checkbox"
                      aria-label="추가 계측 기준 확인"
                      checked={importCriterion.confirmed}
                      onChange={(e) =>
                        changeCriterion("confirmed", e.target.checked)
                      }
                    />
                    이 측정값의 단위·평가 방향·적용 기준을 확인했습니다
                  </span>
                </label>
                <p className="rf-note">
                  기준과 같은 값은 기준 이내로 처리합니다. 입력값·출처·기준을
                  바꾸면 다시 확인해야 합니다.
                </p>
              </details>
              {csv.errors.map((e) => (
                <p className="rf-error" key={e}>
                  {e}
                </p>
              ))}
              {csv.rows.length > 0 && (
                <>
                  <div className="rf-heading">
                    <h3>
                      추가 {csv.rows.length}행 ·{" "}
                      {csv.status === "pending"
                        ? "기준 확인 전"
                        : csv.status === "error"
                          ? "입력 확인 필요"
                          : `${csv.exceededCount}행 기준 초과`}
                    </h3>
                    <span
                      className={`badge badge-${csv.status === "pass" ? "success" : csv.status === "exceeded" ? "danger" : "warning"}`}
                    >
                      {STATUS_LABELS[csv.status as RecordStatus]}
                    </span>
                  </div>
                  <RealChart
                    points={csv.rows.map((r) => ({
                      x: Date.parse(r.date),
                      y: r.comparedValue ?? r.value,
                      label: r.date,
                      detail:
                        csv.status === "pending"
                          ? "추가 입력 · 기준 확인 전"
                          : csv.status === "error"
                            ? "추가 입력 · 오류 확인 필요"
                            : `원시값 ${f(r.value)} · ${r.exceeded ? "기준 초과" : "기준 이내"}`,
                    }))}
                    xLabel="측정 날짜"
                    yLabel={`${importCriterion.direction === "absolute" && csv.limit !== null ? "절댓값 · " : ""}${importCriterion.unit || "단위 확인 전"}`}
                    thresholds={csv.limit === null ? [] : [csv.limit]}
                    thresholdLabels={["입력 기준"]}
                  />
                  {csv.exceededCount > 0 && (
                    <p className="rf-note">
                      초과일:{" "}
                      {csv.rows
                        .filter((r) => r.exceeded)
                        .map((r) => r.date)
                        .join(", ")}
                    </p>
                  )}
                </>
              )}
              <div className="rf-controls">
                <button
                  className="btn btn-primary"
                  disabled={
                    saving ||
                    csv.errors.length > 0 ||
                    !draft.importSource.trim() ||
                    !state.ready
                  }
                  onClick={() => saveImport()}
                >
                  {hasSavedImport
                    ? "추가 계측 개정 저장"
                    : csv.status === "pending"
                      ? `추가 ${csv.rows.length}행 보류 저장`
                      : "추가 계측 검토 저장"}
                </button>
                {csv.status === "exceeded" && (
                  <button
                    className="btn btn-secondary"
                    disabled={
                      saving || !draft.importSource.trim() || !state.ready
                    }
                    onClick={() => saveImport(true)}
                  >
                    {linkedIssue
                      ? "초과 이슈에 개정 연결"
                      : "초과 → 구역 이슈 등록"}
                  </button>
                )}
                {hasSavedImport && (
                  <button
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() =>
                      setDraft((d) => ({ ...d, ...emptyAdditionalDraft() }))
                    }
                  >
                    새 추가 계측
                  </button>
                )}
              </div>
              {hasSavedImport &&
                csv.status === "exceeded" &&
                draft.importPendingIssueId &&
                !linkedIssue &&
                !saving && (
                  <p className="rf-warning" role="status">
                    추가 계측은 저장됐지만 초과 이슈 연결이 완료되지 않았습니다.
                    ‘초과 → 구역 이슈 등록’으로 이어 저장하세요.
                  </p>
                )}
              {(linkedIssue || draft.importIssueId) && (
                <p className="rf-note">
                  연결된 초과 이슈는 상단 ‘조치·재점검’에서 이어 확인하세요.
                </p>
              )}
              {recent.map((r) => (
                <div className="rf-note" key={r.id}>
                  <button
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => loadImport(r)}
                  >
                    {r.title} · r{r.revision} 불러오기
                  </button>
                </div>
              ))}
            </details>
          </section>
        </section>
      </div>
    </>
  );
}
