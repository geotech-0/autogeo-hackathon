import type { ProjectRecord } from "../contracts";

/** Evidence and comments belong to their own workspaces even when tagged as tender work. */
export function recordPage(record: ProjectRecord) {
  if (record.payload.kind === "standard-adoption") return "standards";
  if (record.payload.kind === "comment") return "history";
  return record.stage;
}
