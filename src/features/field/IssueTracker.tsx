import { useState } from "react";
import { useRequestedRecord } from "./useRequestedRecord";
import type { FeatureProps, ProjectRecord } from "../../contracts";
import { nextIssue } from "./real-engine.mjs";
const labels: Record<string, string> = {
  identified: "이상 확인",
  action: "조치",
  reinspection: "재점검",
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
  });
  const [saving, setSaving] = useState(false);
  const issues = records.filter((r) => r.payload.kind === "real_field_issue");
  const current = issues.find((r) => r.id === selected) || issues[0];
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
  async function advance(record: ProjectRecord) {
    setSaving(true);
    try {
      const next = nextIssue(payload, event);
      await onSave({
        ...record,
        status: next.lifecycle === "reinspection" ? "closed" : "action",
        summary: event.note,
        payload: { ...record.payload, ...next },
      });
      setEvent((p) => ({ ...p, note: "" }));
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
          {payload?.lifecycle !== "reinspection" ? (
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
                  onChange={(e) =>
                    setEvent({ ...event, author: e.target.value })
                  }
                />
              </label>
              <label className="rf-label">
                수행 내용
                <input
                  value={event.note}
                  onChange={(e) => setEvent({ ...event, note: e.target.value })}
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => advance(current)}
              >
                {payload?.lifecycle === "identified"
                  ? "조치 기록"
                  : "재점검 결과 기록 및 마감"}
              </button>
            </div>
          ) : (
            <p className="rf-note">
              재점검 기록까지 보존되었습니다. 통합 이력에서 개정별 기록을 확인할
              수 있습니다.
            </p>
          )}
        </>
      )}
    </section>
  );
}
