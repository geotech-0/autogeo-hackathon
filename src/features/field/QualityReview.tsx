import { useState } from "react";
import { ExternalLink, Save, AlertTriangle } from "lucide-react";
import type { FeatureProps } from "../../contracts";
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
  });
  useRequestedRecord(
    props.requestedRecordId,
    props.records,
    state.ready,
    (r) => {
      if (r.payload.kind !== "quality_reference_review") return;
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
                    date: new Date().toISOString().slice(0, 10),
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
                {isDcpt ? "확인 필요" : dataset.id === "plate" ? "kPa" : "kN"}
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
          invertY={!isDcpt && dataset.id === "plate" && draft.view !== "logps"}
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
            선택한 하중단계의 양수 유지시간만 표시합니다. 0분은 로그 차트에서
            제외하며 원시표에 보존합니다. 항복 판정은 자동으로 확정하지
            않습니다.
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
                              data.sources.find((s) => s.id === r.source)?.url
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
              재하량에 대한 허용지지력 판정이 아닌, 제공 구간 최대 절대변위와
              입력 관리기준의 비교입니다.
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
  );
}
