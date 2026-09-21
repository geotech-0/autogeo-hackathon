export type LifecycleStage =
  | "tender"
  | "design"
  | "construction"
  | "maintenance";
export type RecordStatus =
  | "draft"
  | "pass"
  | "exceeded"
  | "pending"
  | "stale"
  | "action"
  | "closed"
  | "error";
export type DataOrigin =
  | "synthetic"
  | "measured"
  | "imported_analysis"
  | "official_reference"
  | "manual_record"
  | "calculated";
export interface ProjectRecord {
  id: string;
  site_id: string;
  zone_id: string;
  asset_id?: string;
  source_id: string;
  source_revision: string;
  stage: LifecycleStage;
  analysis_id: string;
  method_version: string;
  created_at: string;
  updated_at: string;
  revision: number;
  status: RecordStatus;
  origin: DataOrigin;
  title: string;
  summary: string;
  assumptions: string[];
  payload: Record<string, unknown>;
  dependencies?: { analysis_id: string; revision: number }[];
}
export type ProjectRecordDraft = Pick<
  ProjectRecord,
  "stage" | "title" | "status" | "summary" | "payload"
> &
  Partial<
    Omit<ProjectRecord, "stage" | "title" | "status" | "summary" | "payload">
  >;
export interface FeatureProps {
  records: ProjectRecord[];
  requestedRecordId?: string | null;
  onSave: (draft: ProjectRecordDraft) => Promise<ProjectRecord>;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
}
export { SITE } from "../data/site.mjs";
export const STATUS_LABELS: Record<RecordStatus, string> = {
  draft: "작성 중",
  pass: "검토 적합",
  exceeded: "기준 초과",
  pending: "판정 보류",
  stale: "재확인 필요",
  action: "조치 진행",
  closed: "확인 완료",
  error: "입력 확인",
};
export const STAGE_LABELS: Record<LifecycleStage, string> = {
  tender: "입찰",
  design: "설계",
  construction: "시공",
  maintenance: "유지관리",
};
