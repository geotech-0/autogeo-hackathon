import { useMemo, useState } from "react";
import { ExternalLink, Save, AlertTriangle, Upload } from "lucide-react";
import type { FeatureProps, RecordStatus } from "../../contracts";
import { STATUS_LABELS } from "../../contracts";
import data from "../../data/real-field/monitoring.json";
import {
  evaluateSensor,
  monitoringMetric,
  parseAdditionalReadings,
  monitoringProvenance,
} from "./real-engine.mjs";
import { useDraft } from "../../storage/useDraft";
import RealChart from "./RealChart";
import { useRequestedRecord } from "./useRequestedRecord";
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
export default function RealMonitoring(props: FeatureProps) {
  const [draft, setDraft, state] = useDraft("real-monitoring-v1", {
    recordId: "",
    sensor: "F-2",
    month: "all",
    metric: "delta",
    importCsv: "date,value\n",
    importSource: "",
    manualDate: "",
    manualValue: "",
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
      setDraft((d) => ({
        ...d,
        recordId: r.payload.kind === "real_monitoring_review" ? r.id : "",
        sensor: String(r.payload.sensorId || r.asset_id || "F-2"),
        month: String(r.payload.period || "all"),
        metric: "delta",
        ...(r.payload.kind === "monitoring_import"
          ? {
              importCsv: String(r.payload.rawCsv || "date,value\n"),
              importSource: String(r.payload.source || ""),
            }
          : {}),
      }));
    },
  );
  const [selectedRow, setSelectedRow] = useState<number | null>(null),
    [saving, setSaving] = useState(false),
    [showAll, setShowAll] = useState(false);
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
  const csv = parseAdditionalReadings(draft.importCsv);
  const recent = props.records.filter(
    (r) => r.payload.kind === "monitoring_import" && r.asset_id === sensor.id,
  );
  const change = (key: string, value: string) => {
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key === "sensor" ? { recordId: "", metric: "delta" } : {}),
    }));
    if (["sensor", "month"].includes(key)) {
      setSelectedRow(null);
      setShowAll(false);
    }
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
      await props.onSave({
        id: !issue && draft.recordId ? draft.recordId : undefined,
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
                    date: new Date().toISOString().slice(0, 10),
                    author: draft.author,
                    note: draft.note,
                  },
                ],
              }
            : {}),
        },
      });
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
  async function saveImport() {
    setSaving(true);
    try {
      if (csv.errors.length || !draft.importSource.trim())
        throw new Error("원본 이름과 유효한 CSV를 확인해 주세요.");
      await props.onSave({
        stage: "construction",
        asset_id: sensor.id,
        source_id: `manual-${sensor.id}`,
        origin: "measured",
        status: "pending",
        title: `${sensor.id} 추가 계측 ${csv.rows.length}행`,
        summary: "추가 원본·측정 단위·기준 적용 검토 대기",
        payload: {
          kind: "monitoring_import",
          sensorId: sensor.id,
          unit:
            sensor.kind === "SE"
              ? "m"
              : sensor.kind === "F"
                ? "m³"
                : sensor.unit,
          source: draft.importSource,
          rows: csv.rows,
          rawCsv: draft.importCsv,
          criteriaConfirmed: false,
        },
        assumptions: [
          "월간보고서 원시값에 합치지 않은 추가 측정 기록입니다. 원본·단위 확인 후 별도 검토가 필요합니다.",
        ],
      });
      props.notify("추가 기록을 판정 보류로 저장했습니다.", "success");
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
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
                      disabled={!state.ready}
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
        <main className="rf-monitor-main">
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
            <div className="rf-note">
              {sensor.kind === "INC"
                ? "심도별 변위 중 절댓값 최대값을 날짜별 대표값으로 표시합니다."
                : sensor.kind === "F"
                  ? "원시표 일간 변화량을 표시합니다. 누적 계기값의 차이를 측정 간격으로 나눠 교차 확인합니다."
                  : "표는 원문의 부호와 단위를 보존하며, 관리기준 비교 차트는 변화량 절댓값을 표시합니다."}{" "}
              기준선은 문서값이며 미확인 항목은 판정을 보류합니다.
              {sensor.kind === "INC" &&
                " 토사/암반 속도기준은 적용 구간 미확인으로 별도 확인이 필요하며, 화면 판정은 누적기준 검토 범위입니다."}
            </div>
          </section>
          <section className="rf-card">
            <div className="rf-heading">
              <h2>원시값과 근거</h2>
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
                        <a href={r.source.url} target="_blank" rel="noreferrer">
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
          </section>
          <section className="rf-card">
            <details>
              <summary>수동 입력·CSV 추가 계측 등록</summary>
              <p className="rf-note">
                {sensor.id} 원시 측정 단위:{" "}
                {sensor.kind === "SE"
                  ? "m (표고)"
                  : sensor.kind === "F"
                    ? "m³ (누적 계기값)"
                    : sensor.unit}
                . 보고서의 과거 기록과 분리하여 보존합니다.
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
              {csv.errors.map((e) => (
                <p className="rf-error" key={e}>
                  {e}
                </p>
              ))}
              {csv.rows.length > 0 && (
                <RealChart
                  points={csv.rows.map((r) => ({
                    x: Date.parse(r.date),
                    y: r.value,
                    label: r.date,
                    detail: "추가 입력 · 단위 확인 대기",
                  }))}
                  xLabel="측정 날짜"
                  yLabel={
                    sensor.kind === "SE"
                      ? "m"
                      : sensor.kind === "F"
                        ? "m³"
                        : sensor.unit
                  }
                />
              )}
              <button
                className="btn btn-primary"
                disabled={saving || csv.errors.length > 0 || !state.ready}
                onClick={saveImport}
              >
                추가 {csv.rows.length}행 보류 저장
              </button>
              {recent.map((r) => (
                <div className="rf-note" key={r.id}>
                  {r.title} · {String(r.payload.source)} · r{r.revision}
                </div>
              ))}
            </details>
          </section>
        </main>
      </div>
    </>
  );
}
