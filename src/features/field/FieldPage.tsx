import { useState } from "react";
import { useRequestedRecord } from "./useRequestedRecord";
import { Activity, ClipboardCheck, Map, GitBranch } from "lucide-react";
import type { FeatureProps } from "../../contracts";
import RealMonitoring from "./RealMonitoring";
import QualityReview from "./QualityReview";
import ImageComparison from "./ImageComparison";
import IssueTracker from "./IssueTracker";
import "./field.css";
import "./real-field.css";
export default function FieldPage(props: FeatureProps) {
  const [tab, setTab] = useState("monitoring");
  useRequestedRecord(props.requestedRecordId, props.records, true, (r) => {
    const kind = r.payload.kind;
    setTab(
      kind === "real_field_issue"
        ? "issues"
        : kind === "quality_reference_review"
          ? "quality"
          : kind === "real_image_annotation" || kind === "additional_orthophoto"
            ? "imagery"
            : "monitoring",
    );
  });
  return (
    <div className="rf-page">
      <header className="rf-page-heading">
        <div>
          <span className="rf-eyebrow">이천자이더리체</span>
          <h1>시공 · 품질 관리</h1>
          <p>27개 계측기 · 월간보고서 3권 · 품질시험 참고자료 4종</p>
        </div>
        <span className="rf-live-label">제공 자료 기준 · 실시간 연동 없음</span>
      </header>
      <nav className="rf-tabs" aria-label="시공 검토 메뉴">
        {[
          { id: "monitoring", label: "실측 계측", Icon: Activity },
          { id: "quality", label: "품질시험 검토", Icon: ClipboardCheck },
          { id: "imagery", label: "현장 영상", Icon: Map },
          { id: "issues", label: "조치·재점검", Icon: GitBranch },
        ].map(({ id, label, Icon }) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      {tab === "monitoring" ? (
        <RealMonitoring {...props} />
      ) : tab === "quality" ? (
        <QualityReview {...props} />
      ) : tab === "imagery" ? (
        <ImageComparison {...props} />
      ) : (
        <IssueTracker {...props} />
      )}
    </div>
  );
}
