import type { ProjectRecordDraft } from "../../contracts";
export type MemberId = "anchor" | "wale" | "pile" | "timber";
export type Field = {
  key: string;
  label: string;
  unit: string;
  value: number;
  group: "geometry" | "analysis" | "advanced";
  min?: number;
  max?: number;
  step?: number;
  affectsAnalysis?: boolean;
  units?: string[];
  stage?: string;
  location?: string;
  direction?: string;
  absolute?: boolean;
};
export type Module = {
  id: MemberId;
  title: string;
  subtitle: string;
  asset: string;
  material: string;
  scope: string;
  fields: Field[];
  fixed: Record<string, number>;
  fixedRows: string[][];
  limitations: string[];
};
export type QuantityMeta = {
  unit: string;
  stage: string;
  location: string;
  direction: string;
  aggregation: string;
  evidence: string;
  origin?: string;
  sourceId?: string;
  sourceRevision?: string;
};
export type MemberState = {
  values: Record<string, string>;
  quantities: Record<string, QuantityMeta>;
  revision: number;
  confirmedGeometry: string;
  origins?: Record<string, string>;
};
export type Workspace = {
  schemaVersion: 2;
  presetId?: string;
  label: string;
  source: {
    origin: "synthetic" | "imported_analysis";
    id: string;
    revision: string;
    label: string;
    program: string;
    modelId: string;
    modelRevision: string;
    programVersion: string;
    runDate: string;
    combination: string;
    enteredBy: string;
    evidence: string;
    quEvidence: string;
  };
  members: Record<MemberId, MemberState>;
};
export type Check = {
  key: string;
  label: string;
  value: number;
  limit: number;
  unit: string;
  relation: string;
  pass: boolean;
  utilization: number | null;
};
export type Step = {
  key: string;
  title: string;
  formula: string;
  substitution: string;
  value: number;
  unit: string;
};
export type Quantity = {
  value: number;
  rawValue: number;
  rawUnit: string;
  unit: string;
  basis: string;
  conversion: string;
  stage: string;
  location: string;
  direction: string;
  aggregation: string;
  evidence: string;
  origin?: string;
  sourceId?: string;
  sourceRevision?: string;
};
export type Calculation = {
  ok: boolean;
  errors?: Record<string, string>;
  input: Record<string, number>;
  results: Record<string, number>;
  checks: Check[];
  steps: Step[];
  warnings: string[];
  status: "error" | "stale" | "exceeded" | "pass";
  quantities: Record<string, Quantity>;
  dependencies: {
    member: string;
    revision: number;
    fingerprint: string;
    value: number;
    unit: string;
  }[];
  fingerprint: string;
  maxUtilization: number | null;
  member: MemberId;
};
export const VERSION: string;
export const MEMBER_IDS: MemberId[];
export const MODULES: Record<MemberId, Module>;
export function digest(value: unknown): string;
export function finiteNumber(value: unknown): number | null;
export function geometrySignature(
  id: MemberId,
  member: MemberState,
  revision: string,
): string;
export function createWorkspace(): Workspace;
export function updateValue(
  state: Workspace,
  id: MemberId,
  key: string,
  value: string,
): Workspace;
export function updateQuantity(
  state: Workspace,
  id: MemberId,
  key: string,
  patch: Partial<QuantityMeta>,
): Workspace;
export function confirmGeometry(state: Workspace, id: MemberId): Workspace;
export function computeMember(
  state: Workspace,
  id: MemberId,
  anchorResult?: Calculation,
): Calculation;
export function computeWorkspace(
  state: Workspace,
): Record<MemberId, Calculation>;
export function restoreWorkspace(raw: unknown): Workspace;
export function makeDesignDraft(state: Workspace): ProjectRecordDraft;
export function exportDesign(state: Workspace): string;
export function importDesign(text: string): Workspace;
export function comparisonRows(
  a: Workspace,
  b: Workspace,
): {
  id: MemberId;
  title: string;
  before: number | null;
  after: number | null;
  beforeStatus: string;
  afterStatus: string;
  changed: string[];
}[];

export type RealSection = {
  id: string;
  label: string;
  method: string;
  supported: boolean;
  pages: number[];
  drawingPage: number;
  description: string;
  sectionPage?: number;
  maximumPage?: number;
  depth?: number;
  wallDepth?: number;
  anchorLevels?: number;
  issue?: string;
  summary?: string;
};
export type RealPreset = {
  id: string;
  sectionId: string;
  level: number;
  label: string;
  inputs: Record<MemberId, Record<string, number>>;
  pages: Record<MemberId, number[]>;
  printed: Record<MemberId, { key: string; unit: string; printed: number }[]>;
  notes: string[];
  verification: string;
  sourceRevision: string;
};
export const REAL_DESIGN: {
  source: {
    id: string;
    revision: string;
    label: string;
    url: string;
    drawingUrl: string;
    pages: number;
    drawingPages: number;
  };
  sections: RealSection[];
  additionalReviews: {
    label: string;
    pages: number[];
    description: string;
    summary?: string;
  }[];
  presets: RealPreset[];
};
export function getPreset(state: Workspace): RealPreset | null;
export function getSection(state: Workspace): RealSection | null;
export function getModule(state: Workspace, id: MemberId): Module;
export function createRealWorkspace(presetId?: string): Workspace;
export function sourceComparison(
  state: Workspace,
  id: MemberId,
): {
  key: string;
  unit: string;
  printed: number;
  current: number;
  difference: number;
  page: number;
  changed: boolean;
}[];

export const RESULT_LABELS: Record<string, string>;
