export type SliceAxis = "x" | "y" | "z";
export type SliceState = {
  enabled: boolean;
  axis: SliceAxis;
  positions: Record<SliceAxis, number>;
  keep: "below" | "above";
  mode: "cut" | "plane";
  showPlane: boolean;
};
export type CameraView = "perspective" | "top" | "section";
export type GroundVolume = {
  id: string;
  name: string;
  color: string;
  positions: number[];
  surfaceKinds: string[];
  capPositions?: number[];
};
export const SLICE_AXES = {
  x: {
    title: "X · 남북 단면",
    coordinate: "X · 동쪽 E",
    short: "X",
    unit: "m",
  },
  y: {
    title: "Y · 동서 단면",
    coordinate: "Y · 북쪽 N",
    short: "Y",
    unit: "m",
  },
  z: { title: "Z · 수평면", coordinate: "Z · 표고 EL.", short: "Z", unit: "m" },
};
