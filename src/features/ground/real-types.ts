export type RealLayer = {
  name: string;
  from: number;
  to: number;
  bottomConfirmed: boolean;
};
export type RealHole = {
  id: string;
  label: string;
  campaign: string;
  easting: number;
  northing: number;
  sourceX: number;
  sourceY: number;
  collar: number;
  declaredTotalDepth: number;
  observedBottom: number;
  layers: RealLayer[];
  sourceId: string;
  coordinatePage: number;
  layerPage: number;
  logPages: number[];
  logImages?: string[];
  coordinatePrecision: number;
  sourceVisualCheck: boolean;
  qc: string[];
  origin: string;
  frameId: string;
};
export type Prediction = {
  value: number;
  variance: number;
  weightSum: number;
  extrapolated: boolean;
};
export type RealPoint = { e: number; n: number; values: (Prediction | null)[] };
export type RealGrid = {
  nx: number;
  ny: number;
  bounds: number[];
  points: RealPoint[];
};
export type RealHorizon = {
  id: string;
  name: string;
  color: string;
  sampleCount: number;
  error: string | null;
};
export type Terrain = {
  boundsEN: number[];
  nx: number;
  ny: number;
  heights: (number | null)[];
  captureDate: string | null;
  verticalDatumConfirmed: boolean;
};
