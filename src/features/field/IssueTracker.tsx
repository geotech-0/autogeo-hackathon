import { useEffect, useState } from "react";
import { useRequestedRecord } from "./useRequestedRecord";
import type { FeatureProps, ProjectRecord } from "../../contracts";
import { nextIssue } from "./real-engine.mjs";
const labels: Record<string, string> = {
  identified: "이상 확인",
  action: "조치",
  reinspection: "재점검",
  closed: "해결 확인 · 마감",
};
export default function IssueTracker({
  records,
  onSave,
  notify,
  requestedRecordId,
}: FeatureProps) {
  const [selected, setSelected] = useState<string>("");
  useRequestedRecord(requestedRecordId, records, true, (r) =>
    setSelected(r.id),
  );
  const [event, setEvent] = useState({
    date: new Date().toISOString().slice(0, 10),
    author: "",
    note: "",
    resolved: false,
  });
  const [saving, setSaving] = useState(false);
  const issues = records.filter((r) => r.payload.kind === "real_field_issue");
  const current = issues.find((r) => r.id === selected) || issues[0];
  useEffect(() => {
    setEvent((previous) => ({ ...previous, note: "", resolved: false }));
  }, [current?.id]);
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
    setSaving(true);
    try {
      const next = nextIssue(payload, event, target);
      await onSave({
        ...record,
        status: next.lifecycle === "closed" ? "closed" : "action",
        summary: event.note,
        payload: { ...record.payload, ...next },
      });
      setEvent((p) => ({ ...p, note: "", resolved: false }));
      notify("조치 이력을 저장했습니다.", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "저장 실패", "error");
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
              onChange={(e) => setSelected(e.target.value)}
            >
              {issues.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · r{r.revision}
                </option>
              ))}
            </select>
          </label>
          <ol className="rf-history">
            {payload?.history.map((h, i) => (
              <li key={i}>
                <b>
                  {labels[h.stage]} · {h.date}
                </b>
                <p>{h.note}</p>
                <small>{h.author}</small>
              </li>
            ))}
          </ol>
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
          <div className="rf-grid3">
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
                onChange={(e) => setEvent({ ...event, author: e.target.value })}
              />
            </label>
            <label className="rf-label">
              수행 내용
              <input
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
          <div className="rf-controls rf-issue-controls">
            {payload?.lifecycle === "identified" ? (
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => advance(current, "action")}
              >
                조치 기록
              </button>
            ) : payload?.lifecycle === "action" ? (
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => advance(current, "reinspection")}
              >
                재점검 결과 기록
              </button>
            ) : (
              <>
                <button
                  className="btn btn-secondary"
                  disabled={saving}
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
                      disabled={saving}
                      onClick={() => advance(current, "reinspection")}
                    >
                      재점검 기록 추가
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={saving || !event.resolved}
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
