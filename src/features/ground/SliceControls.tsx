import { useEffect, useId, useRef, useState } from "react";
import { SLICE_AXES } from "./model-view";
import type { CameraView, SliceAxis, SliceState } from "./model-view";

export function CoordinateInput({
  value,
  min,
  max,
  label,
  unit = "m",
  step = "any",
  onChange,
  onValidityChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit?: string;
  step?: number | "any";
  onChange: (n: number) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const errorId = useId();
  const [text, setText] = useState(String(value)),
    [error, setError] = useState("");
  const pending = useRef(false),
    previousValue = useRef(value),
    reportValidity = useRef(onValidityChange);
  reportValidity.current = onValidityChange;
  const validText = (candidate: string) =>
    !!candidate.trim() &&
    Number.isFinite(Number(candidate)) &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min <= max &&
    Number(candidate) >= min &&
    Number(candidate) <= max;
  const rangeError = `${min.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}~${max.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}${unit ? ` ${unit}` : ""} 범위로 입력하세요.`;
  useEffect(() => {
    const changed = !Object.is(previousValue.current, value);
    const candidate = changed ? String(value) : text;
    if (changed) {
      previousValue.current = value;
      pending.current = false;
      setText(candidate);
    }
    const valid = validText(candidate);
    setError(valid ? "" : rangeError);
    reportValidity.current?.(valid && !pending.current);
  }, [value, min, max]);
  useEffect(() => () => reportValidity.current?.(true), []);
  const commit = () => {
    const n = Number(text);
    if (!validText(text)) {
      setError(rangeError);
      reportValidity.current?.(false);
      return;
    }
    pending.current = false;
    setError("");
    onChange(n);
    reportValidity.current?.(true);
  };
  return (
    <span className="real-coordinate-input">
      <span>
        <input
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          type="number"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
            pending.current = true;
            reportValidity.current?.(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              pending.current = false;
              setText(String(value));
              const valid = validText(String(value));
              setError(valid ? "" : rangeError);
              reportValidity.current?.(valid);
            }
          }}
        />{" "}
        {unit && <b>{unit}</b>}
      </span>
      {error && (
        <small id={errorId} role="alert">
          {error}
        </small>
      )}
    </span>
  );
}

export default function SliceControls({
  slice,
  limits,
  onChange,
  cameraView,
  onCamera,
  baseElevation,
  maxBase,
  onBase,
  onValidityChange,
}: {
  slice: SliceState;
  limits: Record<SliceAxis, [number, number]>;
  onChange: (slice: SliceState) => void;
  cameraView: CameraView;
  onCamera: (view: CameraView) => void;
  baseElevation: number;
  maxBase: number;
  onBase: (value: number | null) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const reportValidity = useRef(onValidityChange),
    enabled = useRef(slice.enabled),
    validity = useRef({ position: true, base: true });
  reportValidity.current = onValidityChange;
  enabled.current = slice.enabled;
  const [positionReset, setPositionReset] = useState(0),
    [baseReset, setBaseReset] = useState(0);
  const inputValidity = (kind: "position" | "base", valid: boolean) => {
    validity.current[kind] = valid;
    reportValidity.current?.(
      (!enabled.current || validity.current.position) && validity.current.base,
    );
  };
  useEffect(() => {
    reportValidity.current?.(
      (!slice.enabled || validity.current.position) && validity.current.base,
    );
  }, [slice.enabled]);
  useEffect(() => () => reportValidity.current?.(true), []);
  const axis = slice.axis,
    value = slice.positions[axis],
    [min, max] = limits[axis];
  const setPosition = (n: number) =>
    onChange({ ...slice, positions: { ...slice.positions, [axis]: n } });
  return (
    <div className="real-slicer">
      <div className="real-slicer-top">
        <div>
          <h3>단면 탐색</h3>
        </div>
        <div
          className="real-camera-buttons"
          role="group"
          aria-label="빠른 시점 선택"
        >
          {(
            [
              ["perspective", "3D 자유 보기"],
              ["top", "위에서 보기"],
              ["section", "절단면 정면"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={cameraView === id ? "active" : ""}
              aria-pressed={cameraView === id}
              disabled={id === "section" && !slice.enabled}
              title={
                id === "section" && !slice.enabled
                  ? "X·Y·Z 단면을 선택하면 사용할 수 있습니다."
                  : undefined
              }
              onClick={() => onCamera(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="real-axis-buttons" role="group" aria-label="절단 축">
        <button
          className={!slice.enabled ? "active" : ""}
          aria-pressed={!slice.enabled}
          onClick={() => onChange({ ...slice, enabled: false })}
        >
          전체 모델
        </button>
        {(["z", "x", "y"] as const).map((id) => (
          <button
            key={id}
            className={slice.enabled && axis === id ? "active" : ""}
            aria-pressed={slice.enabled && axis === id}
            onClick={() =>
              onChange({
                ...slice,
                enabled: true,
                axis: id,
                keep: id === axis ? slice.keep : id === "z" ? "below" : "above",
              })
            }
          >
            {SLICE_AXES[id].title}
          </button>
        ))}
      </div>
      {slice.enabled && (
        <>
          <div className="real-slice-position">
            <label htmlFor="slice-position">
              {SLICE_AXES[axis].coordinate}
            </label>
            <input
              id="slice-position"
              aria-label={`${axis.toUpperCase()} 절단 위치 슬라이더`}
              type="range"
              min={min}
              max={max}
              step="any"
              value={value}
              onChange={(e) =>
                setPosition(
                  Math.min(
                    max,
                    Math.max(min, Math.round(Number(e.target.value) * 10) / 10),
                  ),
                )
              }
            />
            <CoordinateInput
              key={`${axis}:${positionReset}`}
              label={`${axis.toUpperCase()} 절단 위치 값`}
              value={value}
              min={min}
              max={max}
              onChange={setPosition}
              onValidityChange={(valid) => inputValidity("position", valid)}
            />
            <div className="real-camera-buttons">
              <button
                aria-label={`${axis.toUpperCase()} 절단 위치 중앙으로`}
                onClick={() => {
                  setPosition(Math.round(((min + max) / 2) * 100) / 100);
                  setPositionReset((n) => n + 1);
                }}
              >
                중앙으로
              </button>
            </div>
          </div>
          <div className="real-slice-options">
            <div className="real-mode-buttons" aria-label="절단 표시">
              {(
                [
                  ["cut", "절단 모델"],
                  ["plane", "단면만"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={slice.mode === id}
                  className={slice.mode === id ? "active" : ""}
                  onClick={() => onChange({ ...slice, mode: id })}
                >
                  {label}
                </button>
              ))}
            </div>
            {slice.mode === "cut" && (
              <label>
                남길 방향{" "}
                <select
                  aria-label="절단 후 남길 방향"
                  value={slice.keep}
                  onChange={(e) =>
                    onChange({
                      ...slice,
                      keep: e.target.value as SliceState["keep"],
                    })
                  }
                >
                  <option value="below">
                    {axis === "z" ? "아래쪽" : axis === "x" ? "서쪽" : "남쪽"}{" "}
                    (≤)
                  </option>
                  <option value="above">
                    {axis === "z" ? "위쪽" : axis === "x" ? "동쪽" : "북쪽"} (≥)
                  </option>
                </select>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={slice.showPlane}
                onChange={(e) =>
                  onChange({ ...slice, showPlane: e.target.checked })
                }
              />{" "}
              절단 평면 표시
            </label>
            <span>Enter 또는 다른 곳을 눌러 적용 · Esc로 입력 취소</span>
          </div>
        </>
      )}
      <details className="real-base-settings">
        <summary>암반 표시 하한 · EL. {baseElevation.toFixed(1)} m</summary>
        <div>
          <label>모델 표시 하한</label>
          <CoordinateInput
            key={baseReset}
            label="암반 모델 표시 하한 값"
            value={baseElevation}
            min={-500}
            max={maxBase}
            onChange={onBase}
            onValidityChange={(valid) => inputValidity("base", valid)}
          />
          <button
            onClick={() => {
              onBase(null);
              setBaseReset((n) => n + 1);
            }}
          >
            자동 설정
          </button>
        </div>
        <p>
          최하단 암반을 이 높이까지 표시합니다. 시추로 확인된 암반 바닥이 아닌
          시각화 범위입니다.
        </p>
      </details>
    </div>
  );
}
