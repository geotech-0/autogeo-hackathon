import { siteDate } from "../../utils/site-date.mjs";
import { useState } from "react";
import { ExternalLink, Save, AlertTriangle } from "lucide-react";
import type { FeatureProps, ProjectRecordDraft } from "../../contracts";
import { PlateChart } from "./Charts";
import {
  EMPTY_PLATE_INPUT,
  evaluatePlateInput,
  plateExample,
  plateInputRecord,
  restorePlateInput,
} from "./plate-input.mjs";
import data from "../../data/real-field/quality.json";
import {
  dcptEstimate,
  dcptReviewCalculation,
  stageEndpoints,
} from "./real-engine.mjs";
import RealChart from "./RealChart";
import { useRequestedRecord } from "./useRequestedRecord";
import { useDraft } from "../../storage/useDraft";
type TestRow = {
  stage?: string;
  time?: number;
  timestamp?: string;
  hold?: number;
  load?: number;
  planned?: number;
  correctedLoad?: number;
  pressure?: number;
  displacement?: number;
  rawGauge?: number;
  source?: string;
  penetration?: number;
  ndcpt?: number;
  nspt?: number;
  qa?: number;
};
export default function QualityReview(props: FeatureProps) {
  const [draft, setDraft, state] = useDraft("real-quality-review-v1", {
    recordId: "",
    test: "plate",
    view: "ps",
    penetration: "1.2",
    criterion: "",
    limit: "",
    note: "",
    author: "",
    holdStage: "",
    workspace: "reference",
  });
  useRequestedRecord(
    props.requestedRecordId,
    props.records,
    state.ready,
    (r) => {
      if (r.payload.kind !== "quality_reference_review") return;
      if (r.payload.plateInput) {
        setDraft((d) => ({ ...d, workspace: "user" }));
        return;
      }
      const c = r.payload.criterion as {
        description?: string;
        limitMm?: number;
      } | null;
      const calculation = r.payload.dcptCalculation as
        | { penetrationCmPerBlow?: number }
        | undefined;
      setDraft((d) => ({
        ...d,
        recordId: r.id,
        workspace: "reference",
        test: String(r.payload.datasetId || "plate"),
        view: "ps",
        criterion: c?.description || "",
        limit: c?.limitMm === undefined ? "" : String(c.limitMm),
        penetration:
          calculation?.penetrationCmPerBlow === undefined
            ? ""
            : String(calculation.penetrationCmPerBlow),
      }));
    },
  );
  const [saving, setSaving] = useState(false);
  const dataset =
    data.datasets.find((d) => d.id === draft.test) || data.datasets[0];
  const rows = dataset.rows as TestRow[];
  const isDcpt = dataset.id === "dcpt";
  const endpoints = stageEndpoints(rows);
  const change = (key: string, value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key === "test" ? { recordId: "" } : {}),
    }));
  const displacement = Math.max(
    ...rows.map((r) => Math.abs(r.displacement || 0)),
  );
  const criterionValid =
    draft.criterion.trim() &&
    draft.limit.trim() &&
    Number.isFinite(Number(draft.limit)) &&
    Number(draft.limit) > 0;
  const exceeds = criterionValid && displacement > Number(draft.limit);
  let dcpt: { ndcpt: number; nspt: number; qa: number } | null = null;
  try {
    dcpt = dcptEstimate(draft.penetration);
  } catch {
    dcpt = null;
  }
  const stages = [...new Set(rows.map((r) => r.stage))];
  const selectedStage = stages.includes(draft.holdStage)
    ? draft.holdStage
    : stages[0];
  const plotted =
    draft.view === "ps" || draft.view === "logps"
      ? endpoints
      : draft.view === "hold"
        ? rows.filter((r) => r.stage === selectedStage && (r.hold || 0) > 0)
        : rows;
  const points = isDcpt
    ? rows.map((r) => ({
        x: r.penetration!,
        y: r.qa!,
        label: `${r.penetration}cm/타`,
        detail: "제공자료 참고식 환산",
      }))
    : plotted
        .filter(
          (r) =>
            draft.view !== "logps" ||
            (((dataset.id === "plate" ? r.pressure : r.load) || 0) > 0 &&
              Math.abs(r.displacement || 0) > 0),
        )
        .map((r) => {
          const p = (dataset.id === "plate" ? r.pressure : r.load) || 0;
          const s = r.displacement || 0;
          return {
            x:
              draft.view === "time"
                ? r.time || 0
                : draft.view === "hold"
                  ? Math.log10(Math.max(r.hold || 0, 0.1))
                  : draft.view === "logps"
                    ? Math.log10(p)
                    : p,
            y: draft.view === "logps" ? Math.log10(Math.abs(s)) : s,
            label: `${r.stage} · ${r.timestamp?.slice(11) || r.time + "분"}`,
            detail: `${p}${dataset.id === "plate" ? "kPa" : "kN"} · ${dataset.id === "tension" ? `경과 ${r.time}분` : `${r.hold}분 유지`}`,
          };
        });
  async function save(issue = false) {
    setSaving(true);
    try {
      if (issue && (!draft.note.trim() || !draft.author.trim()))
        throw new Error("담당자와 이슈 내용을 입력해 주세요.");
      const calculation = isDcpt
        ? dcptReviewCalculation(draft.penetration)
        : null;
      await props.onSave({
        id: !issue && draft.recordId ? draft.recordId : undefined,
        stage: "construction",
        source_id: `quality-reference-${dataset.id}`,
        origin: "imported_analysis",
        asset_id: undefined,
        status: issue
          ? "pending"
          : criterionValid && !isDcpt && dataset.id !== "tension"
            ? exceeds
              ? "exceeded"
              : "pass"
            : "pending",
        title: `${dataset.name} · 참고자료 ${issue ? "이슈" : "검토"}`,
        summary: issue
          ? draft.note
          : `${rows.length}개 제공값 검토 · ${dataset.subtitle}`,
        assumptions: [
          ...dataset.qc,
          "이천 현장 시험 결과를 대신하지 않습니다.",
        ],
        payload: {
          kind: issue ? "real_field_issue" : "quality_reference_review",
          provenance: "provided_reference_example",
          siteApplicability: "not_confirmed",
          datasetId: dataset.id,
          source: dataset.provenance,
          sources: dataset.sources.map((id) =>
            data.sources.find((s) => s.id === id),
          ),
          rows,
          ...(calculation ? { dcptCalculation: calculation } : {}),
          criterion: criterionValid
            ? { description: draft.criterion, limitMm: Number(draft.limit) }
            : null,
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
      props.notify("참고자료 검토를 출처와 함께 저장했습니다.", "success");
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
          {state.error}
          <button onClick={state.retry}>저장된 입력 다시 불러오기</button>현재
          입력은 저장된 값으로 바뀝니다.
        </div>
      )}
      <div className="rf-controls" aria-label="품질시험 자료 선택">
        <button
          className={`btn ${draft.workspace !== "user" ? "btn-primary" : "btn-secondary"}`}
          disabled={!state.ready}
          onClick={() => change("workspace", "reference")}
        >
          제공 참고자료
        </button>
        <button
          className={`btn ${draft.workspace === "user" ? "btn-primary" : "btn-secondary"}`}
          disabled={!state.ready}
          onClick={() => change("workspace", "user")}
        >
          내 시험자료 검토
        </button>
      </div>
      {draft.workspace === "user" ? (
        <UserPlateReview {...props} />
      ) : (
        <>
          <div className="rf-quality-tabs">
            {data.datasets.map((d) => (
              <button
                key={d.id}
                disabled={!state.ready}
                onClick={() => {
                  change("test", d.id);
                  change("criterion", "");
                  change("limit", "");
                  change("view", "ps");
                }}
                className={d.id === dataset.id ? "active" : ""}
              >
                <b>{d.name}</b>
              </button>
            ))}
          </div>
          <section className="rf-card">
            <div className="rf-heading">
              <div>
                <span className="rf-eyebrow">품질시험 · 참고자료</span>
                <h2>{dataset.name}</h2>
              </div>
              <span className="badge badge-warning">
                {criterionValid && !isDcpt && dataset.id !== "tension"
                  ? exceeds
                    ? "입력 기준 초과"
                    : "입력 기준 이내"
                  : "판정 보류"}
              </span>
            </div>
            <div className="rf-warning">
              <b>
                <AlertTriangle size={16} /> 현장 적용 확인 전 참고자료
              </b>
              <p className="rf-critical-reason">
                {
                  (
                    {
                      plate:
                        "다른 현장 예시입니다. 항복·극한·허용지지력 판정 근거가 없어 현장 적용을 보류합니다.",
                      pile: "이미지 후속 행과 말뚝 제원·판정 기준이 없습니다. 허용지지력은 확정할 수 없습니다.",
                      tension:
                        "계기 단위를 확인해야 합니다. 원문 단위로 환산한 참고값이며 항복하중 판정은 보류합니다.",
                      dcpt: "실측 로그가 아닌 문헌 환산표입니다. 토질·장비·현장 상관 검증 전에는 설계값으로 사용할 수 없습니다.",
                    } as Record<string, string>
                  )[dataset.id]
                }
              </p>
            </div>
            <div className="rf-controls">
              {!isDcpt && (
                <label className="rf-label">
                  분석 보기
                  <select
                    value={draft.view}
                    onChange={(e) => change("view", e.target.value)}
                  >
                    <option value="ps">P–S 단계 종료점</option>
                    <option value="logps">log P–log |S| 참고 곡선</option>
                    <option value="time">전체 시간–변위</option>
                    {dataset.id !== "tension" && (
                      <option value="hold">단계별 S–log 유지시간</option>
                    )}
                  </select>
                </label>
              )}
              {draft.view === "hold" && (
                <label className="rf-label">
                  하중단계
                  <select
                    value={selectedStage}
                    onChange={(e) => change("holdStage", e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                disabled={!state.ready || saving}
                className="btn btn-primary"
                onClick={() => save()}
              >
                <Save size={15} /> 검토 저장
              </button>
            </div>
            <div className="rf-metrics">
              <div>
                <span>추출 수치 행</span>
                <strong>
                  {rows.length}
                  <small>개</small>
                </strong>
              </div>
              <div>
                <span>
                  {isDcpt
                    ? "문헌 적용 토질"
                    : "최대 제공 " + (dataset.id === "plate" ? "압력" : "하중")}
                </span>
                <strong>
                  {isDcpt
                    ? "사질토"
                    : Math.max(
                        ...rows.map(
                          (r) =>
                            (dataset.id === "plate" ? r.pressure : r.load) || 0,
                        ),
                      ).toFixed(2)}
                  <small>
                    {isDcpt
                      ? "확인 필요"
                      : dataset.id === "plate"
                        ? "kPa"
                        : "kN"}
                  </small>
                </strong>
              </div>
              <div>
                <span>{isDcpt ? "현장 측정값" : "최대 절대변위"}</span>
                <strong>
                  {isDcpt
                    ? "미제공"
                    : displacement.toFixed(dataset.id === "tension" ? 4 : 2)}
                  <small>{isDcpt ? "" : "mm"}</small>
                </strong>
              </div>
            </div>
            <RealChart
              points={points}
              xLabel={
                isDcpt
                  ? "관입량 (cm/타)"
                  : draft.view === "time"
                    ? "전체 경과시간 (분)"
                    : draft.view === "hold"
                      ? "log₁₀ 유지시간 (분)"
                      : draft.view === "logps"
                        ? "log₁₀ P"
                        : dataset.id === "plate"
                          ? "하중강도 (kPa)"
                          : "하중 (kN)"
              }
              yLabel={
                isDcpt
                  ? "참고 qa (kPa)"
                  : draft.view === "logps"
                    ? "log₁₀ |S|"
                    : "변위 (mm)"
              }
              invertY={
                !isDcpt && dataset.id === "plate" && draft.view !== "logps"
              }
            />
            {dataset.id === "plate" && draft.view === "time" && (
              <p className="rf-note">
                전체 경과시간은 하중단계 연결용입니다. 원문에 기록된 시험 시각이
                아닙니다.
              </p>
            )}
            <details className="rf-details rf-source-details">
              <summary>
                자료 출처·시험 조건 · 원본 {dataset.sources.length}개
              </summary>
              <p>
                {dataset.provenance} · {dataset.subtitle}
              </p>
              <ul>
                {dataset.qc.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <div className="rf-controls">
                {dataset.sources.map((id, i) => (
                  <a
                    className="btn btn-secondary"
                    key={id}
                    href={data.sources.find((s) => s.id === id)?.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> {dataset.name} 원문{" "}
                    {dataset.sources.length > 1 ? i + 1 : ""}
                  </a>
                ))}
              </div>
            </details>
            {draft.view === "hold" && (
              <p className="rf-note">
                선택한 하중단계의 양수 유지시간만 표시합니다. 0분은 로그
                차트에서 제외하며 원시표에 보존합니다. 항복 판정은 자동으로
                확정하지 않습니다.
              </p>
            )}
            {isDcpt && (
              <div className="rf-grid3">
                <label className="rf-label">
                  관입량 (cm/타)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={draft.penetration}
                    onChange={(e) => change("penetration", e.target.value)}
                  />
                </label>
                <div className="rf-note">
                  N_DCPT {dcpt?.ndcpt.toFixed(2) || "—"}
                  <br />
                  환산 N_SPT {dcpt?.nspt.toFixed(2) || "—"}
                </div>
                <div className="rf-note">
                  참고 qa {dcpt?.qa.toFixed(2) || "—"} kPa
                  <br />
                  현장 적용 판정 보류
                </div>
              </div>
            )}
            {isDcpt && (
              <p className="rf-note">
                차트·표는 원문의 반올림값, 입력 환산기는 참고식의 계산값입니다.
              </p>
            )}
            <details className="rf-details">
              <summary>
                원시 추출값 {rows.length}행 ·{" "}
                {isDcpt ? "단위와 원문 환산값 확인" : "단위와 재하/제하 확인"}
              </summary>
              <div className="rf-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {isDcpt ? (
                        <>
                          <th>cm/타</th>
                          <th>N_DCPT</th>
                          <th>N_SPT</th>
                          <th>참고 qa(kPa)</th>
                        </>
                      ) : (
                        <>
                          <th>단계</th>
                          <th>경과/시각</th>
                          <th>하중(kN)</th>
                          <th>
                            {dataset.id === "plate"
                              ? "압력(kPa)"
                              : dataset.id === "tension"
                                ? "원문 계기값(1/100mm)"
                                : "유지(분)"}
                          </th>
                          <th>변위(mm)</th>
                          <th>원문</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {isDcpt ? (
                          <>
                            <td>{r.penetration}</td>
                            <td>{r.ndcpt?.toFixed(3)}</td>
                            <td>{r.nspt?.toFixed(3)}</td>
                            <td>{r.qa?.toFixed(3)}</td>
                          </>
                        ) : (
                          <>
                            <td>{r.stage}</td>
                            <td>{r.timestamp?.slice(11) || r.time + "분"}</td>
                            <td>{r.load}</td>
                            <td>
                              {dataset.id === "plate"
                                ? r.pressure
                                : dataset.id === "tension"
                                  ? r.rawGauge
                                  : r.hold}
                            </td>
                            <td>
                              {r.displacement?.toFixed(
                                dataset.id === "tension" ? 4 : 2,
                              )}
                            </td>
                            <td>
                              <a
                                href={
                                  data.sources.find((s) => s.id === r.source)
                                    ?.url
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                이미지 ↗
                              </a>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {!isDcpt && (
              <details className="rf-details">
                <summary>확인한 변위 관리기준으로 비교</summary>
                <p className="rf-note">
                  재하량에 대한 허용지지력 판정이 아닌, 제공 구간 최대
                  절대변위와 입력 관리기준의 비교입니다.
                </p>
                <div className="rf-grid2">
                  <label className="rf-label">
                    기준 이름·원문 근거
                    <input
                      value={draft.criterion}
                      onChange={(e) => change("criterion", e.target.value)}
                    />
                  </label>
                  <label className="rf-label">
                    허용 절대변위 (mm)
                    <input
                      type="number"
                      step="any"
                      value={draft.limit}
                      onChange={(e) => change("limit", e.target.value)}
                    />
                  </label>
                </div>
              </details>
            )}
            <details className="rf-details">
              <summary>자료 확인 이슈 등록</summary>
              <div className="rf-grid2">
                <label className="rf-label">
                  담당자
                  <input
                    value={draft.author}
                    onChange={(e) => change("author", e.target.value)}
                  />
                </label>
                <label className="rf-label">
                  이슈 내용
                  <input
                    value={draft.note}
                    onChange={(e) => change("note", e.target.value)}
                  />
                </label>
              </div>
              <button
                className="btn btn-primary"
                disabled={saving || !state.ready}
                onClick={() => save(true)}
              >
                조치 이력에 등록
              </button>
            </details>
          </section>
        </>
      )}
    </>
  );
}

function UserPlateReview(props: FeatureProps) {
  const [draft, setDraft, state] = useDraft("user-plate-input-v1", {
    ...EMPTY_PLATE_INPUT,
  });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(2);
  const [view, setView] = useState("pressure");
  const [error, setError] = useState("");
  useRequestedRecord(
    props.requestedRecordId,
    props.records,
    state.ready,
    (record) => {
      if (
        record.payload.kind !== "quality_reference_review" ||
        !record.payload.plateInput
      )
        return;
      try {
        setDraft(restorePlateInput(record));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "입력 복원 실패");
      }
    },
  );
  const result = evaluatePlateInput(draft);
  const row =
    result.rows.find((r) => r.rowNumber === selected) || result.rows[0];
  const change = (key: string, value: string | boolean) => {
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(["csv", "mode", "diameterMm", "sourceName"].includes(key)
        ? { confirmed: false }
        : {}),
    }));
    setError("");
  };
  async function save(issue = false) {
    if (!state.ready || saving) return;
    setSaving(true);
    setError("");
    try {
      const record = await props.onSave(
        plateInputRecord(draft, issue) as ProjectRecordDraft,
      );
      if (!issue) setDraft((d) => ({ ...d, recordId: record.id }));
      props.notify(
        issue
          ? "시험 확인 이슈를 조치·재점검에 등록했습니다."
          : "CSV 원본과 검토 조건을 저장했습니다.",
        "success",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }
  const number = (v: number | null | undefined, digits = 3) =>
    v !== null && v !== undefined && Number.isFinite(v)
      ? v.toLocaleString("ko-KR", { maximumFractionDigits: digits })
      : "—";
  return (
    <section className="rf-card">
      <div className="rf-heading">
        <div>
          <span className="rf-eyebrow">사용자 CSV · 평판재하</span>
          <h2>내 시험자료 검토</h2>
        </div>
        <span
          className={`badge ${result.status === "exceeded" || result.status === "error" ? "badge-danger" : result.status === "pass" ? "badge-success" : "badge-warning"}`}
        >
          {result.status === "error"
            ? "입력 확인"
            : result.status === "pending"
              ? "판정 보류"
              : result.status === "exceeded"
                ? "입력 기준 초과"
                : "입력 기준 이내"}
        </span>
      </div>
      <p className="rf-note">
        {draft.example
          ? "검증용 합성 예제입니다. 이천 현장의 시험 결과가 아닙니다."
          : "직접 가져온 시험자료입니다. 제공 참고자료와 별도로 보존합니다."}{" "}
        최대 침하와 입력 관리기준만 비교하며 허용지지력을 확정하지 않습니다.
      </p>
      {state.error && (
        <div className="rf-warning">
          {state.error}
          <button onClick={state.retry}>저장된 입력 다시 불러오기</button>현재
          입력은 저장된 값으로 바뀝니다.
        </div>
      )}
      {error && (
        <p className="rf-error" role="alert">
          {error}
        </p>
      )}
      <fieldset
        disabled={!state.ready || saving}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="rf-grid2">
          <label className="rf-label">
            시험 이름
            <input
              value={draft.title}
              onChange={(e) => change("title", e.target.value)}
              placeholder="시험 위치·번호"
            />
          </label>
          <label className="rf-label">
            원본·출처 이름
            <input
              value={draft.sourceName}
              onChange={(e) => change("sourceName", e.target.value)}
              placeholder="파일명 또는 시험 원장명"
            />
          </label>
        </div>
        <div className="rf-controls">
          <label className="rf-upload">
            CSV 불러오기
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 1024 * 1024)
                    throw new Error("1 MB 이하 CSV를 선택해 주세요.");
                  const csv = await file.text();
                  setDraft((d) => ({
                    ...d,
                    csv,
                    title: d.title || file.name,
                    sourceName: file.name,
                    example: "",
                    confirmed: false,
                    recordId: "",
                  }));
                  setError("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "CSV 읽기 실패");
                }
              }}
            />
          </label>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setDraft({ ...EMPTY_PLATE_INPUT });
              setError("");
            }}
          >
            새 시험 입력
          </button>
        </div>
        <details className="rf-details" open={!draft.csv.trim()}>
          <summary>CSV 내용·형식 확인</summary>
          <p className="rf-note">
            머리글: time_min,stage,
            {draft.mode === "load" ? "load_kN" : "pressure_kPa"},settlement_mm
            <br />
            시간은 경과 분, 침하는 mm, 단계는 재하·유지·제하입니다. 선택한
            하중·압력 단위로 변환한 CSV를 넣으세요.
          </p>
          <textarea
            aria-label="평판재하 CSV"
            rows={6}
            value={draft.csv}
            onChange={(e) => change("csv", e.target.value)}
          />
        </details>
        <div className="rf-grid3">
          <label className="rf-label">
            CSV 하중·압력 단위
            <select
              value={draft.mode}
              onChange={(e) => change("mode", e.target.value)}
            >
              <option value="load">하중 load_kN · kN</option>
              <option value="pressure">압력 pressure_kPa · kPa</option>
            </select>
          </label>
          <label className="rf-label">
            원형 재하판 직경 (mm)
            <input
              type="number"
              min="0"
              step="any"
              value={draft.diameterMm}
              onChange={(e) => change("diameterMm", e.target.value)}
            />
          </label>
          <div className="rf-note">
            재하판 면적
            <br />
            <strong>{number(result.area, 6)} m²</strong>
            <br />A = πD²/4 · D는 m로 환산
          </div>
        </div>
        <div className="rf-grid2">
          <label className="rf-label">
            최대 침하 관리기준 (mm)
            <input
              type="number"
              min="0"
              step="any"
              value={draft.limitMm}
              onChange={(e) => change("limitMm", e.target.value)}
              placeholder="미설정 시 판정 보류"
            />
          </label>
          <label className="rf-label">
            관리기준 이름·근거
            <input
              value={draft.criterion}
              onChange={(e) => change("criterion", e.target.value)}
              placeholder="현장 기준·문서·페이지"
            />
          </label>
        </div>
        <label className="rf-label rf-resolution-confirmation">
          <span>
            <input
              type="checkbox"
              checked={draft.confirmed}
              onChange={(e) => change("confirmed", e.target.checked)}
            />
            출처·CSV 단위·재하판 제원을 확인했습니다.
          </span>
        </label>
        {!draft.confirmed && (
          <p className="rf-warning">
            출처·단위·재하판 제원 확인 전에는 판정을 보류합니다.
          </p>
        )}
        {(!draft.limitMm.trim() || !draft.criterion.trim()) && (
          <p className="rf-note">
            관리기준 수치와 근거가 모두 있어야 기준 이내·초과를 비교합니다.
          </p>
        )}
        {draft.csv.trim() && result.errors.length > 0 && (
          <div className="rf-warning" role="alert">
            <b>
              입력 오류 {result.errors.length}건 · 수정 전 저장할 수 없습니다.
            </b>
            {result.errors.slice(0, 12).map((message, i) => (
              <p key={i}>{message}</p>
            ))}
            {result.errors.length > 12 && (
              <p>나머지 오류는 원시 행에서 확인하세요.</p>
            )}
          </div>
        )}
        {draft.csv.trim() && (
          <>
            <div className="rf-grid3">
              <div className="rf-note">
                행 검수
                <strong>
                  {" "}
                  {result.validCount} / {result.totalCount}
                </strong>
              </div>
              <div className="rf-note">
                최대 침하<strong> {number(result.maxSettlement)} mm</strong>
              </div>
              <div className="rf-note">
                최대 압력<strong> {number(result.maxPressure)} kPa</strong>
              </div>
            </div>
            <div className="rf-controls">
              <button
                className={`btn ${view === "pressure" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("pressure")}
              >
                압력–침하
              </button>
              <button
                className={`btn ${view === "time" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setView("time")}
              >
                시간–침하
              </button>
            </div>
            {view === "pressure" ? (
              <PlateChart
                rows={result.rows}
                limit={result.limit}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <RealChart
                points={result.rows
                  .filter((r) => !r.problems.length)
                  .map((r) => ({
                    x: r.time!,
                    y: r.settlement!,
                    label: `${r.rowNumber}행 · ${r.stage}`,
                    detail: `${r.time}분 · ${number(r.pressure)}kPa`,
                  }))}
                xLabel="경과시간 (분)"
                yLabel="침하 (mm)"
                invertY
              />
            )}
            {row && (
              <div className="rf-note">
                선택한 원시 {row.rowNumber}행 · {row.time}분 · {row.stage} ·{" "}
                {number(row.load)} kN · {number(row.pressure)} kPa ·{" "}
                {number(row.settlement)} mm
                {row.problems.length > 0 && (
                  <b className="rf-error"> · {row.problems.join(" / ")}</b>
                )}
              </div>
            )}
            <details className="rf-details">
              <summary>원시 행·단위 환산 확인 · {result.totalCount}행</summary>
              <div className="rf-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>CSV 행</th>
                      <th>시간(분)</th>
                      <th>단계</th>
                      <th>
                        원시 {draft.mode === "load" ? "하중(kN)" : "압력(kPa)"}
                      </th>
                      <th>하중(kN)</th>
                      <th>압력(kPa)</th>
                      <th>침하(mm)</th>
                      <th>검수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr
                        key={r.rowNumber}
                        onClick={() => setSelected(r.rowNumber)}
                      >
                        <td>{r.rowNumber}</td>
                        <td>{r.raw.time_min}</td>
                        <td>{r.stage}</td>
                        <td>
                          {
                            r.raw[
                              draft.mode === "load" ? "load_kN" : "pressure_kPa"
                            ]
                          }
                        </td>
                        <td>{number(r.load)}</td>
                        <td>{number(r.pressure)}</td>
                        <td>{r.raw.settlement_mm}</td>
                        <td>{r.problems.join(" / ") || "확인"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        <div className="rf-controls">
          <button
            className="btn btn-primary"
            disabled={result.errors.length > 0}
            onClick={() => save()}
          >
            <Save size={16} />
            {saving
              ? "저장 중…"
              : draft.recordId
                ? "CSV 검토 개정 저장"
                : "CSV 검토 저장"}
          </button>
        </div>
        <details className="rf-details">
          <summary>시험 확인 이슈 등록</summary>
          <div className="rf-grid2">
            <label className="rf-label">
              이슈 담당자
              <input
                value={draft.author}
                onChange={(e) => change("author", e.target.value)}
              />
            </label>
            <label className="rf-label">
              시험 이슈 내용
              <input
                value={draft.note}
                onChange={(e) => change("note", e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn btn-secondary"
            disabled={result.errors.length > 0}
            onClick={() => save(true)}
          >
            시험 이슈를 조치·재점검에 등록
          </button>
        </details>
        <details className="rf-details">
          <summary>합성 데이터로 입력 형식 살펴보기</summary>
          <p className="rf-note">
            소프트웨어 확인용 예제입니다. 실제 시험자료와 구분하여 저장합니다.
          </p>
          <div className="rf-controls">
            {[
              ["normal", "기준 이내"],
              ["exceeded", "기준 초과"],
              ["pending", "기준 미설정"],
              ["invalid", "입력 오류"],
            ].map(([key, label]) => (
              <button
                key={key}
                className="btn btn-secondary"
                onClick={() => {
                  setDraft(plateExample(key));
                  setError("");
                }}
              >
                예제 · {label}
              </button>
            ))}
          </div>
        </details>
      </fieldset>
    </section>
  );
}
