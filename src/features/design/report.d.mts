import type { Workspace } from "./model.mjs";
export function makeReport(
  state: Workspace,
  createdAt?: string,
  sourceBase?: string,
  includeOriginalLinks?: boolean,
): string;
