import { siteDate } from "../../utils/site-date.mjs";
import { useEffect, useState } from "react";
import { useDraft } from "../../storage/useDraft";
import { useRequestedRecord } from "./useRequestedRecord";
import type { FeatureProps, ProjectRecord } from "../../contracts";
import { nextIssue } from "./real-engine.mjs";
const labels: Record<string, string> = {
  identified: "이상 확인",
  action: "조치",
  reinspection: "재점검",
  closed: "해결 확인 · 마감",
};
type IssueEvent = {
  date: string;
  author: string;
  note: string;
  resolved: boolean;
};
const emptyEvent = (): IssueEvent => ({
  date: siteDate(),
  author: "",
  note: "",
  resolved: false,
});
type IssueDraft = { selected: string; events: Record<string, IssueEvent> };
export default function IssueTracker({
  records,
  onSave,
  notify,
  requestedRecordId,
}: FeatureProps) {
  const [draft, setDraft, draftState] = useDraft<IssueDraft>(
    "real-issue-actions-v1",
    { selected: "", events: {} },
  );
  useRequestedRecord(requestedRecordId, records, draftState.ready, (r) => {
    if (r.payload.kind === "real_field_issue")
      setDraft((d) => ({ ...d, selected: r.id }));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const issues = records.filter((r) => r.payload.kind === "real_field_issue");
  const current = issues.find((r) => r.id === draft.selected) || issues[0];
  const event = current
    ? draft.events[current.id] || emptyEvent()
    : emptyEvent();
  const setEvent = (next: IssueEvent) => {
    if (!current) return;
    setDraft((d) => ({ ...d, events: { ...d.events, [current.id]: next } }));
    setError("");
  };
  useEffect(() => setError(""), [current?.id]);
  const payload = current?.payload as
    | {
        lifecycle: string;
        history: {
          stage: string;
          date: string;
          author: string;
          note: string;
        }[];
      }
    | undefined;
  async function advance(record: ProjectRecord, target: string) {
    if (!draftState.ready || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = nextIssue(record.payload, event, target);
      await onSave({
        ...record,
        status: next.lifecycle === "closed" ? "closed" : "action",
        summary: event.note,
        payload: { ...record.payload, ...next },
      });
      setDraft((d) => ({
        ...d,
        events: {
          ...d.events,
          [record.id]: { ...event, note: "", resolved: false },
        },
      }));
      notify("조치 이력을 저장했습니다.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "저장 실패";
      setError(message);
      notify(message, "error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rf-card">
      <div className="rf-heading">
        <div>
          <span className="rf-eyebrow">ACTION LOG</span>
          <h2>확인한 문제를 끝까지 추적</h2>
        </div>
        <span className="badge badge-neutral">{issues.length}건</span>
      </div>
      {draftState.error && (
        <div className="rf-warning" role="alert">
          {draftState.error}
          <button onClick={draftState.retry}>저장된 입력 다시 불러오기</button>
          현재 입력은 저장된 값으로 바뀝니다.
        </div>
      )}
      {!current ? (
        <div className="rf-empty">
          계측·품질·영상 검토에서 이슈를 등록하면 확인 → 조치 → 재점검 이력이
          연결됩니다.
        </div>
      ) : (
        <>
          <label className="rf-label">
            이슈 선택
            <select
              value={current.id}
              disabled={!draftState.ready || saving}
              onChange={(e) =>
                setDraft((d) => ({ ...d, selected: e.target.value }))
              }
            >
              {issues.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · r{r.revision}
                </option>
              ))}
            </select>
          </label>
          <div className="rf-issue-latest">
            <span className="badge badge-neutral">
              {labels[payload?.lifecycle || ""] || "이상 확인"}
            </span>
            {payload?.history.at(-1) && (
              <>
                <p>{payload.history.at(-1)!.note}</p>
                <small>
                  {payload.history.at(-1)!.date} ·{" "}
                  {payload.history.at(-1)!.author}
                </small>
              </>
            )}
          </div>
          <details className="rf-details">
            <summary>전체 조치 이력 · {payload?.history.length || 0}건</summary>
            <ol className="rf-history">
              {payload?.history.map((h, i) => (
                <li key={i}>
                  <b>
                    {labels[h.stage] || h.stage} · {h.date}
                  </b>
                  <p>{h.note}</p>
                  <small>{h.author}</small>
                </li>
              ))}
            </ol>
          </details>
          {current.status === "closed" && (
            <p className="rf-note">
              마감된 기록입니다. 추가 확인이 필요하면 후속 조치를 기록해 다시 열
              수 있습니다.
            </p>
          )}
          {payload?.lifecycle === "reinspection" &&
            current.status !== "closed" && (
              <p className="rf-note">
                재점검 결과가 기록되었습니다. 미해결이면 후속 조치·재점검을
                이어가고, 해결 확인 후 별도로 마감하세요.
              </p>
            )}
          <h3 className="rf-action-title">
            {current.status === "closed"
              ? "추가 확인 기록"
              : payload?.lifecycle === "action"
                ? "재점검 결과 입력"
                : "다음 조치 입력"}
          </h3>
          {error && (
            <p className="rf-error" role="alert">
              {error}
            </p>
          )}
          <fieldset
            disabled={!draftState.ready || saving}
            className="rf-action-fields"
          >
            <div className="rf-grid2">
              <label className="rf-label">
                수행일
                <input
                  type="date"
                  value={event.date}
                  onChange={(e) => setEvent({ ...event, date: e.target.value })}
                />
              </label>
              <label className="rf-label">
                담당자
                <input
                  value={event.author}
                  onChange={(e) =>
                    setEvent({ ...event, author: e.target.value })
                  }
                />
              </label>
              <label className="rf-label rf-action-note">
                수행 내용
                <textarea
                  rows={3}
                  value={event.note}
                  onChange={(e) => setEvent({ ...event, note: e.target.value })}
                />
              </label>
              {payload?.lifecycle === "reinspection" &&
                current.status !== "closed" && (
                  <label className="rf-label rf-resolution-confirmation">
                    <span>
                      <input
                        type="checkbox"
                        checked={event.resolved}
                        onChange={(e) =>
                          setEvent({ ...event, resolved: e.target.checked })
                        }
                      />{" "}
                      재점검 결과 문제 해결을 확인했습니다
                    </span>
                  </label>
                )}
            </div>
          </fieldset>
          <p className="rf-note">
            작성 중인 내용은 이 이슈의 초안으로 보관됩니다. 아래 버튼을 눌러
            조치 이력을 저장하세요.
          </p>
          <div className="rf-controls rf-issue-controls">
            {payload?.lifecycle === "identified" ? (
              <button
                className="btn btn-primary"
                disabled={!draftState.ready || saving}
                onClick={() => advance(current, "action")}
              >
                조치 기록
              </button>
            ) : payload?.lifecycle === "action" ? (
              <button
                className="btn btn-primary"
                disabled={!draftState.ready || saving}
                onClick={() => advance(current, "reinspection")}
              >
                재점검 결과 기록
              </button>
            ) : (
              <>
                <button
                  className="btn btn-secondary"
                  disabled={!draftState.ready || saving}
                  onClick={() => advance(current, "action")}
                >
                  {current.status === "closed"
                    ? "후속 조치로 다시 열기"
                    : "후속 조치 기록"}
                </button>
                {current.status !== "closed" && (
                  <>
                    <button
                      className="btn btn-secondary"
                      disabled={!draftState.ready || saving}
                      onClick={() => advance(current, "reinspection")}
                    >
                      재점검 기록 추가
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={!draftState.ready || saving || !event.resolved}
                      onClick={() => advance(current, "closed")}
                    >
                      해결 확인 후 마감
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
